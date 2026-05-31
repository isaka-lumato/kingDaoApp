-- =============================================================================
-- T-081: DB-level per-column UPDATE enforcement for `consignments`
-- =============================================================================
-- THE GAP (closed here):
--   The `consignments_update` RLS policy (migration 20260519005000) ends in
--   `with check (true)`. Its `using` clause gates UPDATE to admin/operator
--   roles, but once past that gate an operator could PATCH ANY column via
--   PostgREST — including `amount` and `client_id` — even though their role's
--   `role_column_permissions.can_write` is false for those columns. The
--   per-column rule lived only in the app layer (src/server/actions/
--   edit-consignment.ts), violating CLAUDE.md §3.3 ("per-column permissions
--   enforced two ways: RLS policies on UPDATE *and* UI").
--
-- WHY A TRIGGER, NOT RLS:
--   RLS `with check` is a row predicate; it cannot compare OLD vs NEW per
--   column. "Did this column change, and may the caller change it" needs
--   OLD/NEW, which only a BEFORE UPDATE row trigger provides. This mirrors the
--   existing `roles_prevent_system_mutation()` trigger (migration 20260518175820).
--
-- SECURITY DEFINER bypass (D-046):
--   advance_stage()/force_set_stage() are SECURITY DEFINER but a BEFORE UPDATE
--   trigger still sees the real caller's auth.uid(). They write `updated_by`
--   (NOT in the operator writable seed), so a naive guard would 42501 the one
--   sanctioned pipeline writer. They opt out via a tx-local GUC
--   (`app.bypass_column_guard`, is_local=true → resets at tx end → PgBouncer-safe).
--   This keeps `updated_by`/`release_date` guarded on the *direct* REST path.
--
-- ALSO FIXED HERE: the operator/viewer seed (migration 20260518175820, lines
--   156 & 194) named a non-existent column `in_ref_batch_id`; the real column
--   is `in_ref` (text). Operators couldn't write `in_ref` and a dangling perm
--   row pointed at nothing. Re-seeded below.
--
-- See decisions.md D-046. Idempotent: create-or-replace + drop-if-exists + upsert.

-- ─── 1. The column-write guard function ──────────────────────────────────────
create or replace function public.consignments_enforce_column_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k       text;
  old_val jsonb;
  new_val jsonb;
  -- `updated_at` is bumped by set_updated_at() on EVERY update; never user-driven.
  exempt  constant text[] := array['updated_at'];
begin
  -- Sanctioned SECURITY DEFINER writers (advance_stage / force_set_stage) opt
  -- out via a transaction-local GUC. Anyone else (direct PostgREST) is checked.
  if coalesce(current_setting('app.bypass_column_guard', true), 'off') = 'on' then
    return NEW;
  end if;

  -- Admin = full access. Short-circuit avoids a can_user_write() round-trip per
  -- changed column (it would return true anyway).
  if public.is_admin() then
    return NEW;
  end if;

  -- For every column that actually changed, the caller must have can_write.
  for k in select jsonb_object_keys(to_jsonb(NEW)) loop
    if k = any(exempt) then
      continue;
    end if;
    old_val := to_jsonb(OLD) -> k;
    new_val := to_jsonb(NEW) -> k;
    if old_val is distinct from new_val then
      if not public.can_user_write('consignments', k) then
        raise exception 'Permission denied: you may not modify consignments.%', k
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return NEW;
end;
$$;

comment on function public.consignments_enforce_column_write() is
  'T-081/D-046: BEFORE UPDATE guard. Raises 42501 when a non-admin changes a '
  'consignments column with role_column_permissions.can_write=false. SECURITY '
  'DEFINER pipeline writers bypass via tx-local GUC app.bypass_column_guard.';

-- ─── 2. Attach the trigger ───────────────────────────────────────────────────
-- Name sorts before consignments_set_updated_at / consignments_audit so it runs
-- first (belt-and-suspenders; the `updated_at` exemption is what guarantees
-- correctness regardless of firing order).
drop trigger if exists consignments_aaa_column_write_guard on public.consignments;
create trigger consignments_aaa_column_write_guard
  before update on public.consignments
  for each row execute function public.consignments_enforce_column_write();

-- ─── 3. Grant the bypass to the two sanctioned SECURITY DEFINER writers ───────
-- Re-emit advance_stage() — body verbatim from 20260522004757 — with a single
-- added line setting the tx-local bypass GUC, placed AFTER the caller-role gate
-- so an unauthorized caller is still rejected before any bypass is granted.
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
  'Bypasses the per-column write guard via tx-local GUC (D-046).';

-- Re-emit force_set_stage() — body verbatim from 20260519005500 — with the same
-- one-line bypass, placed AFTER the admin gate.
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

  -- D-046: opt out of the per-column write guard (admin would pass the guard
  -- anyway, but set it explicitly so the path never depends on is_admin() twice).
  perform set_config('app.bypass_column_guard', 'on', true);

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
  'Requires a non-empty reason. Writes stage_history with is_forced=true AND an extra audit_log row. '
  'Bypasses the per-column write guard via tx-local GUC (D-046).';

-- ─── 4. Fix the in_ref_batch_id → in_ref seed typo ───────────────────────────
-- The original seed (20260518175820) named a non-existent column. Because that
-- seed used `on conflict do nothing`, re-running it cannot self-heal — delete
-- the dangling rows and upsert the correct `in_ref` rows.
do $$
declare
  v_operator uuid;
  v_viewer   uuid;
begin
  select id into v_operator from public.roles where name = 'operator';
  select id into v_viewer   from public.roles where name = 'viewer';

  delete from public.role_column_permissions
   where table_name = 'consignments' and column_name = 'in_ref_batch_id';

  insert into public.role_column_permissions
    (role_id, table_name, column_name, can_read, can_write)
  values (v_operator, 'consignments', 'in_ref', true, true)
  on conflict (role_id, table_name, column_name)
    do update set can_read = excluded.can_read, can_write = excluded.can_write;

  insert into public.role_column_permissions
    (role_id, table_name, column_name, can_read, can_write)
  values (v_viewer, 'consignments', 'in_ref', true, false)
  on conflict (role_id, table_name, column_name)
    do update set can_read = excluded.can_read, can_write = excluded.can_write;
end $$;
