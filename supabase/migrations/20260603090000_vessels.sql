-- =============================================================================
-- Reference table: vessels (managed list backing the consignment vessel_name
-- autocomplete). D-050.
--
-- vessel_name on consignments stays free text; this table is a curated set of
-- suggestions that admins manage in Settings. Mirrors the icds table shape
-- (20260518175810) and reuses the shared set_updated_at() + log_table_change()
-- helpers (20260518175744). RLS mirrors icds (20260519025325): everyone reads,
-- admins write.
-- =============================================================================

create table public.vessels (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  is_active   boolean     not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index vessels_name_uq on public.vessels (name) where deleted_at is null;
create index vessels_active_idx on public.vessels (is_active) where deleted_at is null;

create trigger vessels_set_updated_at
  before update on public.vessels
  for each row execute function public.set_updated_at();

create trigger vessels_audit
  after insert or update or delete on public.vessels
  for each row execute function public.log_table_change();

comment on table public.vessels is
  'Curated vessel names suggested in the consignment form. vessel_name on consignments remains free text. D-050.';

-- RLS -------------------------------------------------------------------------
alter table public.vessels enable row level security;

-- All authenticated users can SELECT vessels (needed for the form datalist).
create policy "vessels_select_authenticated"
  on public.vessels for select
  to authenticated
  using (true);

-- Only admins can INSERT / UPDATE / DELETE vessels.
create policy "vessels_write_admin"
  on public.vessels for all
  to authenticated
  using (
    exists (
      select 1 from user_roles ur
      join roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.name = 'admin'
    )
  )
  with check (
    exists (
      select 1 from user_roles ur
      join roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.name = 'admin'
    )
  );

-- Seed: backfill distinct vessel names already present in consignments so the
-- suggestion list is non-empty on day one. Trim + drop blanks; collisions ignored.
insert into public.vessels (name)
select distinct trim(vessel_name)
from public.consignments
where vessel_name is not null
  and trim(vessel_name) <> ''
on conflict do nothing;
