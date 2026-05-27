-- =============================================================================
-- T-014: efd_records + efd_record_consignments join table
-- =============================================================================
-- PRD §5.3. One EFD record can cover many consignments (shared in_ref batch).
-- Many consignments can theoretically have multiple EFD records (re-issue edge case).
-- Implementation: efd_records ← efd_record_consignments → consignments (M:M).

create table public.efd_records (
  id              uuid          primary key default gen_random_uuid(),
  efd_code        text          not null,     -- receipt number, "PRIVATE", or "TRANSIT"
  efd_time        time,                        -- time of issuance (nullable)
  is_private      boolean       not null default false,   -- CAR imports
  is_transit      boolean       not null default false,   -- transit cargo
  is_shared       boolean       not null default false,   -- shared across in_ref batch
  notes           text,
  created_by      uuid          references auth.users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index efd_records_code_idx on public.efd_records (efd_code);

create trigger efd_records_set_updated_at
  before update on public.efd_records
  for each row execute function public.set_updated_at();

create trigger efd_records_audit
  after insert or update or delete on public.efd_records
  for each row execute function public.log_table_change();

comment on table public.efd_records is
  'Tanzania Revenue Authority EFD receipt records. One record per fiscal receipt. '
  'Linked to one or many consignments via efd_record_consignments.';
comment on column public.efd_records.efd_code is
  'TRA receipt number (e.g. 03429118), or the sentinel values PRIVATE or TRANSIT.';
comment on column public.efd_records.efd_time is
  'Time of EFD issuance (after conversion from Excel decimal fraction).';

-- Join table: one EFD record ↔ many consignments ----------------------------
create table public.efd_record_consignments (
  efd_record_id   uuid          not null references public.efd_records(id)   on delete cascade,
  consignment_id  uuid          not null references public.consignments(id)  on delete restrict,
  linked_at       timestamptz   not null default now(),
  linked_by       uuid          references auth.users(id) on delete set null,
  primary key (efd_record_id, consignment_id)
);

create index efc_consignment_idx on public.efd_record_consignments (consignment_id);

comment on table public.efd_record_consignments is
  'M:M join between EFD records and consignments. '
  'Deleting a consignment is restricted when it has EFD links (protect fiscal records). '
  'Deleting an EFD record cascades to remove its links but leaves consignments intact.';

-- RLS -----------------------------------------------------------------------
alter table public.efd_records             enable row level security;
alter table public.efd_record_consignments enable row level security;

-- efd_records: read by any authenticated; write by operator+.
create policy efd_records_select
  on public.efd_records for select to authenticated using (true);

create policy efd_records_insert
  on public.efd_records for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.name in ('admin','operator')
    )
  );

create policy efd_records_update
  on public.efd_records for update to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.name in ('admin','operator')
    )
  )
  with check (true);

create policy efd_records_delete
  on public.efd_records for delete to authenticated
  using (public.is_admin());

-- efd_record_consignments: same rules.
create policy efc_select
  on public.efd_record_consignments for select to authenticated using (true);

create policy efc_insert
  on public.efd_record_consignments for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid()) and r.name in ('admin','operator')
    )
  );

create policy efc_delete
  on public.efd_record_consignments for delete to authenticated
  using (public.is_admin());
