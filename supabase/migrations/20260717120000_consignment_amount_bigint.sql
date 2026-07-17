-- Widen consignments.amount from integer to bigint.
--
-- The column was created as `integer` (max 2,147,483,647 ≈ 2.1B TZS), which
-- silently capped large service fees and surfaced as a generic save error.
-- D-017 and src/lib/money.ts both state amounts are stored as bigint whole
-- shillings, so `integer` was an inconsistency, not a deliberate limit. This
-- aligns the column with its documented design and removes the practical cap.
--
-- ORDERING (was dated 20260610120000, re-dated to run last — never applied to
-- any environment): a plain `alter column ... type bigint` is blocked by
-- Postgres while a view references the column ("cannot alter type of a column
-- used by a view or rule"). Three reporting views select consignments.amount:
-- v_revenue_monthly, v_client_volume, v_pending_refunds. (v_in_ref_batches also
-- did, but 20260630001500 drops it.) They must be dropped, the column widened,
-- then recreated. Running last means the recreated bodies are the settled final
-- form (display_name, cargo_count) — correct for both a fresh `db reset` replay
-- and a push onto the live dev DB. Widening integer -> bigint preserves all
-- values; the non-negative CHECK is unaffected; sum(amount) already returns
-- bigint/numeric so downstream types are unchanged.

drop view if exists public.v_revenue_monthly;
drop view if exists public.v_client_volume;
drop view if exists public.v_pending_refunds;

alter table public.consignments
  alter column amount type bigint using amount::bigint;

comment on column public.consignments.amount is
  'Service fee in TZS, whole shillings (bigint per D-017). NULL until quoted. Soft range validated by app layer per PRD §7.3.';

-- Recreate the three views verbatim in their final form.

create or replace view public.v_revenue_monthly as
select
  c.year,
  date_trunc('month', c.release_date)::date   as month,
  to_char(c.release_date, 'Mon YYYY')         as month_label,
  count(*)                                    as consignment_count,
  sum(c.amount)                               as total_amount
from public.consignments c
where c.deleted_at is null
  and c.release_date is not null
  and c.amount is not null
group by c.year, date_trunc('month', c.release_date), to_char(c.release_date, 'Mon YYYY')
order by date_trunc('month', c.release_date) desc;

comment on view public.v_revenue_monthly is 'Monthly revenue aggregation for released consignments.';

create or replace view public.v_client_volume as
select
  c.year,
  cl.id                                       as client_id,
  cl.name                                     as client_name,
  cl.display_name,
  count(*)                                    as job_count,
  sum(c.cargo_count)                          as total_containers,
  sum(c.amount)                               as total_revenue,
  sum(case when c.release_status = 'Released' then 1 else 0 end) as released_count,
  sum(case when c.release_status = 'Waiting'  then 1 else 0 end) as active_count
from public.consignments c
join public.clients cl on cl.id = c.client_id
where c.deleted_at is null
group by c.year, cl.id, cl.name, cl.display_name
order by c.year desc, total_containers desc;

comment on view public.v_client_volume is 'Container and job volume aggregated by client and year.';

create or replace view public.v_pending_refunds as
select
  c.id,
  c.ref_no,
  c.year,
  cl.name      as client_name,
  c.amount,
  c.remarks,
  c.release_date,
  c.created_at
from public.consignments c
join public.clients cl on cl.id = c.client_id
where c.deleted_at is null
  and c.is_refund_pending = true
order by c.year desc, c.release_date desc;

comment on view public.v_pending_refunds is 'Consignments where remarks contained PAID, REFUND NEEDED. Finance queue.';
