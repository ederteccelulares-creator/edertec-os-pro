create table if not exists public.company_financial_accounts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 branch_id uuid,
 account_name text not null check (char_length(trim(account_name)) between 2 and 80),
 bank_name text not null check (char_length(trim(bank_name)) between 2 and 80),
 account_type text not null default 'checking' check (account_type in ('checking','savings','digital_wallet','cash','other')),
 agency text,
 account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
 opening_balance numeric(12,2) not null default 0,
 notes text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint company_financial_accounts_branch_company_fk foreign key(branch_id,company_id) references public.branches(id,company_id)
);
create index if not exists company_financial_accounts_company_idx on public.company_financial_accounts(company_id,is_active,created_at desc);
alter table public.company_financial_accounts enable row level security;
do $
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='company_financial_accounts' and policyname='Company members can read financial accounts') then
  create policy "Company members can read financial accounts" on public.company_financial_accounts for select to authenticated using (public.is_company_member(company_id));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='company_financial_accounts' and policyname='Company finance managers can manage financial accounts') then
  create policy "Company finance managers can manage financial accounts" on public.company_financial_accounts for all to authenticated using (public.has_company_role(company_id,array['owner','admin','manager'])) with check (public.has_company_role(company_id,array['owner','admin','manager']));
 end if;
end $;
CREATE OR REPLACE FUNCTION public.export_company_backup(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  table_name text;
  tables_value jsonb := '{}'::jsonb;
  rows_value jsonb;
  total_rows integer := 0;
  row_count integer;
  allowed_tables text[] := array[
    'branches','customers','employees','service_catalog','products',
    'service_orders','service_order_items','stock_movements','payments',
    'suppliers','purchases','purchase_items','cash_sessions','cash_transactions',
    'company_financial_entries','company_financial_accounts'
  ];
  result_value jsonb;
begin
  if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin']) then
    raise exception 'Only an active company owner or admin can export a backup';
  end if;
  perform 1 from public.companies where id=p_company_id for share;
  if not found then raise exception 'Company not found'; end if;
  foreach table_name in array allowed_tables loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.company_id = $1',
      table_name
    ) into rows_value using p_company_id;
    row_count := jsonb_array_length(rows_value);
    if row_count > 10000 then raise exception 'Backup table % exceeds the 10,000 row limit',table_name; end if;
    total_rows := total_rows + row_count;
    if total_rows > 150000 then raise exception 'Backup exceeds the 150,000 row limit'; end if;
    tables_value := tables_value || jsonb_build_object(table_name,rows_value);
  end loop;
  result_value := jsonb_build_object(
    'format','edertec-os-pro-company-backup','version',1,'exported_at',now(),
    'company',(select jsonb_build_object('id',c.id,'name',c.name,'legal_name',c.legal_name) from public.companies c where c.id=p_company_id),
    'tables',tables_value,'record_count',total_rows
  );
  if octet_length(result_value::text)>10485760 then raise exception 'Backup exceeds the 10 MB limit'; end if;
  return result_value;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.restore_company_backup(p_company_id uuid, p_actor_user_id uuid, p_idempotency_key uuid, p_backup jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 allowed_tables text[] := array[
  'customers','employees','service_catalog','products','service_orders',
  'service_order_items','stock_movements','payments','suppliers','purchases',
  'purchase_items','cash_sessions','cash_transactions','company_financial_entries','company_financial_accounts'
 ];
 v_table_name text;
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
    and cm.is_active = true and cm.role in ('owner','admin')
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

 for v_table_name in select jsonb_object_keys(p_backup->'tables') loop
  if not (v_table_name=any(array_append(allowed_tables,'branches'))) then
   raise exception 'Unsupported backup collection: %',v_table_name;
  end if;
 end loop;
 foreach v_table_name in array array_append(allowed_tables,'branches') loop
  rows_value:=p_backup->'tables'->v_table_name;
  if jsonb_typeof(rows_value)<>'array' then
   raise exception 'Missing or invalid backup collection: %',v_table_name;
  end if;
  row_count:=jsonb_array_length(rows_value);
  if row_count>10000 then raise exception 'Backup collection too large: %',v_table_name; end if;
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
 foreach v_table_name in array allowed_tables loop
  execute format('select exists(select 1 from public.%I where company_id=$1)',v_table_name)
   into has_rows using p_company_id;
  if has_rows then
   raise exception 'Restore destination is not empty: % already contains data',v_table_name;
  end if;
 end loop;

 -- Auth-linked references are preserved only if the referenced account still exists.
 foreach v_table_name in array allowed_tables loop
  for row_value in select value from jsonb_array_elements(p_backup->'tables'->v_table_name) loop
   if row_value->>'company_id' is distinct from p_company_id::text then
    raise exception 'Invalid company_id in % backup row',v_table_name;
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
 foreach v_table_name in array array[
  'customers','employees','service_catalog','products','suppliers','company_financial_accounts','service_orders',
  'cash_sessions','purchases','service_order_items','stock_movements','payments',
  'purchase_items','cash_transactions','company_financial_entries'
 ] loop
  select array_agg(column_name order by ordinal_position),
         coalesce(bool_or(is_identity='YES' and identity_generation='ALWAYS'),false)
  into column_names,identity_always
  from information_schema.columns
  where table_schema='public' and table_name=v_table_name
    and is_generated='NEVER';
  select string_agg(quote_ident(c),',' order by ordinality),
         string_agg('x.'||quote_ident(c),',' order by ordinality)
  into column_list,select_list
  from unnest(column_names) with ordinality as cols(c,ordinality);
  identity_clause:=case when identity_always then 'OVERRIDING SYSTEM VALUE' else '' end;
  for row_value in select value from jsonb_array_elements(p_backup->'tables'->v_table_name) loop
   execute format(
    'insert into public.%I (%s) %s select %s from jsonb_populate_record(null::public.%I,$1) x',
    v_table_name,column_list,identity_clause,select_list,v_table_name
   ) using row_value;
  end loop;
  restored_counts:=restored_counts||jsonb_build_object(v_table_name,jsonb_array_length(p_backup->'tables'->v_table_name));
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
$function$
;