-- =============================================================================
-- T-061: import_jobs audit table
-- =============================================================================
-- One row per Excel import attempt — created when the operator uploads + previews
-- (status='previewed'), updated to 'committed' or 'failed' after the confirm
-- step. The full preview payload (errors, warnings, summary, auto_create lists)
-- is stored as jsonb so we have a complete record of every import attempt
-- without coupling to the consignments audit log. See D-037.

create table public.import_jobs (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          references auth.users(id) on delete set null,
  filename          text,
  status            text          not null check (status in ('previewed','committed','failed')),
  parsed_count      int           not null default 0,
  errors_count      int           not null default 0,
  warnings_count    int           not null default 0,
  inserted_count    int           not null default 0,
  payload           jsonb,
  created_at        timestamptz   not null default now(),
  committed_at      timestamptz
);

create index import_jobs_user_id_idx       on public.import_jobs (user_id);
create index import_jobs_created_at_idx    on public.import_jobs (created_at desc);

comment on table public.import_jobs is
  'Audit row per Excel import attempt. payload carries the parser output '
  '(errors/warnings/summary) and auto-created clients/ICDs. See D-037.';

-- Audit trigger (logs every change to audit_log, same shape as other tables)
create trigger import_jobs_audit
  after insert or update or delete on public.import_jobs
  for each row execute function public.log_table_change();

-- RLS -----------------------------------------------------------------------
alter table public.import_jobs enable row level security;

-- SELECT: admins see all; operators see their own only.
create policy import_jobs_select_admin on public.import_jobs
  for select to authenticated
  using (public.is_admin());

create policy import_jobs_select_own on public.import_jobs
  for select to authenticated
  using (user_id = auth.uid());

-- INSERT: admin + operator may create import jobs (only as themselves).
create policy import_jobs_insert_role on public.import_jobs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = auth.uid() and r.name = 'operator'
      )
    )
  );

-- UPDATE: the same user who created the row (preview → commit transition).
-- Admins may update any row (e.g. to mark a stuck previewed job as failed).
create policy import_jobs_update_own on public.import_jobs
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- No DELETE policy — import jobs are append-only.
