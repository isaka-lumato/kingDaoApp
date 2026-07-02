-- =============================================================================
-- D-062: Rename assessment_status terminal value 'Closed' → 'Accepted'
-- =============================================================================
-- The Assessment stage's "done" value was 'Closed' (TRA closes the assessment
-- once duty is calculated). Per user request the operator-facing terminal value
-- is 'Accepted'. RENAME VALUE keeps every existing row valid under the new label
-- — no data migration, no row rewrite.
--
-- advance_stage() is the ONLY function that hard-codes the string literal
-- 'Closed' (the §8.8 tbs_loading prerequisite guard and the §8.1 terminal-state
-- list). It is re-emitted below with 'Accepted'. force_set_stage(), the
-- column-write guard, and the reports view all compare the column dynamically,
-- so they need no change.
--
-- See decisions.md D-062. Supersedes the 'Closed' label from D-045 / PRD §5.

-- ─── 1. Rename the enum value ────────────────────────────────────────────────
-- Idempotent: only rename if the old label still exists (a fresh rebuild or a
-- prod push that replays this file must not error on an already-renamed enum).
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'assessment_status' and e.enumlabel = 'Closed'
  ) then
    alter type public.assessment_status rename value 'Closed' to 'Accepted';
  end if;
end $$;

-- ─── 2. Re-emit advance_stage() — body verbatim from 20260525090000, with the
--        two 'Closed' literals replaced by 'Accepted' (§8.8 guard, §8.1 list). ─
create or replace function public.advance_stage(
  p_id        uuid,
  p_stage     public.pipeline_stage,
  p_new_value text,
  p_reason    text default null
)
returns public.consignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c             public.consignments%rowtype;
  v_actor_id      uuid;
  v_actor_email   text;
