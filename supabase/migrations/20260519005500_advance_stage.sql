-- =============================================================================
-- T-021 + T-022: advance_stage() + force_set_stage()
-- =============================================================================
-- advance_stage() is the ONLY way pipeline stage columns are mutated.
-- It enforces all PRD §8.6–§8.12 prerequisites, writes stage_history,
-- and handles auto-propagations (TBS Debit Paid → Duty Paid, release → date).
--
-- force_set_stage() is an admin-only escape hatch that bypasses prerequisites
-- but still writes stage_history with is_forced=true and a required reason.

-- ---------------------------------------------------------------------------
-- advance_stage(consignment_id, stage, new_value, reason)
-- ---------------------------------------------------------------------------
-- Returns the updated consignment row.
-- Raises exceptions (which bubble as HTTP 422 from PostgREST) on violations.
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
    if v_c.assessment_status <> 'Closed' then
      raise exception 'tbs_loading_status cannot be Done until assessment_status = Closed'
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
    ('Done','Uploaded','Closed','Paid','Released','CARRY IN END') then
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
        -- Log the auto-propagated duty change in stage_history too.
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
  'The ONLY sanctioned way to mutate pipeline stage columns. Enforces all PRD §8 prerequisites. '
  'Writes stage_history. Auto-propagates TBS Debit Paid → Duty Paid and Released → release_date.';

-- ---------------------------------------------------------------------------
-- force_set_stage(consignment_id, stage, new_value, reason)  — admin only
-- ---------------------------------------------------------------------------
create or replace function public.force_set_stage(
  p_id        uuid,
  p_stage     public.pipeline_stage,
  p_new_value text,
  p_reason    text   -- REQUIRED for forced changes
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
  -- Admin check.
  if not public.is_admin() then
    raise exception 'force_set_stage requires admin role' using errcode = '42501';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'reason is required for force_set_stage' using errcode = '22000';
  end if;

  begin v_actor_id    := (auth.uid())::uuid;       exception when others then v_actor_id := null; end;
  begin v_actor_email := auth.jwt() ->> 'email';   exception when others then v_actor_email := null; end;

  select * into v_c from public.consignments where id = p_id for update;
  if not found then
    raise exception 'Consignment % not found', p_id using errcode = 'P0002';
  end if;

  -- Apply without prerequisite checks.
  case p_stage
    when 'manifest'         then update public.consignments set manifest_status        = p_new_value::public.manifest_status,        updated_by = v_actor_id where id = p_id;
    when 'shipping_batch'   then update public.consignments set shipping_batch_status  = p_new_value::public.shipping_batch_status,  updated_by = v_actor_id where id = p_id;
    when 'tanesws'          then update public.consignments set tanesws_status         = p_new_value::public.tanesws_status,         updated_by = v_actor_id where id = p_id;
    when 'assessment'       then update public.consignments set assessment_status      = p_new_value::public.assessment_status,      updated_by = v_actor_id where id = p_id;
    when 'tbs_loading'      then update public.consignments set tbs_loading_status     = p_new_value::public.tbs_loading_status,     updated_by = v_actor_id where id = p_id;
    when 'tbs_debit'        then update public.consignments set tbs_debit_status       = p_new_value::public.tbs_debit_status,       updated_by = v_actor_id where id = p_id;
    when 'manifest_comp'    then update public.consignments set manifest_comp_status   = p_new_value::public.manifest_comp_status,   updated_by = v_actor_id where id = p_id;
    when 'duty'             then update public.consignments set duty_status            = p_new_value::public.duty_status,            updated_by = v_actor_id where id = p_id;
    when 'inspection_file'  then update public.consignments set inspection_file_status = p_new_value::public.inspection_file_status, updated_by = v_actor_id where id = p_id;
    when 'release'          then update public.consignments set release_status         = p_new_value::public.release_status,         updated_by = v_actor_id where id = p_id;
    else raise exception 'Unknown stage: %', p_stage using errcode = '22023';
  end case;

  -- Log with is_forced = true.
  insert into public.stage_history
    (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
  values (
    p_id, p_stage,
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
    p_new_value, p_reason, true, v_actor_id, v_actor_email
  );

  -- Write to audit_log as well (extra safety — the UPDATE trigger covers column changes;
  -- this adds an explicit "forced" marker for compliance).
  insert into public.audit_log
    (table_name, row_id, column_name, old_value, new_value, actor_id, actor_email)
  values
    ('consignments', p_id, 'FORCED_STAGE_CHANGE',
     jsonb_build_object('stage', p_stage, 'from', null),
     jsonb_build_object('stage', p_stage, 'to', p_new_value, 'reason', p_reason),
     v_actor_id, v_actor_email);

  select * into v_c from public.consignments where id = p_id;
  return v_c;
end;
$$;

comment on function public.force_set_stage(uuid, public.pipeline_stage, text, text) is
  'Admin-only escape hatch. Bypasses advance_stage() prerequisites. '
  'Requires a non-empty reason. Writes stage_history with is_forced=true AND an extra audit_log row.';
