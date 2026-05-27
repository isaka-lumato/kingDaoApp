-- =============================================================================
-- T-012: consignments table
-- =============================================================================
-- Every field from PRD §5.1 (core) and §5.2 (pipeline statuses).
-- No triggers yet — stage_history and advance_stage come in later migrations.

create table public.consignments (
  -- Identity ----------------------------------------------------------------
  id                      uuid              primary key default gen_random_uuid(),
  ref_no                  text              not null,
  year                    smallint          not null check (year >= 2020 and year <= 2099),
  serial_no               integer,          -- S/N within year, managed by app

  -- Core fields (PRD §5.1) --------------------------------------------------
  tansad_no               text,             -- nullable until TANESWS done
  client_id               uuid              not null references public.clients(id) on delete restrict,
  bl_number               text,             -- nullable for cars (RoRo)
  container_count         numeric(8,2)      not null default 1 check (container_count > 0),
  container_type          public.container_type not null,
  goods_description       text,
  vessel_name             text,
  arrival_date            date,             -- null = vessel not yet docked
  icd_id                  uuid              references public.icds(id) on delete restrict,
  in_ref                  text,             -- billing batch ref, e.g. "TZ3"; null for PRIVATE/TRANSIT

  -- Financial ---------------------------------------------------------------
  amount                  integer           check (amount is null or amount >= 0),  -- TZS, null until quoted

  -- GUTA pair link (PRD §8.15, D-011) --------------------------------------
  -- Two records in a pair each store the OTHER's id here (self-referential).
  -- Circular FK resolved by deferring: set during first insert, updated on second.
  guta_pair_id            uuid,             -- FK added after table creation below

  -- SHARED duty link (PRD §8.9) --------------------------------------------
  -- When tbs_debit_status = 'SHARED', this points to the primary payer.
  shared_with_consignment_id uuid,          -- FK added after table creation below

  -- Remarks & flags (PRD §8.17) --------------------------------------------
  remarks                 text,
  is_failed               boolean           not null default false,
  is_waiting_registration boolean           not null default false,
  is_refund_pending       boolean           not null default false,
  is_shared               boolean           not null default false,

  -- Pipeline statuses (PRD §5.2) -------------------------------------------
  manifest_status         public.manifest_status         not null default 'Waiting',
  shipping_batch_status   public.shipping_batch_status   not null default 'Waiting',
  current_status          text,             -- freeform, PRD §5.2
  tanesws_status          public.tanesws_status          not null default 'Waiting',
  assessment_status       public.assessment_status       not null default 'Waiting',
  tbs_loading_status      public.tbs_loading_status      not null default 'Waiting',
  tbs_debit_status        public.tbs_debit_status        not null default 'Waiting',
  manifest_comp_status    public.manifest_comp_status    not null default 'Waiting',
  duty_status             public.duty_status             not null default 'Waiting',
  inspection_file_status  public.inspection_file_status  not null default 'Waiting',
  release_status          public.release_status          not null default 'Waiting',
  release_date            date,             -- set when release_status = 'Released'

  -- Housekeeping ------------------------------------------------------------
  updated_by              uuid              references auth.users(id) on delete set null,
  created_at              timestamptz       not null default now(),
  updated_at              timestamptz       not null default now(),
  deleted_at              timestamptz       -- soft-delete; null = active
);

-- Self-referential FKs (deferred so pairs can be inserted without ordering) --
alter table public.consignments
  add constraint consignments_guta_pair_fk
    foreign key (guta_pair_id) references public.consignments(id)
    on delete set null
    deferrable initially deferred;

alter table public.consignments
  add constraint consignments_shared_with_fk
    foreign key (shared_with_consignment_id) references public.consignments(id)
    on delete set null
    deferrable initially deferred;

-- Uniqueness constraints (PRD §5, §8.2) ------------------------------------
-- ref_no is unique per year among active records.
create unique index consignments_ref_no_year_uq
  on public.consignments (ref_no, year)
  where deleted_at is null;

-- bl_number must be unique per year (PRD §8.2). Cars may omit it (null ok).
create unique index consignments_bl_year_uq
  on public.consignments (bl_number, year)
  where deleted_at is null and bl_number is not null;

-- Performance indexes -------------------------------------------------------
create index consignments_client_idx      on public.consignments (client_id)     where deleted_at is null;
create index consignments_icd_idx         on public.consignments (icd_id)        where deleted_at is null;
create index consignments_year_idx        on public.consignments (year)           where deleted_at is null;
create index consignments_in_ref_idx      on public.consignments (in_ref, client_id, year) where deleted_at is null and in_ref is not null;
create index consignments_arrival_idx     on public.consignments (arrival_date)  where deleted_at is null;
create index consignments_release_idx     on public.consignments (release_status, release_date) where deleted_at is null;
create index consignments_vessel_idx      on public.consignments (vessel_name, arrival_date) where deleted_at is null;
create index consignments_guta_pair_idx   on public.consignments (guta_pair_id)  where guta_pair_id is not null;

-- Triggers ------------------------------------------------------------------
create trigger consignments_set_updated_at
  before update on public.consignments
  for each row execute function public.set_updated_at();

create trigger consignments_audit
  after insert or update or delete on public.consignments
  for each row execute function public.log_table_change();

-- Comments ------------------------------------------------------------------
comment on table  public.consignments is 'Core operational table. One row per import consignment. Soft-delete only.';
comment on column public.consignments.ref_no is 'Internal job reference, e.g. 9900001. Unique per year.';
comment on column public.consignments.in_ref is 'Billing batch identifier (e.g. TZ3). All consignments with same in_ref+client_id+year share one EFD code. NULL for PRIVATE/TRANSIT.';
comment on column public.consignments.guta_pair_id is 'Self-referential FK to the sibling of a GUTA PARTS / FRAMES pair. Both records point to each other.';
comment on column public.consignments.shared_with_consignment_id is 'When tbs_debit_status=SHARED, points to the primary payer consignment.';
comment on column public.consignments.amount is 'Service fee in TZS. NULL until quoted. Soft range validated by app layer per PRD §7.3.';
comment on column public.consignments.is_failed is 'Parsed from remarks = FAILED. Drives dashboard flag.';
comment on column public.consignments.is_refund_pending is 'Parsed from remarks containing PAID, REFUND NEEDED.';

-- RLS -----------------------------------------------------------------------
alter table public.consignments enable row level security;

-- SELECT: any authenticated user (viewer+) can read non-deleted rows.
-- Deleted rows: only admins.
create policy consignments_select
  on public.consignments for select to authenticated
  using (
    deleted_at is null
    or public.is_admin()
  );

-- INSERT: operators and admins.
create policy consignments_insert
  on public.consignments for insert to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and r.name in ('admin', 'operator')
    )
  );

-- UPDATE: operators and admins; per-column restrictions enforced by
-- advance_stage() and can_user_write() — UI + server action layer.
create policy consignments_update
  on public.consignments for update to authenticated
  using (
    deleted_at is null
    and (
      public.is_admin()
      or exists (
        select 1 from public.user_roles ur
        join public.roles r on r.id = ur.role_id
        where ur.user_id = (select auth.uid())
          and r.name in ('admin', 'operator')
      )
    )
  )
  with check (true);

-- DELETE: blocked for all (soft delete only — set deleted_at via UPDATE).
-- No delete policy = RLS blocks all hard deletes.
