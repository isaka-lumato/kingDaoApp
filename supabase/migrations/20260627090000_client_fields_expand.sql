-- =============================================================================
-- D-057: Client model expansion — six-field CRUD
-- Rename sub_label → display_name; add company + phone; recreate dependent views.
-- =============================================================================

-- The partial unique index clients_name_active_uq references the column via
-- coalesce(sub_label, ''); renaming the column auto-updates the index definition.
alter table public.clients rename column sub_label to display_name;

alter table public.clients add column company text;
alter table public.clients add column phone   text;

comment on column public.clients.display_name is
  'Free-text name shown everywhere (lists, dropdowns, reports). Falls back to name when null. Was sub_label.';
comment on column public.clients.company is 'Client company / organisation name.';
comment on column public.clients.phone   is 'Client contact phone number.';

-- Recreate the two reporting views that selected cl.sub_label ----------------
-- Drop first: create-or-replace cannot rename an output column (sub_label → display_name).

drop view if exists public.v_client_volume;
drop view if exists public.v_turnaround_by_client;

create or replace view public.v_client_volume as
select
  c.year,
  cl.id                                       as client_id,
  cl.name                                     as client_name,
  cl.display_name,
  count(*)                                    as job_count,
  sum(c.container_count)                      as total_containers,
  sum(c.amount)                               as total_revenue,
  sum(case when c.release_status = 'Released' then 1 else 0 end) as released_count,
  sum(case when c.release_status = 'Waiting'  then 1 else 0 end) as active_count
from public.consignments c
join public.clients cl on cl.id = c.client_id
where c.deleted_at is null
group by c.year, cl.id, cl.name, cl.display_name
order by c.year desc, total_containers desc;

comment on view public.v_client_volume is 'Container and job volume aggregated by client and year.';

create or replace view public.v_turnaround_by_client as
select
  c.year,
  cl.id                                         as client_id,
  cl.name                                       as client_name,
  cl.display_name,
  count(*)                                      as released_count,
  round(avg(c.release_date - c.arrival_date), 1) as avg_days,
  min(c.release_date - c.arrival_date)           as min_days,
  max(c.release_date - c.arrival_date)           as max_days
from public.consignments c
join public.clients cl on cl.id = c.client_id
where c.deleted_at is null
  and c.release_date is not null
  and c.arrival_date is not null
  and c.release_status = 'Released'
group by c.year, cl.id, cl.name, cl.display_name
order by c.year desc, avg_days desc;

comment on view public.v_turnaround_by_client is 'Average clearance turnaround time per client (release_date - arrival_date).';
