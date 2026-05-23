-- =============================================================================
-- T-053: stuck_alerts table + claim_new_stuck_alerts() function
-- =============================================================================
-- Tracks which (consignment_id, stage) pairs have already been emailed to
-- admins, so the 30-min alerts edge function doesn't spam the same job every
-- run. See D-031 (dedup model) and D-032 (digest per admin).
--
-- Lifecycle:
--   1. A consignment × stage enters the v_stuck_stages view (Action ≥ 48h).
--   2. claim_new_stuck_alerts() INSERT ... ON CONFLICT DO NOTHING into this
--      table and returns only the rows it just inserted (RETURNING). Idempotent.
--   3. The edge function emails admins the returned digest.
--   4. When the stage advances (advance_stage / force_set_stage), it emits a
--      stage_history row with to_value <> 'Action'. The next claim_new_stuck_alerts
--      run sees no matching v_stuck_stages row and never re-claims.
--   5. If the stage re-enters Action later and crosses 48h again, the (cid, stage)
--      pair has its alerted_at refreshed via the `resolved_at` reset path (see
--      reset_resolved_stuck_alerts() below).

create table public.stuck_alerts (
  consignment_id  uuid          not null references public.consignments(id) on delete cascade,
  stage           public.pipeline_stage not null,
  alerted_at      timestamptz   not null default now(),
  -- When the stage is advanced out of Action, this is stamped so the same
  -- (cid, stage) can be alerted again on the next stuck cycle.
  resolved_at     timestamptz,
  primary key (consignment_id, stage)
);

create index stuck_alerts_alerted_at_idx
  on public.stuck_alerts (alerted_at desc);

comment on table public.stuck_alerts is
  'Dedup ledger for the 30-min alerts edge function. One row per '
  '(consignment_id, stage) that has been emailed. Reset by '
  'reset_resolved_stuck_alerts() once the stage exits Action.';

-- RLS -----------------------------------------------------------------------
alter table public.stuck_alerts enable row level security;

-- Read: any authenticated user (admins may want to see what's been alerted).
create policy stuck_alerts_select
  on public.stuck_alerts for select to authenticated using (true);

-- Write: blocked via RLS. Only the SECURITY DEFINER functions below mutate it.
-- (The edge function calls them with the service role anyway.)

-- =============================================================================
-- claim_new_stuck_alerts() — atomic claim + return new alerts
-- =============================================================================
-- Returns rows that are CURRENTLY stuck AND have not yet been alerted (or have
-- been resolved since the last alert).
--
-- Implementation:
--   INSERT into stuck_alerts SELECT FROM v_stuck_stages
--   ON CONFLICT (consignment_id, stage) DO NOTHING
--   RETURNING *
--
-- This is atomic — two concurrent invocations cannot return the same row.
-- The trick: after a resolution, reset_resolved_stuck_alerts() DELETEs the row,
-- so the next stuck cycle re-inserts (and returns) it.

create or replace function public.claim_new_stuck_alerts()
returns table (
  consignment_id  uuid,
  ref_no          text,
  year            integer,
  client_name     text,
  vessel_name     text,
  stage           public.pipeline_stage,
  stuck_value     text,
  stuck_since     timestamptz,
  hours_stuck     numeric
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with new_claims as (
    insert into public.stuck_alerts as sa (consignment_id, stage)
    select v.consignment_id, v.stage::public.pipeline_stage
    from public.v_stuck_stages v
    on conflict (consignment_id, stage) do nothing
    returning sa.consignment_id, sa.stage
  )
  select
    v.consignment_id,
    v.ref_no,
    v.year,
    v.client_name,
    v.vessel_name,
    v.stage::public.pipeline_stage,
    v.stuck_value,
    v.stuck_since,
    v.hours_stuck
  from public.v_stuck_stages v
  join new_claims nc
    on nc.consignment_id = v.consignment_id
   and nc.stage::text     = v.stage::text;
$$;

comment on function public.claim_new_stuck_alerts() is
  'Atomically marks each currently-stuck (cid, stage) as alerted and returns '
  'only the newly-claimed rows. Called by the alerts edge function every 30 min.';

-- =============================================================================
-- reset_resolved_stuck_alerts() — clear ledger for stages that exited Action
-- =============================================================================
-- A (cid, stage) is "resolved" when it no longer appears in v_stuck_stages
-- (because the stage was advanced or the consignment was released). Deleting
-- the ledger row lets future stuck cycles trigger a fresh alert.

create or replace function public.reset_resolved_stuck_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  delete from public.stuck_alerts sa
  where not exists (
    select 1
    from public.v_stuck_stages v
    where v.consignment_id = sa.consignment_id
      and v.stage::text     = sa.stage::text
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.reset_resolved_stuck_alerts() is
  'Clears stuck_alerts rows whose (cid, stage) no longer appears in '
  'v_stuck_stages, so the next stuck cycle can alert again. Called by the '
  'alerts edge function before claim_new_stuck_alerts() on each run.';
