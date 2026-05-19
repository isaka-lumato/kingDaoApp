-- =============================================================================
-- T-015: guta_pairs table + auto-pair trigger  (PRD §8.15, D-011)
-- =============================================================================
-- GUTA shipments always arrive as a pair: "{code} - GUTA PARTS" + "{code} - FRAMES"
-- on the same vessel, same client.
--
-- Design per D-011: we use a separate `guta_pairs` join table rather than a
-- self-referential FK so that:
--   a) The pairing is easy to query (one row = one pair).
--   b) We can record metadata (detected_at, is_confirmed).
--   c) The two consignment rows remain independent — no chicken-and-egg on insert.
--
-- The consignments.guta_pair_id column (already on the table) still points here
-- for quick lookups from the consignment row itself.

create table public.guta_pairs (
  id                  uuid          primary key default gen_random_uuid(),
  parts_consignment_id uuid         not null unique references public.consignments(id) on delete cascade,
  frames_consignment_id uuid        not null unique references public.consignments(id) on delete cascade,
  batch_code          text          not null,    -- e.g. "073C", "W9 & W6"
  is_confirmed        boolean       not null default false,  -- true = operator verified
  detected_at         timestamptz   not null default now(),
  confirmed_at        timestamptz,
  check (parts_consignment_id <> frames_consignment_id)
);

create index guta_pairs_parts_idx  on public.guta_pairs (parts_consignment_id);
create index guta_pairs_frames_idx on public.guta_pairs (frames_consignment_id);

comment on table public.guta_pairs is
  'GUTA motorcycle CKD pairs: one GUTA PARTS consignment + one FRAMES consignment. '
  'Auto-detected by trigger on consignments insert/update.';

-- RLS -----------------------------------------------------------------------
alter table public.guta_pairs enable row level security;

create policy guta_pairs_select
  on public.guta_pairs for select to authenticated using (true);

create policy guta_pairs_write
  on public.guta_pairs for all to authenticated
  using (public.is_admin() or exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.user_id = (select auth.uid()) and r.name in ('admin','operator')
  ))
  with check (true);

-- Auto-pair trigger ---------------------------------------------------------
-- Fires AFTER INSERT OR UPDATE on consignments.
-- Extracts the batch_code from goods_description and looks for the sibling.
-- If found: inserts a guta_pairs row and updates both consignments.guta_pair_id.
-- Pattern: "{batch_code} - GUTA PARTS"  or  "{batch_code} - FRAMES"

create or replace function public.auto_detect_guta_pair()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_code    text;
  v_is_parts      boolean;
  v_is_frames     boolean;
  v_sibling       public.consignments%rowtype;
  v_pair_id       uuid;
  v_parts_id      uuid;
  v_frames_id     uuid;
begin
  -- Only act on active, non-paired records with a goods_description.
  if NEW.deleted_at is not null then return NEW; end if;
  if NEW.guta_pair_id is not null then return NEW; end if;
  if NEW.goods_description is null then return NEW; end if;

  v_is_parts  := NEW.goods_description ~* '[-\s]GUTA\s+PARTS';
  v_is_frames := NEW.goods_description ~* '[-\s]FRAMES';

  if not (v_is_parts or v_is_frames) then return NEW; end if;

  -- Extract batch_code = everything before the last ' - GUTA PARTS' / ' - FRAMES'
  if v_is_parts then
    v_batch_code := trim(regexp_replace(NEW.goods_description, '\s*[-]\s*GUTA\s+PARTS.*$', '', 'i'));
  else
    v_batch_code := trim(regexp_replace(NEW.goods_description, '\s*[-]\s*FRAMES.*$', '', 'i'));
  end if;

  if v_batch_code = '' or v_batch_code is null then return NEW; end if;

  -- Look for the sibling: same client, same vessel, same year, no pair yet.
  select * into v_sibling
  from public.consignments
  where client_id    = NEW.client_id
    and vessel_name  = NEW.vessel_name
    and year         = NEW.year
    and guta_pair_id is null
    and deleted_at   is null
    and id           <> NEW.id
    and (
      (v_is_parts and goods_description ~* (v_batch_code || '\s*[-]\s*FRAMES'))
      or
      (v_is_frames and goods_description ~* (v_batch_code || '\s*[-]\s*GUTA\s+PARTS'))
    )
  limit 1;

  if not found then return NEW; end if;

  -- Determine which is parts and which is frames.
  if v_is_parts then
    v_parts_id  := NEW.id;
    v_frames_id := v_sibling.id;
  else
    v_parts_id  := v_sibling.id;
    v_frames_id := NEW.id;
  end if;

  -- Insert the pair record.
  insert into public.guta_pairs
    (parts_consignment_id, frames_consignment_id, batch_code)
  values
    (v_parts_id, v_frames_id, v_batch_code)
  returning id into v_pair_id;

  -- Update both consignments to point at the pair.
  update public.consignments
    set guta_pair_id = v_pair_id
    where id in (v_parts_id, v_frames_id);

  return NEW;
end;
$$;

create trigger consignments_auto_guta_pair
  after insert or update of goods_description, vessel_name, client_id, year, deleted_at
  on public.consignments
  for each row execute function public.auto_detect_guta_pair();

comment on function public.auto_detect_guta_pair is
  'Detects GUTA PARTS / FRAMES sibling pairs after insert/update on consignments. '
  'Inserts a guta_pairs row and back-fills guta_pair_id on both records.';
