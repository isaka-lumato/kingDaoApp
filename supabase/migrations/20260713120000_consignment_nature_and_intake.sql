-- =============================================================================
-- D-071: Consignment Nature + intake fields (New-Consignments bucket, drop-popups)
-- =============================================================================
-- Adds:
--   1. enum consignment_nature (Import / Export / Transit)
--   2. consignments.consignment_nature   (not null, default 'Import')
--   3. consignments.estimated_arrival_date (nullable) — the ETA captured at
--      creation. Distinct from arrival_date, which is the ACTUAL arrival set at
--      the Manifest drop-popup. Keeping them separate preserves the existing
--      "arrival_date null => card is New/Waiting" rule (PRD §7.2) and the §8.1
--      "arrival_date required before terminal states" guard in advance_stage().
--   4. consignments.ucr_no (nullable text) — customs UCR, captured at the Duty
--      Application drop-popup.
--   5. role_column_permissions seed so operators may write the 3 new columns
--      through the BEFORE UPDATE column-write guard (migration 20260525090000);
--      without a seed row the guard would 42501 the popup writes.
--
-- Nature drives the Transit/Export TBS skip enforced in the companion migration
-- 20260713120500_advance_stage_nature_and_intake.sql.
--
-- See decisions.md D-071. Idempotent throughout (safe to replay on prod push).

-- ─── 1. The nature enum ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'consignment_nature') then
    create type public.consignment_nature as enum ('Import', 'Export', 'Transit');
  end if;
end $$;

-- ─── 2. New columns ──────────────────────────────────────────────────────────
alter table public.consignments
  add column if not exists consignment_nature public.consignment_nature not null default 'Import',
  add column if not exists estimated_arrival_date date,
  add column if not exists ucr_no text;

comment on column public.consignments.consignment_nature is
  'D-071: Import (full pipeline) / Export / Transit (skip TBS Applications + TBS Debit). Default Import — historical + imported rows.';
comment on column public.consignments.estimated_arrival_date is
  'D-071: ETA captured at consignment creation. Actual arrival lands in arrival_date at the Manifest drop-popup.';
comment on column public.consignments.ucr_no is
  'D-071: Customs UCR number, captured at the Duty Application drop-popup.';

-- ─── 3. Per-column write permissions for the 3 new columns ───────────────────
-- Mirror the existing arrival_date / icd_id / tansad_no seed: operators write,
-- viewers read-only. Admins bypass the guard entirely (is_admin short-circuit).
-- Fold the new writable columns into the seed helpers too, so a fresh rebuild
-- (db reset) seeds them without needing this block.
create or replace function public.seed_operator_consignment_perms()
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  col text;
  writable_columns constant text[] := array[
    'ref_no', 'tansad_no', 'bl_number', 'cargo_count', 'cargo_type',
    'goods_description', 'vessel_name', 'arrival_date', 'icd_id',
    'efd_receipt_no', 'remarks',
    'consignment_nature', 'estimated_arrival_date', 'ucr_no',
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
    on conflict (role_id, table_name, column_name) do update set can_read = excluded.can_read, can_write = excluded.can_write;
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
    'arrival_date', 'icd_id', 'efd_receipt_no', 'amount', 'remarks',
    'consignment_nature', 'estimated_arrival_date', 'ucr_no',
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
    on conflict (role_id, table_name, column_name) do update set can_read = excluded.can_read, can_write = excluded.can_write;
  end loop;
end;
$$;

-- Re-run the seeds so the 3 new columns are granted immediately on existing DBs.
select public.seed_operator_consignment_perms();
select public.seed_viewer_consignment_perms();
