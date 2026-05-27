-- =============================================================================
-- T-013: in_ref_batches view  (D-012 decision)
-- =============================================================================
-- Per decisions.md D-012: in_ref batches are NOT a separate table — they are
-- a computed view over consignments grouped by (in_ref, client_id, year).
-- This keeps the schema simple: in_ref is just a text column on consignments.
-- The view materialises the batch summary the UI needs.

create or replace view public.v_in_ref_batches as
select
  c.in_ref,
  c.client_id,
  c.year,
  cl.name                                    as client_name,
  count(*)                                   as consignment_count,
  sum(c.container_count)                     as total_containers,
  sum(c.amount)                              as total_amount,
  -- A batch is "fully released" when every member is released.
  bool_and(c.release_status = 'Released')    as all_released,
  min(c.arrival_date)                        as earliest_arrival,
  max(c.arrival_date)                        as latest_arrival,
  -- EFD code is shared; take the first non-null value in the batch.
  (array_agg(e.efd_code order by e.created_at) filter (where e.efd_code is not null))[1] as efd_code
from public.consignments c
join public.clients cl on cl.id = c.client_id
left join public.efd_record_consignments erc on erc.consignment_id = c.id
left join public.efd_records e on e.id = erc.efd_record_id
where c.deleted_at is null
  and c.in_ref is not null
group by c.in_ref, c.client_id, c.year, cl.name;

comment on view public.v_in_ref_batches is
  'Aggregated billing batches. in_ref + client_id + year is the composite key. '
  'No separate table — per D-012 (in_ref is a plain text column on consignments).';
