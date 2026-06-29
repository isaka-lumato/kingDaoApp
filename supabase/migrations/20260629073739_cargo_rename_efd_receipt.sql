-- =============================================================================
-- D-059 / D-060: Cargo rename, cargo-type enum expansion, EFD receipt column
-- =============================================================================
-- The business clears more than containers (machinery, loose, bulk cargo), so
-- the "container" naming was too narrow. This migration:
--   1. Expands the cargo-type enum with MACHINERY_VEHICLE, LOOSE, BULK.
--   2. Renames the enum type container_type → cargo_type.
--   3. Renames consignments.container_type → cargo_type and
--      consignments.container_count → cargo_count. Dependent views, the
--      check constraint, and indexes auto-track column renames.
--   4. Adds consignments.efd_receipt_no (text, nullable) — a lightweight
--      per-consignment TRA receipt number, independent of the efd_records M:M.
--   5. Fixes role_column_permissions so the per-column write guard
--      (consignments_enforce_column_write) keeps matching live column names,
--      and seeds efd_receipt_no perms (operator write, viewer read-only).
--   6. Re-emits the seed_* helper functions with corrected column names.
--
-- See decisions.md D-059, D-060. Earlier migration files are append-only and
-- left untouched per CLAUDE.md.

-- ─── 1. Expand the enum (values unused in this tx → safe under PG17) ──────────
alter type public.container_type add value if not exists 'MACHINERY_VEHICLE';
alter type public.container_type add value if not exists 'LOOSE';
alter type public.container_type add value if not exists 'BULK';

-- ─── 2. Rename the enum type ─────────────────────────────────────────────────
alter type public.container_type rename to cargo_type;

-- ─── 3. Rename the columns (constraint + indexes follow automatically) ───────
alter table public.consignments rename column container_type  to cargo_type;
alter table public.consignments rename column container_count to cargo_count;

-- ─── 4. New EFD receipt column ───────────────────────────────────────────────
alter table public.consignments add column if not exists efd_receipt_no text;

comment on column public.consignments.efd_receipt_no is
  'D-060: Per-consignment TRA EFD receipt number entered on the consignment '
  'form. Lightweight free-text field, independent of the efd_records M:M system.';

-- ─── 5. Keep role_column_permissions aligned with the live column names ──────
-- The column-write guard compares the changed column name against
-- can_user_write(''consignments'', k). Stale rows would lock operators out.
update public.role_column_permissions
   set column_name = 'cargo_type'
 where table_name = 'consignments' and column_name = 'container_type';

update public.role_column_permissions
   set column_name = 'cargo_count'
 where table_name = 'consignments' and column_name = 'container_count';

-- Seed efd_receipt_no perms: operator can write, viewer read-only.
do $$
declare
  v_operator uuid;
  v_viewer   uuid;
begin
  select id into v_operator from public.roles where name = 'operator';
  select id into v_viewer   from public.roles where name = 'viewer';

  insert into public.role_column_permissions
    (role_id, table_name, column_name, can_read, can_write)
  values (v_operator, 'consignments', 'efd_receipt_no', true, true)
  on conflict (role_id, table_name, column_name)
    do update set can_read = excluded.can_read, can_write = excluded.can_write;

  insert into public.role_column_permissions
    (role_id, table_name, column_name, can_read, can_write)
  values (v_viewer, 'consignments', 'efd_receipt_no', true, false)
  on conflict (role_id, table_name, column_name)
    do update set can_read = excluded.can_read, can_write = excluded.can_write;
end $$;

-- ─── 6. Re-emit seed helpers with corrected column names + efd_receipt_no ────
create or replace function public.seed_operator_consignment_perms()
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  col text;
  writable_columns constant text[] := array[
    'ref_no', 'tansad_no', 'bl_number', 'cargo_count', 'cargo_type',
    'goods_description', 'vessel_name', 'arrival_date', 'icd_id', 'in_ref',
    'efd_receipt_no', 'remarks',
    'manifest_status', 'shipping_batch_status', 'current_status',
    'tanesws_status', 'assessment_status', 'tbs_loading_status',
    'tbs_debit_status', 'manifest_comp_status', 'duty_status',
    'inspection_file_status', 'release_status', 'release_date',
    'shared_with_consignment_id'
  ];
  all_columns constant text[] := writable_columns || array[
    'amount', 'client_id', 'year', 'serial_no', 'id',
    'created_at', 'updated_at', 'updated_by', 'deleted_at', 'guta_pair_id'
  ];
begin
  select id into v_role_id from public.roles where name = 'operator';

  foreach col in array all_columns loop
    insert into public.role_column_permissions (role_id, table_name, column_name, can_read, can_write)
    values (
      v_role_id, 'consignments', col,
      true,
      col = any(writable_columns)
    )
    on conflict (role_id, table_name, column_name) do nothing;
  end loop;
end;
$$;

create or replace function public.seed_viewer_consignment_perms()
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  col text;
  all_columns constant text[] := array[
    'id', 'ref_no', 'tansad_no', 'year', 'serial_no', 'client_id', 'bl_number',
    'cargo_count', 'cargo_type', 'goods_description', 'vessel_name',
    'arrival_date', 'icd_id', 'in_ref', 'efd_receipt_no', 'amount', 'remarks',
    'manifest_status', 'shipping_batch_status', 'current_status',
    'tanesws_status', 'assessment_status', 'tbs_loading_status',
    'tbs_debit_status', 'manifest_comp_status', 'duty_status',
    'inspection_file_status', 'release_status', 'release_date',
    'shared_with_consignment_id', 'guta_pair_id',
    'created_at', 'updated_at', 'updated_by', 'deleted_at'
  ];
begin
  select id into v_role_id from public.roles where name = 'viewer';

  foreach col in array all_columns loop
    insert into public.role_column_permissions (role_id, table_name, column_name, can_read, can_write)
    values (v_role_id, 'consignments', col, true, false)
    on conflict (role_id, table_name, column_name) do nothing;
  end loop;
end;
$$;
