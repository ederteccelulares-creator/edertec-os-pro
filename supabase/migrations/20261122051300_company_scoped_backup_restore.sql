-- Company-scoped atomic restore for operational backups.
-- Restore is intentionally same-company only and requires an empty operational
-- destination. Existing branches and Auth identities must still exist.
create table public.company_backup_restore_runs (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 idempotency_key uuid not null,
 backup_hash text not null,
 restored_by uuid not null references auth.users(id),
 result jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(company_id,idempotency_key)
);
alter table public.company_backup_restore_runs enable row level security;
revoke all on public.company_backup_restore_runs from public,anon,authenticated;

create or replace function public.restore_company_backup(
 p_company_id uuid,
 p_actor_user_id uuid,
 p_idempotency_key uuid,
 p_backup jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 allowed_tables text[] := array[
  'customers','employees','service_catalog','products','service_orders',
  'service_order_items','stock_movements','payments','suppliers','purchases',
  'purchase_items','cash_sessions','cash_transactions','company_financial_entries',
  'audit_logs'
 ];
 table_name text;
 row_value jsonb;
 rows_value jsonb;
 column_names text[];
 column_list text;
 select_list text;
 identity_always boolean;
 identity_clause text;
 row_count integer;
 has_rows boolean;
 total_rows integer := 0;
 restored_counts jsonb := '{}'::jsonb;
 backup_hash text;
 previous_run public.company_backup_restore_runs%rowtype;
 result_value jsonb;
 source_company_id uuid;
 branch_ids uuid[];
 branch_id uuid;
 auth_user_id uuid;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
  raise exception 'Restore must be invoked by the trusted service backend';
 end if;
 if p_company_id is null or p_actor_user_id is null or p_idempotency_key is null then
  raise exception 'Company, actor and idempotency key are required';
 end if;
 if p_backup is null or octet_length(p_backup::text)>10485760 then
  raise exception 'Backup is missing or exceeds the 10 MB limit';
 end if;
 if p_backup->>'format'<>'edertec-os-pro-company-backup'
   or p_backup->>'version'<>'1'
   or jsonb_typeof(p_backup->'tables')<>'object'
   or p_backup#>>'{company,id}' is null then
  raise exception 'Backup format or version is invalid';
 end if;
 source_company_id := (p_backup#>>'{company,id}')::uuid;
 if source_company_id<>p_company_id then
  raise exception 'Backup belongs to a different company';
 end if;

 perform 1 from public.companies c where c.id=p_company_id for update;
 if not found then raise exception 'Company not found'; end if;
 if not exists(
  select 1 from public.company_members cm
  where cm.company_id=p_company_id and cm.user_id=p_actor_user_id
    and cm.role in ('owner','admin')
 ) then raise exception 'Only a company owner or admin can restore a backup'; end if;

 backup_hash:=md5(p_backup::text);
 select * into previous_run from public.company_backup_restore_runs
 where company_id=p_company_id and idempotency_key=p_idempotency_key;
 if found then
  if previous_run.backup_hash<>backup_hash then
   raise exception 'Idempotency key was already used for another backup';
  end if;
  return previous_run.result || jsonb_build_object('replayed',true);
 end if;

 for table_name in select jsonb_object_keys(p_backup->'tables') loop
  if not (table_name=any(array_append(allowed_tables,'branches'))) then
   raise exception 'Unsupported backup collection: %',table_name;
  end if;
 end loop;
 foreach table_name in array array_append(allowed_tables,'branches') loop
  rows_value:=p_backup->'tables'->table_name;
  if jsonb_typeof(rows_value)<>'array' then
   raise exception 'Missing or invalid backup collection: %',table_name;
  end if;
  row_count:=jsonb_array_length(rows_value);
  if row_count>10000 then raise exception 'Backup collection too large: %',table_name; end if;
  total_rows:=total_rows+row_count;
 end loop;
 if total_rows>150000 then raise exception 'Backup exceeds total row limit'; end if;

 -- Existing branches are not overwritten. They must match the exported IDs.
 select coalesce(array_agg((value->>'id')::uuid),'{}'::uuid[])
 into branch_ids from jsonb_array_elements(p_backup#>'{tables,branches}');
 foreach branch_id in array branch_ids loop
  if not exists(select 1 from public.branches b where b.id=branch_id and b.company_id=p_company_id) then
   raise exception 'Backup branch % is missing from this company',branch_id;
  end if;
 end loop;

 -- Prevent accidental merges: every restorable destination collection must be empty.
 foreach table_name in array allowed_tables loop
  execute format('select exists(select 1 from public.%I where company_id=$1)',table_name)
   into has_rows using p_company_id;
  if has_rows then
   raise exception 'Restore destination is not empty: % already contains data',table_name;
  end if;
 end loop;

 -- Auth-linked references are preserved only if the referenced account still exists.
 foreach table_name in array allowed_tables loop
  for row_value in select value from jsonb_array_elements(p_backup->'tables'->table_name) loop
   if row_value->>'company_id' is distinct from p_company_id::text then
    raise exception 'Invalid company_id in % backup row',table_name;
   end if;
   foreach auth_user_id in array array[
    nullif(row_value->>'user_id','')::uuid,
    nullif(row_value->>'opened_by','')::uuid,
    nullif(row_value->>'closed_by','')::uuid
   ] loop
    if auth_user_id is not null and not exists(select 1 from auth.users u where u.id=auth_user_id) then
     raise exception 'Backup references an Auth user that no longer exists: %',auth_user_id;
    end if;
   end loop;
  end loop;
 end loop;

 insert into public.company_backup_restore_runs(company_id,idempotency_key,backup_hash,restored_by)
 values(p_company_id,p_idempotency_key,backup_hash,p_actor_user_id);

 -- Parent-to-child order. Generated columns are omitted and recalculated.
 foreach table_name in array array[
  'customers','employees','service_catalog','products','suppliers','service_orders',
  'cash_sessions','purchases','service_order_items','stock_movements','payments',
  'purchase_items','cash_transactions','company_financial_entries','audit_logs'
 ] loop
  select array_agg(column_name order by ordinal_position),
         coalesce(bool_or(is_identity='YES' and identity_generation='ALWAYS'),false)
  into column_names,identity_always
  from information_schema.columns
  where table_schema='public' and table_name=restore_company_backup.table_name
    and is_generated='NEVER';
  select string_agg(quote_ident(c),',' order by ordinality),
         string_agg('x.'||quote_ident(c),',' order by ordinality)
  into column_list,select_list
  from unnest(column_names) with ordinality as cols(c,ordinality);
  identity_clause:=case when identity_always then 'OVERRIDING SYSTEM VALUE' else '' end;
  for row_value in select value from jsonb_array_elements(p_backup->'tables'->table_name) loop
   execute format(
    'insert into public.%I (%s) %s select %s from jsonb_populate_record(null::public.%I,$1) x',
    table_name,column_list,identity_clause,select_list,table_name
   ) using row_value;
  end loop;
  restored_counts:=restored_counts||jsonb_build_object(table_name,jsonb_array_length(p_backup->'tables'->table_name));
 end loop;

 -- Reconcile the generated audit identity after explicit historical IDs.
 perform setval(pg_get_serial_sequence('public.audit_logs','id'),
  greatest(coalesce((select max(id) from public.audit_logs),1),1),
  exists(select 1 from public.audit_logs));

 insert into public.audit_logs(company_id,user_id,action,entity_table,entity_id,details)
 values(p_company_id,p_actor_user_id,'backup.restored','companies',p_company_id::text,
  jsonb_build_object('restored_counts',restored_counts,'idempotency_key',p_idempotency_key));

 result_value:=jsonb_build_object(
  'success',true,'applied',true,'replayed',false,'company_id',p_company_id,
  'restored_counts',restored_counts,'restored_at',now()
 );
 update public.company_backup_restore_runs
 set result=result_value where company_id=p_company_id and idempotency_key=p_idempotency_key;
 return result_value;
end;
$$;

revoke all on function public.restore_company_backup(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.restore_company_backup(uuid,uuid,uuid,jsonb) to service_role;
