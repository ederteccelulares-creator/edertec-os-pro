-- Edertec OS Pro - atomic, tenant-scoped backup restoration
-- Apply after migrations 0001 through 0017.
-- This first release only restores into an operationally empty organization.
-- Existing active destination branches are reused through an explicit one-to-one map.

create table if not exists public.backup_restore_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key uuid not null,
  backup_hash text not null,
  restored_by uuid not null references auth.users(id),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
alter table public.backup_restore_runs enable row level security;
revoke all on public.backup_restore_runs from public, anon, authenticated;

create or replace function public.restore_backup_insert_table(
  p_table text,
  p_rows jsonb,
  p_organization_id uuid,
  p_branch_mapping jsonb,
  p_user_mapping jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_value jsonb;
  user_field text;
  user_fields text[];
  column_list text;
  select_list text;
  identity_clause text := '';
  inserted_count integer := 0;
  has_identity boolean;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Invalid backup collection for %', p_table;
  end if;

  select array_agg(column_name order by ordinal_position),
         array_agg('x.' || quote_ident(column_name) order by ordinal_position),
         coalesce(bool_or(is_identity = 'YES' and identity_generation = 'ALWAYS'), false)
    into column_list, select_list, has_identity
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table
    and is_generated = 'NEVER';

  if column_list is null then
    raise exception 'Unsupported restore table: %', p_table;
  end if;

  select string_agg(quote_ident(value), ',' order by ordinality),
         string_agg('x.' || quote_ident(value), ',' order by ordinality)
    into column_list, select_list
  from unnest(column_list) with ordinality as cols(value, ordinality);

  if has_identity then identity_clause := 'OVERRIDING SYSTEM VALUE'; end if;

  user_fields := case p_table
    when 'service_orders' then array['technician_id','opened_by']
    when 'service_order_events' then array['changed_by']
    when 'financial_entries' then array['created_by']
    when 'sales' then array['sold_by']
    when 'service_order_lines' then array['created_by']
    when 'stock_movements' then array['actor_id']
    when 'audit_logs' then array['actor_id']
    else array[]::text[]
  end;

  for row_value in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(row_value) <> 'object'
       or row_value->>'organization_id' is distinct from p_organization_id::text then
      raise exception 'Invalid tenant key in %.', p_table;
    end if;

    row_value := jsonb_set(row_value, '{organization_id}', to_jsonb(p_organization_id), true);

    if row_value ? 'branch_id' and row_value->>'branch_id' is not null then
      if not (p_branch_mapping ? (row_value->>'branch_id')) then
        raise exception 'Missing branch mapping in % for %', p_table, row_value->>'branch_id';
      end if;
      row_value := jsonb_set(
        row_value, '{branch_id}',
        to_jsonb((p_branch_mapping->>(row_value->>'branch_id'))::uuid), true
      );
    end if;

    foreach user_field in array user_fields
    loop
      if row_value ? user_field and row_value->>user_field is not null then
        if not (p_user_mapping ? (row_value->>user_field)) then
          raise exception 'Missing user mapping in %.% for %', p_table, user_field, row_value->>user_field;
        end if;
        row_value := jsonb_set(
          row_value, array[user_field],
          to_jsonb((p_user_mapping->>(row_value->>user_field))::uuid), true
        );
      end if;
    end loop;

    -- Generated columns (for example service_order_lines.line_total) are
    -- excluded from the insert column list and recalculated by PostgreSQL.
    execute format(
      'insert into public.%I (%s) %s
       select %s
       from jsonb_populate_record(null::public.%I, $1) as x',
      p_table, column_list, identity_clause, select_list, p_table
    ) using row_value;

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.restore_organization_backup(
  p_organization_id uuid,
  p_actor_user_id uuid,
  p_idempotency_key uuid,
  p_backup jsonb,
  p_branch_mapping jsonb,
  p_user_mapping jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_tables text[] := array[
    'branches','customers','devices','service_orders','service_order_events',
    'inventory_items','branch_inventory','stock_movements','financial_categories',
    'financial_entries','sales','sale_items','service_catalog','service_order_lines',
    'audit_logs'
  ];
  table_name text;
  row_value jsonb;
  source_branch_ids uuid[] := array[]::uuid[];
  source_user_ids uuid[] := array[]::uuid[];
  user_fields text[];
  user_field text;
  source_id uuid;
  target_id uuid;
  mapped_targets uuid[];
  has_rows boolean;
  total_rows integer := 0;
  restored_counts jsonb := '{}'::jsonb;
  inserted integer;
  backup_hash text;
  previous_run public.backup_restore_runs;
  result_value jsonb;
  identity_sequence text;
  max_identity bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Restore must be invoked by the trusted service backend';
  end if;
  if p_organization_id is null or p_actor_user_id is null or p_idempotency_key is null then
    raise exception 'Organization, actor and idempotency key are required';
  end if;
  if p_backup is null or octet_length(p_backup::text) > 10485760 then
    raise exception 'Backup is missing or exceeds the 10 MB limit';
  end if;
  if jsonb_typeof(p_backup) <> 'object'
     or p_backup->>'format' <> 'edertec-os-pro-backup'
     or p_backup->>'version' <> '1'
     or jsonb_typeof(p_backup->'tables') <> 'object'
     or p_backup#>>'{organization,id}' is distinct from p_organization_id::text then
    raise exception 'Backup format, version or organization is invalid';
  end if;
  if jsonb_typeof(p_branch_mapping) <> 'object'
     or jsonb_typeof(p_user_mapping) <> 'object' then
    raise exception 'Branch and user mappings must be JSON objects';
  end if;

  -- Serialize restores for this organization and recheck authorization.
  perform 1 from public.organizations where id = p_organization_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = p_actor_user_id
      and active = true
      and role in ('owner','admin')
  ) then
    raise exception 'Only an active owner or admin can restore a backup';
  end if;

  backup_hash := md5(p_backup::text);
  select * into previous_run
  from public.backup_restore_runs
  where organization_id = p_organization_id
    and idempotency_key = p_idempotency_key;
  if found then
    if previous_run.backup_hash <> backup_hash then
      raise exception 'Idempotency key was already used for a different backup';
    end if;
    return previous_run.result || jsonb_build_object('replayed', true);
  end if;

  -- Reject unknown/missing tables and oversized collections before writes.
  for table_name in select jsonb_object_keys(p_backup->'tables')
  loop
    if not table_name = any(expected_tables) then
      raise exception 'Unknown backup table: %', table_name;
    end if;
  end loop;
  for table_name in select unnest(expected_tables)
  loop
    if jsonb_typeof(p_backup->'tables'->table_name) <> 'array' then
      raise exception 'Missing or invalid backup collection: %', table_name;
    end if;
    if jsonb_array_length(p_backup->'tables'->table_name) > 10000 then
      raise exception 'Backup collection exceeds 10,000 rows: %', table_name;
    end if;
    total_rows := total_rows + jsonb_array_length(p_backup->'tables'->table_name);
  end loop;
  if total_rows > 150000 then raise exception 'Backup exceeds the total row limit'; end if;

  -- The first release is intentionally not a merge: all operational tables
  -- must be empty. Branches are pre-created by onboarding and are mapped.
  for table_name in select unnest(expected_tables)
  loop
    if table_name = 'branches' then continue; end if;
    execute format('select exists(select 1 from public.%I where organization_id = $1)', table_name)
      into has_rows using p_organization_id;
    if has_rows then
      raise exception 'Destination is not empty: table % already contains records', table_name;
    end if;
  end loop;

  -- Validate the complete one-to-one source branch map to active branches.
  for row_value in select value from jsonb_array_elements(p_backup->'tables'->'branches')
  loop
    source_id := (row_value->>'id')::uuid;
    if source_id = any(source_branch_ids) then raise exception 'Duplicate source branch ID'; end if;
    source_branch_ids := array_append(source_branch_ids, source_id);
  end loop;
  if (select count(*) from jsonb_object_keys(p_branch_mapping)) <> coalesce(array_length(source_branch_ids,1),0) then
    raise exception 'Branch mapping must cover every source branch exactly once';
  end if;
  select array_agg(value::uuid) into mapped_targets from jsonb_each_text(p_branch_mapping);
  if coalesce(array_length(mapped_targets,1),0) <> coalesce(array_length(source_branch_ids,1),0)
     or (select count(distinct value) from unnest(mapped_targets) value) <> coalesce(array_length(mapped_targets,1),0) then
    raise exception 'Branch mapping targets must be unique';
  end if;
  foreach source_id in array source_branch_ids
  loop
    if not (p_branch_mapping ? source_id::text) then raise exception 'Missing source branch mapping: %', source_id; end if;
  end loop;
  foreach target_id in array mapped_targets
  loop
    if not exists (
      select 1 from public.branches
      where id = target_id and organization_id = p_organization_id and active = true
    ) then raise exception 'Mapped destination branch is missing or inactive: %', target_id; end if;
  end loop;

  -- Collect every Auth reference and require a complete one-to-one mapping
  -- to active members of this organization.
  for table_name in select unnest(expected_tables)
  loop
    user_fields := case table_name
      when 'service_orders' then array['technician_id','opened_by']
      when 'service_order_events' then array['changed_by']
      when 'financial_entries' then array['created_by']
      when 'sales' then array['sold_by']
      when 'service_order_lines' then array['created_by']
      when 'stock_movements' then array['actor_id']
      when 'audit_logs' then array['actor_id']
      else array[]::text[]
    end;
    foreach user_field in array user_fields
    loop
      for row_value in select value from jsonb_array_elements(p_backup->'tables'->table_name)
      loop
        if row_value->>user_field is not null then
          source_id := (row_value->>user_field)::uuid;
          if not source_id = any(source_user_ids) then
            source_user_ids := array_append(source_user_ids, source_id);
          end if;
        end if;
      end loop;
    end loop;
  end loop;
  if (select count(*) from jsonb_object_keys(p_user_mapping)) <> coalesce(array_length(source_user_ids,1),0) then
    raise exception 'User mapping must cover every source user exactly once';
  end if;
  select array_agg(value::uuid) into mapped_targets from jsonb_each_text(p_user_mapping);
  if coalesce(array_length(mapped_targets,1),0) <> coalesce(array_length(source_user_ids,1),0)
     or (select count(distinct value) from unnest(mapped_targets) value) <> coalesce(array_length(mapped_targets,1),0) then
    raise exception 'User mapping targets must be unique';
  end if;
  foreach source_id in array source_user_ids
  loop
    if not (p_user_mapping ? source_id::text) then raise exception 'Missing source user mapping: %', source_id; end if;
  end loop;
  foreach target_id in array mapped_targets
  loop
    if not exists (
      select 1 from public.organization_members
      where organization_id = p_organization_id and user_id = target_id and active = true
    ) then raise exception 'Mapped user is not an active member of this organization: %', target_id; end if;
  end loop;

  insert into public.backup_restore_runs(organization_id,idempotency_key,backup_hash,restored_by)
  values(p_organization_id,p_idempotency_key,backup_hash,p_actor_user_id);

  -- Restore in FK dependency order. Branch records are mapped to existing
  -- active destination branches and therefore are not inserted.
  foreach table_name in array array[
    'customers','inventory_items','financial_categories','service_catalog',
    'devices','branch_inventory','service_orders','financial_entries','sales',
    'service_order_events','stock_movements','sale_items','service_order_lines','audit_logs'
  ]
  loop
    inserted := public.restore_backup_insert_table(
      table_name, p_backup->'tables'->table_name, p_organization_id,
      p_branch_mapping, p_user_mapping
    );
    restored_counts := restored_counts || jsonb_build_object(table_name, inserted);
  end loop;

  -- Reconcile GENERATED ALWAYS identity sequences after preserving source
  -- order numbers, sale numbers and audit log IDs.
  identity_sequence := pg_get_serial_sequence('public.service_orders','order_number');
  execute 'select max(order_number) from public.service_orders where organization_id = $1'
    into max_identity using p_organization_id;
  if identity_sequence is not null then
    if max_identity is null then perform setval(identity_sequence,1,false);
    else perform setval(identity_sequence,max_identity,true); end if;
  end if;

  identity_sequence := pg_get_serial_sequence('public.sales','sale_number');
  execute 'select max(sale_number) from public.sales where organization_id = $1'
    into max_identity using p_organization_id;
  if identity_sequence is not null then
    if max_identity is null then perform setval(identity_sequence,1,false);
    else perform setval(identity_sequence,max_identity,true); end if;
  end if;

  identity_sequence := pg_get_serial_sequence('public.audit_logs','id');
  execute 'select max(id) from public.audit_logs where organization_id = $1'
    into max_identity using p_organization_id;
  if identity_sequence is not null then
    if max_identity is null then perform setval(identity_sequence,1,false);
    else perform setval(identity_sequence,max_identity,true); end if;
  end if;

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,p_actor_user_id,'backup.restored','organization',p_organization_id::text,
    jsonb_build_object('restored_counts',restored_counts,'idempotency_key',p_idempotency_key));

  result_value := jsonb_build_object(
    'success', true,
    'applied', true,
    'replayed', false,
    'organization_id', p_organization_id,
    'restored_counts', restored_counts,
    'restored_at', now()
  );
  update public.backup_restore_runs set result = result_value
  where organization_id = p_organization_id and idempotency_key = p_idempotency_key;

  return result_value;
end;
$$;

revoke all on function public.restore_backup_insert_table(text,jsonb,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.restore_organization_backup(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.restore_organization_backup(uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
