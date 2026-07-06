-- =============================================================================
-- Roles & permissions cleanup: human-readable groups backed by real enforcement
-- =============================================================================
-- 1. Seed EFD permission rows so custom roles can be granted EFD work.
-- 2. Stop hard-coding the `operator` role in consignment/EFD RLS policies.
-- 3. Add the same per-column UPDATE guard to efd_records that consignments has.

create or replace function public.can_user_write_any(p_table text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.is_admin(),
    exists (
      select 1
      from public.user_roles ur
      join public.role_column_permissions rcp on rcp.role_id = ur.role_id
      where ur.user_id = (select auth.uid())
        and rcp.table_name = p_table
        and rcp.can_write
    )
  );
$$;

comment on function public.can_user_write_any(text) is
  'True when the current user can write at least one column in a table. Used by RLS table-level gates; column guards still enforce exact changed columns.';

create or replace function public.pipeline_stage_column(p_stage public.pipeline_stage)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'manifest' then 'manifest_status'
    when 'shipping_batch' then 'shipping_batch_status'
    when 'tanesws' then 'tanesws_status'
    when 'assessment' then 'assessment_status'
    when 'tbs_loading' then 'tbs_loading_status'
    when 'tbs_debit' then 'tbs_debit_status'
    when 'manifest_comp' then 'manifest_comp_status'
    when 'duty' then 'duty_status'
    when 'inspection_file' then 'inspection_file_status'
    when 'release' then 'release_status'
  end;
$$;

comment on function public.pipeline_stage_column(public.pipeline_stage) is
  'Maps advance_stage pipeline enum values to the consignment status column controlled by role_column_permissions.';

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
  v_stage_column  text;
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

  select * into v_c from public.consignments where id = p_id;
  return v_c;
end;
$$;

comment on function public.advance_stage(uuid, public.pipeline_stage, text, text) is
  'Mutates pipeline stage columns. Caller must have write permission on the target status column. Enforces PRD stage prerequisites and writes stage_history.';

do $$
declare
  v_operator uuid;
  v_viewer uuid;
  col text;
  efd_columns constant text[] := array[
    'efd_code',
    'efd_time',
    'is_private',
    'is_transit',
    'is_shared',
    'notes'
  ];
begin
  select id into v_operator from public.roles where name = 'operator';
  select id into v_viewer from public.roles where name = 'viewer';

  foreach col in array efd_columns loop
    if v_operator is not null then
      insert into public.role_column_permissions
        (role_id, table_name, column_name, can_read, can_write)
      values (v_operator, 'efd_records', col, true, true)
      on conflict (role_id, table_name, column_name)
      do update set can_read = excluded.can_read, can_write = excluded.can_write;
    end if;

    if v_viewer is not null then
      insert into public.role_column_permissions
        (role_id, table_name, column_name, can_read, can_write)
      values (v_viewer, 'efd_records', col, true, false)
      on conflict (role_id, table_name, column_name)
      do update set can_read = excluded.can_read, can_write = excluded.can_write;
    end if;
  end loop;
end;
$$;

-- Consignments: custom roles with the right column permissions should pass the
-- table-level RLS gate. The BEFORE UPDATE guard still checks exact columns.
drop policy if exists consignments_insert on public.consignments;
create policy consignments_insert
  on public.consignments for insert to authenticated
  with check (public.can_user_write('consignments', 'ref_no'));

drop policy if exists consignments_update on public.consignments;
create policy consignments_update
  on public.consignments for update to authenticated
  using (
    deleted_at is null
    and public.can_user_write_any('consignments')
  )
  with check (true);

-- EFD records: write access is now permission-row based instead of role-name
-- based. The trigger below catches over-broad direct REST PATCH requests.
drop policy if exists efd_records_insert on public.efd_records;
create policy efd_records_insert
  on public.efd_records for insert to authenticated
  with check (public.can_user_write('efd_records', 'efd_code'));

drop policy if exists efd_records_update on public.efd_records;
create policy efd_records_update
  on public.efd_records for update to authenticated
  using (public.can_user_write_any('efd_records'))
  with check (true);

drop policy if exists efc_insert on public.efd_record_consignments;
create policy efc_insert
  on public.efd_record_consignments for insert to authenticated
  with check (public.can_user_write('efd_records', 'efd_code'));

drop policy if exists efc_delete on public.efd_record_consignments;
create policy efc_delete
  on public.efd_record_consignments for delete to authenticated
  using (public.is_admin() or public.can_user_write('efd_records', 'efd_code'));

create or replace function public.efd_records_enforce_column_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  guarded_columns constant text[] := array[
    'efd_code',
    'efd_time',
    'is_private',
    'is_transit',
    'is_shared',
    'notes'
  ];
begin
  if public.is_admin() then
    return new;
  end if;

  foreach k in array guarded_columns loop
    if old_row -> k is distinct from new_row -> k then
      if not public.can_user_write('efd_records', k) then
        raise exception 'Permission denied to update efd_records.%', k
          using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

comment on function public.efd_records_enforce_column_write() is
  'Blocks direct updates to efd_records columns unless role_column_permissions grants write access.';

drop trigger if exists efd_records_aaa_column_write_guard on public.efd_records;
create trigger efd_records_aaa_column_write_guard
  before update on public.efd_records
  for each row execute function public.efd_records_enforce_column_write();
