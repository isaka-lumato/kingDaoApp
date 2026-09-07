-- =============================================================================
-- D-073: Release drop-popup — efd_receipt_no, amount, remarks via p_extra
-- =============================================================================
-- Extends the D-071 `p_extra` whitelist with the three columns collected by the
-- Release popup, so the receipt/amount/remarks write and the
-- `release_status → 'Released'` advance stay one atomic transaction (D-009:
-- advance_stage() is the sole sanctioned pipeline mutator).
--
-- Whitelist grows from 5 to 8 keys:
--   arrival_date, icd_id, ref_no, tansad_no, ucr_no        (D-071)
--   efd_receipt_no, amount, remarks                        (D-073, new)
--
-- Each key is still can_user_write()-checked before the column-guard bypass, so
-- an operator without "Edit financial amounts" (consignments.amount) is rejected
-- with 42501 rather than silently skipping the write. The client hides fields the
-- user cannot write, so a normal release never trips that path.
--
-- `amount` is bigint (D-017, widened by 20260717120000). The cast below is to
-- bigint, and the column's `check (amount is null or amount >= 0)` still rejects
-- negatives. All three Release fields are OPTIONAL (D-073): the client omits a
-- key entirely when its input is blank, so an empty field leaves the stored
-- value untouched rather than nulling it.
--
-- Body is verbatim from 20260713120500 except the additions marked "D-073".
-- create-or-replace: no schema change, no data change. Signature is unchanged
-- (uuid, pipeline_stage, text, text, jsonb), so no drop/overload dance is needed.
--
-- See decisions.md D-073.

