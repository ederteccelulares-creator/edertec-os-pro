-- Company backup export authorization and tenant-scope tests.
-- Runs only in the disposable PostgreSQL CI database.

\set ON_ERROR_STOP on

insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','backup-owner-a@example.invalid'),
 ('92000000-0000-4000-8000-000000000002','backup-owner-b@example.invalid');

insert into public.companies(id,name) values
 ('93000000-0000-4000-8000-000000000001','Backup Tenant A'),
 ('94000000-0000-4000-8000-000000000002','Backup Tenant B');

insert into public.company_members(company_id,user_id,role) values
 ('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','owner');

insert into public.branches(id,company_id,name) values
 ('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Matriz A'),
 ('96000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002','Matriz B');

insert into public.customers(id,company_id,name,phone) values
 ('97000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Cliente A','111'),
 ('98000000-0000-4000-8000-000000000002','94000000-0000-4000-8000-000000000002','Cliente B','222');

grant execute on function public.export_company_backup(uuid) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',false);

do $$
declare backup_value jsonb;
begin
 backup_value:=public.export_company_backup('93000000-0000-4000-8000-000000000001');
 if backup_value->>'format' <> 'edertec-os-pro-company-backup'
    or backup_value->>'version' <> '1'
    or backup_value#>>'{company,id}' <> '93000000-0000-4000-8000-000000000001'
    or jsonb_array_length(backup_value#>'{tables,branches}') <> 1
    or jsonb_array_length(backup_value#>'{tables,customers}') <> 1
    or backup_value#>>'{tables,customers,0,name}' <> 'Cliente A' then
   raise exception 'Company backup export did not return the expected tenant-scoped data: %',backup_value;
 end if;
 if backup_value::text like '%Cliente B%' or backup_value::text like '%Backup Tenant B%' then
   raise exception 'Company backup export leaked another tenant''s data';
 end if;
 begin
   perform public.export_company_backup('94000000-0000-4000-8000-000000000002');
   raise exception 'Cross-tenant backup export unexpectedly succeeded';
 exception when raise_exception then
   if sqlerrm like 'Cross-tenant backup export unexpectedly succeeded' then raise; end if;
 end;
end;
$$;
reset role;

do $$
begin
 if has_function_privilege('anon','public.export_company_backup(uuid)','EXECUTE')
    or has_function_privilege('public','public.export_company_backup(uuid)','EXECUTE') then
   raise exception 'Anonymous/public roles can execute company backup export';
 end if;
end;
$$;

select 'Company backup export authorization and isolation tests passed.' as result;
