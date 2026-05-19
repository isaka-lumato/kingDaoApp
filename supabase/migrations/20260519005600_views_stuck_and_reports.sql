-- =============================================================================
-- T-023: stuck_stages view
-- =============================================================================
-- Shows every consignment × stage combination where the stage has been in
-- 'Action' (or 'W/CARRY IN' for shipping_batch) for >= stuck_threshold_hours.
-- The threshold is read from the settings singleton.
--
-- Algorithm: for each relevant stage, find the most recent stage_history row
-- that set that stage to the "stuck" value, then check if elapsed time >= threshold.

create or replace view public.v_stuck_stages as
with threshold as (
  select stuck_threshold_hours from public.settings where id = 1
),
-- Collect the most recent time each consignment entered an 'Action' state per stage.
latest_action as (
  select distinct on (consignment_id, stage)
    consignment_id,
    stage,
    to_value,
    occurred_at,
    now() - occurred_at   as elapsed
  from public.stage_history
  where to_value in ('Action', 'W/CARRY IN')  -- both are "needs action" states
  order by consignment_id, stage, occurred_at desc
)
select
  c.id                           as consignment_id,
  c.ref_no,
  c.year,
  cl.name                        as client_name,
  c.vessel_name,
  c.arrival_date,
  la.stage,
  la.to_value                    as stuck_value,
  la.occurred_at                 as stuck_since,
  la.elapsed,
  extract(epoch from la.elapsed) / 3600.0  as hours_stuck
from latest_action la
join public.consignments c  on c.id = la.consignment_id
join public.clients cl      on cl.id = c.client_id
cross join threshold t
where c.deleted_at is null
  and c.release_status <> 'Released'  -- released jobs are done
  and extract(epoch from la.elapsed) / 3600.0 >= t.stuck_threshold_hours
  -- Only flag if the current stage value is still 'Action'/'W/CARRY IN'
  -- (i.e. it hasn't been advanced since the last_action we found).
  and (
    (la.stage = 'manifest'        and c.manifest_status::text        = la.to_value) or
    (la.stage = 'shipping_batch'  and c.shipping_batch_status::text  = la.to_value) or
    (la.stage = 'tanesws'         and c.tanesws_status::text         = la.to_value) or
    (la.stage = 'assessment'      and c.assessment_status::text      = la.to_value) or
    (la.stage = 'tbs_loading'     and c.tbs_loading_status::text     = la.to_value) or
    (la.stage = 'tbs_debit'       and c.tbs_debit_status::text       = la.to_value) or
    (la.stage = 'manifest_comp'   and c.manifest_comp_status::text   = la.to_value) or
    (la.stage = 'duty'            and c.duty_status::text            = la.to_value) or
    (la.stage = 'inspection_file' and c.inspection_file_status::text = la.to_value) or
    (la.stage = 'release'         and c.release_status::text         = la.to_value)
  )
order by hours_stuck desc;

comment on view public.v_stuck_stages is
  'Every consignment × stage that has been in Action/W/CARRY IN for >= stuck_threshold_hours '
  '(from settings). Used by the dashboard and the email alert edge function.';

-- =============================================================================
-- T-024: reporting views
-- =============================================================================

-- v_revenue_monthly: total service fees per month/year ----------------------
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

-- v_client_volume: container and job counts per client ----------------------
create or replace view public.v_client_volume as
select
  c.year,
  cl.id                                       as client_id,
  cl.name                                     as client_name,
  cl.sub_label,
  count(*)                                    as job_count,
  sum(c.container_count)                      as total_containers,
  sum(c.amount)                               as total_revenue,
  sum(case when c.release_status = 'Released' then 1 else 0 end) as released_count,
  sum(case when c.release_status = 'Waiting'  then 1 else 0 end) as active_count
from public.consignments c
join public.clients cl on cl.id = c.client_id
where c.deleted_at is null
group by c.year, cl.id, cl.name, cl.sub_label
order by c.year desc, total_containers desc;

comment on view public.v_client_volume is 'Container and job volume aggregated by client and year.';

-- v_turnaround_by_client: avg clearance days per client ----------------------
create or replace view public.v_turnaround_by_client as
select
  c.year,
  cl.id                                         as client_id,
  cl.name                                       as client_name,
  cl.sub_label,
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
group by c.year, cl.id, cl.name, cl.sub_label
order by c.year desc, avg_days desc;

comment on view public.v_turnaround_by_client is 'Average clearance turnaround time per client (release_date - arrival_date).';

-- v_turnaround_by_icd: avg clearance days per ICD ----------------------------
create or replace view public.v_turnaround_by_icd as
select
  c.year,
  i.id                                          as icd_id,
  i.name                                        as icd_name,
  count(*)                                      as released_count,
  round(avg(c.release_date - c.arrival_date), 1) as avg_days
from public.consignments c
join public.icds i on i.id = c.icd_id
where c.deleted_at is null
  and c.release_date is not null
  and c.arrival_date is not null
  and c.release_status = 'Released'
group by c.year, i.id, i.name
order by c.year desc, avg_days desc;

comment on view public.v_turnaround_by_icd is 'Average clearance turnaround time per ICD.';

-- v_pipeline_funnel: live count of consignments at each stage ----------------
create or replace view public.v_pipeline_funnel as
with counts as (
  select
    year,
    sum(case when manifest_status        = 'Action'   then 1 else 0 end) as manifest_action,
    sum(case when shipping_batch_status in ('Action','W/CARRY IN') then 1 else 0 end) as shipping_action,
    sum(case when tanesws_status         = 'Action'   then 1 else 0 end) as tanesws_action,
    sum(case when assessment_status      = 'Action'   then 1 else 0 end) as assessment_action,
    sum(case when tbs_loading_status     = 'Action'   then 1 else 0 end) as tbs_loading_action,
    sum(case when tbs_debit_status       = 'Action'   then 1 else 0 end) as tbs_debit_action,
    sum(case when manifest_comp_status   = 'Action'   then 1 else 0 end) as manifest_comp_action,
    sum(case when duty_status            = 'Action'   then 1 else 0 end) as duty_action,
    sum(case when inspection_file_status = 'Action'   then 1 else 0 end) as inspection_action,
    sum(case when release_status         = 'Waiting'
              and inspection_file_status = 'Done'     then 1 else 0 end) as ready_to_release,
    sum(case when release_status         = 'Released' then 1 else 0 end) as released,
    count(*)                                                              as total_active
  from public.consignments
  where deleted_at is null
  group by year
)
select * from counts order by year desc;

comment on view public.v_pipeline_funnel is 'Live count of consignments in each Action state by year. Powers the dashboard funnel widget.';

-- v_pending_refunds: jobs flagged as overpaid --------------------------------
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