create or replace function public.advance_stage(
  p_id        uuid,
  p_stage     public.pipeline_stage,
  p_new_value text,
  p_reason    text default null,
  p_extra     jsonb default null
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
  v_stage_column  text;
  -- D-071: intake-column whitelist for p_extra. D-073 adds the three Release
  -- drop-popup columns (efd_receipt_no, amount, remarks).
  v_extra_key     text;
  v_allowed_extra constant text[] := array[
    'arrival_date', 'icd_id', 'ref_no', 'tansad_no', 'ucr_no',
    'efd_receipt_no', 'amount', 'remarks'
  ];
begin
  begin v_actor_id := (auth.uid())::uuid; exception when others then v_actor_id := null; end;
  begin v_actor_email := auth.jwt() ->> 'email'; exception when others then v_actor_email := null; end;

  if v_actor_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_stage_column := public.pipeline_stage_column(p_stage);
  if v_stage_column is null then
    raise exception 'Unknown stage: %', p_stage using errcode = '22023';
  end if;

  if not public.can_user_write('consignments', v_stage_column) then
    raise exception 'Permission denied to advance %', v_stage_column
      using errcode = '42501';
  end if;

  -- D-071: validate p_extra keys against the whitelist and the caller's
  -- per-column write permission BEFORE granting the guard bypass.
  if p_extra is not null then
    for v_extra_key in select jsonb_object_keys(p_extra) loop
      if not (v_extra_key = any(v_allowed_extra)) then
        raise exception 'Column % is not writable via advance_stage p_extra', v_extra_key
          using errcode = '22023';
      end if;
      if not public.can_user_write('consignments', v_extra_key) then
        raise exception 'Permission denied to write %', v_extra_key
          using errcode = '42501';
      end if;
    end loop;
  end if;

  -- Sanctioned SECURITY DEFINER writer. The explicit permission check above is
  -- the gate; this bypass only prevents the generic column trigger from
  -- blocking updated_by, release_date and duty auto-propagation side effects.
  perform set_config('app.bypass_column_guard', 'on', true);

  select * into v_c from public.consignments where id = p_id for update;
  if not found then
    raise exception 'Consignment % not found', p_id using errcode = 'P0002';
  end if;
  if v_c.deleted_at is not null then
    raise exception 'Cannot update a deleted consignment' using errcode = '42501';
  end if;

  -- D-071: apply intake columns from p_extra (whitelisted above). Written first
  -- so the arrival_date §8.1 guard below sees a freshly-supplied arrival.
  if p_extra is not null then
    if p_extra ? 'arrival_date' then
      update public.consignments
        set arrival_date = nullif(p_extra ->> 'arrival_date', '')::date,
            updated_by = v_actor_id
        where id = p_id;
    end if;
    if p_extra ? 'icd_id' then
      update public.consignments
        set icd_id = nullif(p_extra ->> 'icd_id', '')::uuid,
            updated_by = v_actor_id
        where id = p_id;
    end if;
    -- ref_no is operator-editable at the Duty-Application popup; it defaults to
    -- the auto-generated value client-side and is only sent when changed. The
    -- (ref_no, year) unique index (consignments_ref_no_year_uq) is the backstop
    -- against a collision — a duplicate raises 23505 and aborts the advance.
    if p_extra ? 'ref_no' then
      update public.consignments
        set ref_no = nullif(p_extra ->> 'ref_no', ''),
            updated_by = v_actor_id
        where id = p_id;
    end if;
    if p_extra ? 'tansad_no' then
      update public.consignments
        set tansad_no = nullif(p_extra ->> 'tansad_no', ''),
            updated_by = v_actor_id
        where id = p_id;
    end if;
    if p_extra ? 'ucr_no' then
      update public.consignments
        set ucr_no = nullif(p_extra ->> 'ucr_no', ''),
            updated_by = v_actor_id
        where id = p_id;
    end if;
    -- D-073: Release drop-popup columns. The client omits blank inputs, so a key
    -- being present means the operator typed something.
    if p_extra ? 'efd_receipt_no' then
      update public.consignments
        set efd_receipt_no = nullif(p_extra ->> 'efd_receipt_no', ''),
            updated_by = v_actor_id
        where id = p_id;
    end if;
    if p_extra ? 'amount' then
      update public.consignments
        set amount = nullif(p_extra ->> 'amount', '')::bigint,
            updated_by = v_actor_id
        where id = p_id;
    end if;
    if p_extra ? 'remarks' then
      update public.consignments
        set remarks = nullif(p_extra ->> 'remarks', ''),
            updated_by = v_actor_id
        where id = p_id;
    end if;
    -- Re-read so the guards below and the arrival check see the new values.
    select * into v_c from public.consignments where id = p_id for update;
  end if;

  if p_stage = 'tanesws' and p_new_value = 'Done' and v_c.manifest_status <> 'Uploaded' then
    raise exception 'tanesws_status cannot be Done until manifest_status = Uploaded'
      using errcode = '22000';
  end if;

  if p_stage = 'tbs_loading' and p_new_value = 'Done' and v_c.assessment_status <> 'Accepted' then
    raise exception 'tbs_loading_status cannot be Done until assessment_status = Accepted'
      using errcode = '22000';
  end if;

  if p_stage = 'tbs_debit' and p_new_value in ('Paid', 'SHARED') and v_c.tbs_loading_status <> 'Done' then
    raise exception 'tbs_debit_status cannot be Paid/SHARED until tbs_loading_status = Done'
      using errcode = '22000';
  end if;

  if p_stage = 'inspection_file' and p_new_value in ('Done', 'SHARED') and v_c.duty_status <> 'Paid' then
    raise exception 'inspection_file_status cannot be Done/SHARED until duty_status = Paid'
      using errcode = '22000';
  end if;

  if p_stage = 'release' and p_new_value = 'Released' and v_c.inspection_file_status not in ('Done', 'SHARED') then
    raise exception 'release_status cannot be Released until inspection_file_status = Done or SHARED'
      using errcode = '22000';
  end if;

  if v_c.arrival_date is null and p_new_value in
    ('Done','Uploaded','Accepted','Paid','Released','CARRY IN END') then
    raise exception 'arrival_date must be set before advancing pipeline stages'
      using errcode = '22000';
  end if;

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
      if p_new_value = 'Paid' then
        update public.consignments
          set tbs_debit_status = 'Paid'::public.tbs_debit_status,
              duty_status = 'Paid'::public.duty_status,
              updated_by = v_actor_id
          where id = p_id;
        insert into public.stage_history
          (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
        values
          (p_id, 'duty', v_c.duty_status::text, 'Paid', 'auto-propagated from tbs_debit=Paid', false, v_actor_id, v_actor_email);
      elsif p_new_value = 'SHARED' then
        update public.consignments
          set tbs_debit_status = 'SHARED'::public.tbs_debit_status,
              duty_status = 'Paid'::public.duty_status,
              updated_by = v_actor_id
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
      if p_new_value = 'Released' then
        update public.consignments
          set release_status = 'Released'::public.release_status,
              release_date = coalesce(release_date, current_date),
              updated_by = v_actor_id
          where id = p_id;
      else
        update public.consignments
          set release_status = p_new_value::public.release_status,
              updated_by = v_actor_id
          where id = p_id;
      end if;
  end case;

  insert into public.stage_history
    (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
  values (
    p_id,
    p_stage,
    case p_stage
      when 'manifest' then v_c.manifest_status::text
      when 'shipping_batch' then v_c.shipping_batch_status::text
      when 'tanesws' then v_c.tanesws_status::text
      when 'assessment' then v_c.assessment_status::text
      when 'tbs_loading' then v_c.tbs_loading_status::text
      when 'tbs_debit' then v_c.tbs_debit_status::text
      when 'manifest_comp' then v_c.manifest_comp_status::text
      when 'duty' then v_c.duty_status::text
      when 'inspection_file' then v_c.inspection_file_status::text
      when 'release' then v_c.release_status::text
    end,
    p_new_value,
    p_reason,
    false,
    v_actor_id,
    v_actor_email
  );

  -- D-071: Transit/Export TBS skip. Re-read to see the just-applied change, then
  -- if nature is Export/Transit and Assessment is Accepted while TBS Applications
  -- is still open, complete both TBS stages directly (NOT via the duty-propagating
  -- branch — duty stays Waiting). Two stage_history rows record the skip.
  select * into v_c from public.consignments where id = p_id for update;
  if v_c.consignment_nature in ('Export', 'Transit')
     and v_c.assessment_status = 'Accepted'
     and v_c.tbs_loading_status <> 'Done'
     and v_c.deleted_at is null then

    update public.consignments
      set tbs_loading_status = 'Done'::public.tbs_loading_status,
          tbs_debit_status   = 'Paid'::public.tbs_debit_status,
          updated_by         = v_actor_id
      where id = p_id;

    insert into public.stage_history
      (consignment_id, stage, from_value, to_value, reason, is_forced, actor_id, actor_email)
    values
      (p_id, 'tbs_loading', v_c.tbs_loading_status::text, 'Done',
       'skipped (nature=' || v_c.consignment_nature::text || ')', false, v_actor_id, v_actor_email),
      (p_id, 'tbs_debit', v_c.tbs_debit_status::text, 'Paid',
       'skipped (nature=' || v_c.consignment_nature::text || ')', false, v_actor_id, v_actor_email);
  end if;

  select * into v_c from public.consignments where id = p_id;
  return v_c;
end;
$$;

comment on function public.advance_stage(uuid, public.pipeline_stage, text, text, jsonb) is
  'Mutates pipeline stage columns. Caller must have write permission on the target status column. '
  'Enforces PRD stage prerequisites and writes stage_history. '
  'p_extra (D-071, extended D-073): atomically writes whitelisted intake columns '
  '(arrival_date, icd_id, ref_no, tansad_no, ucr_no, efd_receipt_no, amount, remarks) — each permission-checked. '
  'Transit/Export nature auto-skips TBS Applications + TBS Debit without paying duty.';
