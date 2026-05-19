-- =============================================================================
-- Role system: roles, user_roles, role_column_permissions
-- =============================================================================
-- Per D-004 and CLAUDE.md §8. Three system roles seeded:
--   admin     — read+write everything (incl. permissions matrix)
--   operator  — read everything, write all operational columns
--                 EXCEPT amount and client_id (admin-only after creation)
--   viewer    — read everything, write nothing

create table public.roles (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  description text,
  is_system   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create trigger roles_audit
  after insert or update or delete on public.roles
  for each row execute function public.log_table_change();

-- Protect system roles from deletion / renaming.
create or replace function public.roles_prevent_system_mutation()
returns trigger
language plpgsql
as $$
begin
  if (TG_OP = 'DELETE') then
    if OLD.is_system then
      raise exception 'System role % cannot be deleted', OLD.name using errcode = '42501';
    end if;
    return OLD;
  end if;
  if (TG_OP = 'UPDATE') then
    if OLD.is_system and (NEW.name is distinct from OLD.name or NEW.is_system is distinct from OLD.is_system) then
      raise exception 'System role % cannot be renamed or de-systemed', OLD.name using errcode = '42501';
    end if;
    return NEW;
  end if;
  return null;
end;
$$;

create trigger roles_guard_system
  before update or delete on public.roles
  for each row execute function public.roles_prevent_system_mutation();

-- user_roles: maps Supabase auth users to one or more roles.
create table public.user_roles (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role_id     uuid        not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid        references auth.users(id) on delete set null,
  primary key (user_id, role_id)
);

create index user_roles_role_idx on public.user_roles (role_id);
create index user_roles_user_idx on public.user_roles (user_id);

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.log_table_change();

-- role_column_permissions: per-table, per-column read/write toggles.
create table public.role_column_permissions (
  role_id     uuid    not null references public.roles(id) on delete cascade,
  table_name  text    not null,
  column_name text    not null,
  can_read    boolean not null default true,
  can_write   boolean not null default false,
  primary key (role_id, table_name, column_name)
);

create index rcp_role_table_idx on public.role_column_permissions (role_id, table_name);

create trigger rcp_audit
  after insert or update or delete on public.role_column_permissions
  for each row execute function public.log_table_change();

-- Seed system roles ----------------------------------------------------------
insert into public.roles (name, description, is_system) values
  ('admin',    'Full access including user management and column permissions', true),
  ('operator', 'Read all, write operational columns (no amount, no client reassignment)', true),
  ('viewer',   'Read-only', true);

-- Helper: list every consignment column that is writable by operators.
-- Columns NOT in this list cannot be written by operators by default
-- (only admin can). The amount and client_id columns are intentionally absent.
create or replace function public.seed_operator_consignment_perms()
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  col text;
  writable_columns constant text[] := array[
    'ref_no', 'tansad_no', 'bl_number', 'container_count', 'container_type',
    'goods_description', 'vessel_name', 'arrival_date', 'icd_id', 'in_ref_batch_id',
    'remarks',
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

-- Seed viewer: read everything in consignments, write nothing.
create or replace function public.seed_viewer_consignment_perms()
returns void
language plpgsql
as $$
declare
  v_role_id uuid;
  col text;
  all_columns constant text[] := array[
    'id', 'ref_no', 'tansad_no', 'year', 'serial_no', 'client_id', 'bl_number',
    'container_count', 'container_type', 'goods_description', 'vessel_name',
    'arrival_date', 'icd_id', 'in_ref_batch_id', 'amount', 'remarks',
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

-- Admin gets implicit full access via the can_user_write() function below — no
-- per-column rows needed. This keeps the perms table small and means "admin =
-- god mode" is an explicit code-path rather than a thousand rows.

-- Run the seed functions. They are idempotent — safe to re-run on migrate.
select public.seed_operator_consignment_perms();
select public.seed_viewer_consignment_perms();

-- Authorization helpers -------------------------------------------------------
-- All policies call these; calling auth.uid() once via (select ...) is the
-- recommended Supabase RLS performance pattern.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid())
      and r.name = 'admin'
  );
$$;

create or replace function public.can_user_read(p_table text, p_column text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin(),
    exists (
      select 1
      from public.user_roles ur
      join public.role_column_permissions rcp on rcp.role_id = ur.role_id
      where ur.user_id = (select auth.uid())
        and rcp.table_name = p_table
        and rcp.column_name = p_column
        and rcp.can_read
    )
  );
$$;

create or replace function public.can_user_write(p_table text, p_column text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin(),
    exists (
      select 1
      from public.user_roles ur
      join public.role_column_permissions rcp on rcp.role_id = ur.role_id
      where ur.user_id = (select auth.uid())
        and rcp.table_name = p_table
        and rcp.column_name = p_column
        and rcp.can_write
    )
  );
$$;

comment on function public.can_user_write(text, text) is 'Per-column write check. Admins always allowed. See decisions.md D-004.';

-- RLS for the role/permission tables themselves ------------------------------
alter table public.roles                    enable row level security;
alter table public.user_roles               enable row level security;
alter table public.role_column_permissions  enable row level security;

-- Everyone authenticated can read what roles exist and what their own
-- permissions look like (so the UI can build PermissionGate decisions).
create policy roles_read_authenticated
  on public.roles for select to authenticated using (true);

create policy user_roles_read_self_or_admin
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy rcp_read_authenticated
  on public.role_column_permissions for select to authenticated using (true);

-- Only admins can mutate role/permission tables.
create policy roles_write_admin
  on public.roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy user_roles_write_admin
  on public.user_roles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rcp_write_admin
  on public.role_column_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
