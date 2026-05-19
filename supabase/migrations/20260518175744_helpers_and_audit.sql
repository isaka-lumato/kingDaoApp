-- =============================================================================
-- Foundation: shared helper functions, audit log, and the generic audit trigger
-- =============================================================================
-- See decisions.md D-013 (audit log via triggers), D-025 (audit log shape).

-- Required extensions ---------------------------------------------------------
create extension if not exists pgcrypto;  -- for gen_random_uuid()

-- Helper: updated_at trigger --------------------------------------------------
-- Attach to any table with an `updated_at` column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Audit log -------------------------------------------------------------------
-- Field-level change log. One row per changed column. Append-only — no UPDATE
-- or DELETE policy is ever written. See validation.md V-AUDIT.
create table public.audit_log (
  id               bigserial   primary key,
  table_name       text        not null,
  row_id           uuid        not null,
  column_name      text        not null,  -- '_inserted', '_deleted', or a column name
  old_value        jsonb,
  new_value        jsonb,
  actor_id         uuid,                  -- references auth.users(id), nullable for system writes
  actor_email      text,
  occurred_at      timestamptz not null default now()
);

create index audit_log_row_idx     on public.audit_log (table_name, row_id, occurred_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, occurred_at desc);
create index audit_log_when_idx    on public.audit_log (occurred_at desc);

comment on table  public.audit_log is 'Append-only field-level audit. Written by log_table_change() trigger. Never UPDATEd or DELETEd.';
comment on column public.audit_log.column_name is 'A real column name, or one of the sentinels: _inserted, _deleted.';

-- Generic audit trigger -------------------------------------------------------
-- Attach with:  create trigger <name> after insert or update or delete
--               on <table> for each row execute function public.log_table_change();
create or replace function public.log_table_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id    uuid;
  v_actor_email text;
  v_row_id      uuid;
  k             text;
  old_val       jsonb;
  new_val       jsonb;
begin
  -- Best-effort actor capture. JWT may be absent for system writes (cron edge fns).
  begin
    v_actor_id := (auth.uid())::uuid;
  exception when others then
    v_actor_id := null;
  end;
  begin
    v_actor_email := (auth.jwt() ->> 'email');
  exception when others then
    v_actor_email := null;
  end;

  if (TG_OP = 'INSERT') then
    v_row_id := (to_jsonb(NEW) ->> 'id')::uuid;
    insert into public.audit_log
      (table_name, row_id, column_name, old_value, new_value, actor_id, actor_email)
    values
      (TG_TABLE_NAME, v_row_id, '_inserted', null, to_jsonb(NEW), v_actor_id, v_actor_email);
    return NEW;
  end if;

  if (TG_OP = 'DELETE') then
    v_row_id := (to_jsonb(OLD) ->> 'id')::uuid;
    insert into public.audit_log
      (table_name, row_id, column_name, old_value, new_value, actor_id, actor_email)
    values
      (TG_TABLE_NAME, v_row_id, '_deleted', to_jsonb(OLD), null, v_actor_id, v_actor_email);
    return OLD;
  end if;

  -- UPDATE: emit one row per actually-changed column.
  v_row_id := (to_jsonb(NEW) ->> 'id')::uuid;
  for k in select jsonb_object_keys(to_jsonb(NEW))
  loop
    old_val := to_jsonb(OLD) -> k;
    new_val := to_jsonb(NEW) -> k;
    if old_val is distinct from new_val then
      insert into public.audit_log
        (table_name, row_id, column_name, old_value, new_value, actor_id, actor_email)
      values
        (TG_TABLE_NAME, v_row_id, k, old_val, new_val, v_actor_id, v_actor_email);
    end if;
  end loop;
  return NEW;
end;
$$;

comment on function public.log_table_change is 'Generic audit trigger. Writes one audit_log row per changed column on UPDATE, one sentinel row on INSERT/DELETE.';

-- audit_log RLS ---------------------------------------------------------------
-- Reads: any authenticated user (operators need to see history).
-- Writes: nobody (only the trigger writes via security definer).
alter table public.audit_log enable row level security;

create policy audit_log_read_authenticated
  on public.audit_log
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies — RLS blocks everything else by default.