begin
  -- Capture actor.
  begin v_actor_id    := (auth.uid())::uuid;       exception when others then v_actor_id := null; end;
  begin v_actor_email := auth.jwt() ->> 'email';   exception when others then v_actor_email := null; end;

  -- =========================================================================
  -- CALLER-ROLE GATE (2026-05-22, T-048 follow-up, D-029)
  -- =========================================================================
  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = v_actor_id
      and r.name in ('admin', 'operator')
  ) then
    raise exception 'Role admin or operator required to advance pipeline stages'
      using errcode = '42501';
  end if;

  -- D-046: opt out of the per-column write guard for this sanctioned writer
  -- (sets status columns + updated_by). tx-local, resets at commit/rollback.
  perform set_config('app.bypass_column_guard', 'on', true);

  -- Lock the row for update.
  select * into v_c from public.consignments where id = p_id for update;
  if not found then
    raise exception 'Consignment % not found', p_id using errcode = 'P0002';
  end if;
  if v_c.deleted_at is not null then
    raise exception 'Cannot update a deleted consignment' using errcode = '42501';
  end if;

  -- =========================================================================
  -- PRE-CONDITION CHECKS (PRD §8.6 – §8.12)
  -- =========================================================================

  -- §8.6  manifest → tanesws (hard)
  if p_stage = 'tanesws' and p_new_value = 'Done' then
    if v_c.manifest_status <> 'Uploaded' then
      raise exception 'tanesws_status cannot be Done until manifest_status = Uploaded'
        using errcode = '22000';
    end if;
  end if;

  -- §8.8  assessment → tbs_loading (hard)
  if p_stage = 'tbs_loading' and p_new_value = 'Done' then
    if v_c.assessment_status <> 'Accepted' then
      raise exception 'tbs_loading_status cannot be Done until assessment_status = Accepted'
        using errcode = '22000';
    end if;
  end if;

  -- §8.9  tbs_loading → tbs_debit (hard)
  if p_stage = 'tbs_debit' and p_new_value in ('Paid', 'SHARED') then
    if v_c.tbs_loading_status <> 'Done' then
      raise exception 'tbs_debit_status cannot be Paid/SHARED until tbs_loading_status = Done'
        using errcode = '22000';
    end if;
  end if;

  -- §8.11 duty → inspection_file (hard)
  if p_stage = 'inspection_file' and p_new_value in ('Done', 'SHARED') then
    if v_c.duty_status <> 'Paid' then
      raise exception 'inspection_file_status cannot be Done/SHARED until duty_status = Paid'
        using errcode = '22000';
    end if;
  end if;

  -- §8.12 inspection_file → release (hard)
  if p_stage = 'release' and p_new_value = 'Released' then
    if v_c.inspection_file_status not in ('Done', 'SHARED') then
      raise exception 'release_status cannot be Released until inspection_file_status = Done or SHARED'
        using errcode = '22000';
    end if;
  end if;

  -- §8.1  arrival_date required before any terminal state
  if v_c.arrival_date is null and p_new_value in
    ('Done','Uploaded','Accepted','Paid','Released','CARRY IN END') then
    raise exception 'arrival_date must be set before advancing pipeline stages'
      using errcode = '22000';
  end if;

  -- =========================================================================
  -- APPLY THE CHANGE
  -- =========================================================================
  case p_stage
    when 'manifest' then
      update public.consignments
        set manifest_status = p_new_value::public.manifest_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'shipping_batch' then
      update public.consignments
        set shipping_batch_status = p_new_value::public.shipping_batch_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'tanesws' then
      update public.consignments
        set tanesws_status = p_new_value::public.tanesws_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'assessment' then
      update public.consignments
        set assessment_status = p_new_value::public.assessment_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'tbs_loading' then
      update public.consignments
        set tbs_loading_status = p_new_value::public.tbs_loading_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'tbs_debit' then
      -- §8.10 auto-propagate: TBS Debit Paid → Duty Paid
      if p_new_value = 'Paid' then
        update public.consignments
          set tbs_debit_status = 'Paid'::public.tbs_debit_status,
              duty_status      = 'Paid'::public.duty_status,
              updated_by       = v_actor_id
          where id = p_id;
        insert into public.stage_history
          (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
        values
          (p_id, 'duty', v_c.duty_status::text, 'Paid', 'auto-propagated from tbs_debit=Paid', false, v_actor_id, v_actor_email);
      elsif p_new_value = 'SHARED' then
        update public.consignments
          set tbs_debit_status = 'SHARED'::public.tbs_debit_status,
              duty_status      = 'Paid'::public.duty_status,
              updated_by       = v_actor_id
          where id = p_id;
        insert into public.stage_history
          (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
        values
          (p_id, 'duty', v_c.duty_status::text, 'Paid', 'auto-propagated from tbs_debit=SHARED', false, v_actor_id, v_actor_email);
      else
        update public.consignments
          set tbs_debit_status = p_new_value::public.tbs_debit_status,
              updated_by = v_actor_id
          where id = p_id;
      end if;

    when 'manifest_comp' then
      update public.consignments
        set manifest_comp_status = p_new_value::public.manifest_comp_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'duty' then
      update public.consignments
        set duty_status = p_new_value::public.duty_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'inspection_file' then
      update public.consignments
        set inspection_file_status = p_new_value::public.inspection_file_status,
            updated_by = v_actor_id
        where id = p_id;

    when 'release' then
      -- §8.12 auto-propagate: Released → release_date = today (if null)
      if p_new_value = 'Released' then
        update public.consignments
          set release_status = 'Released'::public.release_status,
              release_date   = coalesce(release_date, current_date),
              updated_by     = v_actor_id
          where id = p_id;
      else
        update public.consignments
          set release_status = p_new_value::public.release_status,
              updated_by = v_actor_id
          where id = p_id;
      end if;

    else
      raise exception 'Unknown stage: %', p_stage using errcode = '22023';
  end case;

  -- Write stage_history.
  insert into public.stage_history
    (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
  values (
    p_id,
    p_stage,
    case p_stage
      when 'manifest'         then v_c.manifest_status::text
      when 'shipping_batch'   then v_c.shipping_batch_status::text
      when 'tanesws'          then v_c.tanesws_status::text
      when 'assessment'       then v_c.assessment_status::text
      when 'tbs_loading'      then v_c.tbs_loading_status::text
      when 'tbs_debit'        then v_c.tbs_debit_status::text
      when 'manifest_comp'    then v_c.manifest_comp_status::text
      when 'duty'             then v_c.duty_status::text
      when 'inspection_file'  then v_c.inspection_file_status::text
      when 'release'          then v_c.release_status::text
    end,
    p_new_value,
    p_reason,
    false,
    v_actor_id,
    v_actor_email
  );

  -- Return fresh row.
  select * into v_c from public.consignments where id = p_id;
  return v_c;
end;
$$;

comment on function public.advance_stage(uuid, public.pipeline_stage, text, text) is
  'The ONLY sanctioned way to mutate pipeline stage columns. '
  'Caller must be admin or operator (D-029). Enforces all PRD §8 prerequisites. '
  'Writes stage_history. Auto-propagates TBS Debit Paid → Duty Paid and Released → release_date. '
  'Bypasses the per-column write guard via tx-local GUC (D-046). '
  'Assessment terminal value is Accepted (D-062).';
