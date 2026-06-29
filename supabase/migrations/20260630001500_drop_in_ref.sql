-- Migration: Drop in_ref from public.consignments and clean up dependent permissions

-- 1. Drop the batch view that groups by in_ref
drop view if exists public.v_in_ref_batches cascade;

-- 2. Drop the index on in_ref
drop index if exists public.consignments_in_ref_idx;

-- 3. Drop the column in_ref from public.consignments table
alter table public.consignments drop column if exists in_ref;

-- 4. Clean up columns permissions for in_ref
delete from public.role_column_permissions where table_name = 'consignments' and column_name = 'in_ref';

-- 5. Recreate seed_operator_consignment_perms to exclude in_ref
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

-- 6. Recreate seed_viewer_consignment_perms to exclude in_ref
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
