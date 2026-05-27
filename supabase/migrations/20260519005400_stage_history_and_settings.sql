-- =============================================================================
-- T-016 + T-017: stage_history table + audit triggers on remaining tables
-- =============================================================================

-- stage_history: every pipeline stage advancement, one row per change ---------
-- Written exclusively by advance_stage() (T-021). Never written by app code.
create table public.stage_history (
  id              bigserial     primary key,
  consignment_id  uuid          not null references public.consignments(id) on delete cascade,
  stage           public.pipeline_stage not null,
  from_value      text,         -- old enum value as text (null on first set)
  to_value        text          not null,
  reason          text,         -- for force_set_stage() admin overrides
  is_forced       boolean       not null default false,
  actor_id        uuid          references auth.users(id) on delete set null,
  actor_email     text,
  occurred_at     timestamptz   not null default now()
);

-- Primary query pattern: all stage changes for a consignment, newest first.
create index stage_history_consignment_idx
  on public.stage_history (consignment_id, occurred_at desc);

-- For the stuck_stages view: find stage_history entries newer than threshold.
create index stage_history_stage_idx
  on public.stage_history (consignment_id, stage, occurred_at desc);

-- For the global "what happened in the last N hours" audit.
create index stage_history_when_idx
  on public.stage_history (occurred_at desc);

comment on table public.stage_history is
  'Append-only log of every pipeline stage change. Written by advance_stage() only. '
  'Used by stuck_stages view (48h threshold) and the turnaround time reports.';

-- RLS -----------------------------------------------------------------------
alter table public.stage_history enable row level security;

-- Read: any authenticated user.
create policy stage_history_select
  on public.stage_history for select to authenticated using (true);

-- Write: blocked via RLS (advance_stage is security definer — bypasses RLS).
-- No insert/update/delete policies means RLS blocks direct writes.

-- Attach audit trigger to tables not yet covered ----------------------------
-- consignments and efd_records already have the trigger from their own migrations.
-- We need it on: guta_pairs, efd_record_consignments, stage_history.

-- stage_history is append-only — we audit it only on INSERT (anomaly if edited).
create trigger stage_history_audit
  after insert on public.stage_history
  for each row execute function public.log_table_change();

-- Settings table (needed by stuck_stages view in T-023) --------------------
-- A single-row config table for system-wide parameters.
create table public.settings (
  id                      integer       primary key default 1 check (id = 1),  -- singleton
  stuck_threshold_hours   integer       not null default 48,
  alert_email_enabled     boolean       not null default true,
  updated_at              timestamptz   not null default now(),
  updated_by              uuid          references auth.users(id) on delete set null
);

-- Seed the singleton row.
insert into public.settings (stuck_threshold_hours, alert_email_enabled)
values (48, true);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

comment on table public.settings is
  'Singleton system config (enforced by CHECK id = 1). '
  'stuck_threshold_hours drives the stuck_stages view.';

-- RLS -----------------------------------------------------------------------
alter table public.settings enable row level security;

create policy settings_read_authenticated
  on public.settings for select to authenticated using (true);

create policy settings_write_admin
  on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
