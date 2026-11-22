-- Company-scoped transactional backup restore tests.
-- Runs only against the disposable PostgreSQL database in CI.

\set ON_ERROR_STOP on

insert into auth.users(id,email) values
 ('a1000000-0000-4000-8000-000000000001','restore-owner-a@example.invalid'),
 ('a2000000-0000-4000-8000-000000000002','restore-owner-b@example.invalid');

insert into public.companies(id,name) values
 ('a3000000-0000-4000-8000-000000000001','Restore Company A'),
 ('a4000000-0000-4000-8000-000000000002','Restore Company B');

insert into public.company_members(company_id,user_id,role) values
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner'),
 ('a4000000-0000-4000-8000-000000000002','a2000000-0000-4000-8000-000000000002','owner');

insert into public.branches(id,company_id,name) values
 ('a5000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Matriz A'),
 ('a6000000-0000-4000-8000-000000000002','a4000000-0000-4000-8000-000000000002','Matriz B');

-- Service backend claim is required by the restore RPC.
select set_config('request.jwt.claim.role','service_role',false);

do $$
declare
 backup_value jsonb;
 invalid_backup jsonb;
 result_value jsonb;
 replay_value jsonb;
 restore_key uuid := 'a7000000-0000-4000-8000-000000000001';
begin
 backup_value:=jsonb_build_object(
  'format','edertec-os-pro-company-backup',
  'version',1,
  'exported_at',now(),
  'company',jsonb_build_object('id','a3000000-0000-4000-8000-000000000001','name','Restore Company A'),
  'tables',jsonb_build_object(
   'branches',jsonb_build_array(jsonb_build_object(
    'id','a5000000-0000-4000-8000-000000000001',
    'company_id','a3000000-0000-4000-8000-000000000001','name','Matriz A'
   )),
   'customers',jsonb_build_array(jsonb_build_object(
    'id','a8000000-0000-4000-8000-000000000001',
    'company_id','a3000000-0000-4000-8000-000000000001',
    'branch_id','a5000000-0000-4000-8000-000000000001',
    'name','Cliente restaurado','phone','47999990000','address','{}'::jsonb
   )),
   'employees','[]'::jsonb,
   'service_catalog','[]'::jsonb,
   'products',jsonb_build_array(jsonb_build_object(
    'id','a9000000-0000-4000-8000-000000000001',
    'company_id','a3000000-0000-4000-8000-000000000001',
    'name','Tela de teste','cost_price',50,'sale_price',100,'stock_quantity',4
   )),
   'service_orders',jsonb_build_array(jsonb_build_object(
    'id','aa000000-0000-4000-8000-000000000001',
    'company_id','a3000000-0000-4000-8000-000000000001',
    'branch_id','a5000000-0000-4000-8000-000000000001',
    'customer_id','a8000000-0000-4000-8000-000000000001',
    'order_number',777,'reported_issue','Tela quebrada','estimated_price',150
   )),
   'service_order_items',jsonb_build_array(jsonb_build_object(
    'id','ab000000-0000-4000-8000-000000000001',
    'company_id','a3000000-0000-4000-8000-000000000001',
    'service_order_id','aa000000-0000-4000-8000-000000000001',
    'item_type','service','description','Troca de tela','quantity',1,'unit_price',150
   )),
   'stock_movements','[]'::jsonb,'payments','[]'::jsonb,'suppliers','[]'::jsonb,
   'purchases','[]'::jsonb,'purchase_items','[]'::jsonb,'cash_sessions','[]'::jsonb,
   'cash_transactions','[]'::jsonb,'company_financial_entries','[]'::jsonb,'audit_logs','[]'::jsonb
  )
 );

 result_value:=public.restore_company_backup(
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',restore_key,backup_value
 );
 if result_value->>'success'<>'true' or result_value->>'applied'<>'true' then
  raise exception 'Restore did not report success: %',result_value;
 end if;
 if (select count(*) from public.customers where company_id='a3000000-0000-4000-8000-000000000001')<>1
  or (select count(*) from public.service_orders where company_id='a3000000-0000-4000-8000-000000000001')<>1
  or (select count(*) from public.service_order_items where company_id='a3000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'Restore did not import the expected related records';
 end if;
 if not exists(select 1 from public.service_orders where order_number=777 and branch_id='a5000000-0000-4000-8000-000000000001') then
  raise exception 'Restore did not preserve order number or branch reference';
 end if;
 if not exists(select 1 from public.service_order_items where total_price=150) then
  raise exception 'Generated service order item total was not recalculated';
 end if;

 replay_value:=public.restore_company_backup(
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',restore_key,backup_value
 );
 if replay_value->>'replayed'<>'true'
  or (select count(*) from public.customers where company_id='a3000000-0000-4000-8000-000000000001')<>1 then
  raise exception 'Idempotent replay duplicated restored records';
 end if;

 -- The same backup cannot be applied to a different tenant.
 begin
  perform public.restore_company_backup(
   'a4000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000002',
   'a7000000-0000-4000-8000-000000000002',backup_value
  );
  raise exception 'Cross-company backup restore unexpectedly succeeded';
 exception when raise_exception then
  if sqlerrm like 'Cross-company backup restore unexpectedly succeeded' then raise; end if;
 end;

 -- An invalid FK late in the import must roll back earlier inserts and the ledger.
 invalid_backup:=jsonb_build_object(
  'format','edertec-os-pro-company-backup','version',1,
  'company',jsonb_build_object('id','a4000000-0000-4000-8000-000000000002'),
  'tables',jsonb_build_object(
   'branches',jsonb_build_array(jsonb_build_object(
    'id','a6000000-0000-4000-8000-000000000002',
    'company_id','a4000000-0000-4000-8000-000000000002','name','Matriz B'
   )),
   'customers',jsonb_build_array(jsonb_build_object(
    'id','ac000000-0000-4000-8000-000000000001',
    'company_id','a4000000-0000-4000-8000-000000000002','name','Cliente temporário','address','{}'::jsonb
   )),
   'employees','[]'::jsonb,'service_catalog','[]'::jsonb,'products','[]'::jsonb,
   'service_orders',jsonb_build_array(jsonb_build_object(
    'id','ad000000-0000-4000-8000-000000000001',
    'company_id','a4000000-0000-4000-8000-000000000002',
    'customer_id','ae000000-0000-4000-8000-000000000099',
    'reported_issue','FK inválida'
   )),
   'service_order_items','[]'::jsonb,'stock_movements','[]'::jsonb,
   'payments','[]'::jsonb,'suppliers','[]'::jsonb,'purchases','[]'::jsonb,
   'purchase_items','[]'::jsonb,'cash_sessions','[]'::jsonb,
   'cash_transactions','[]'::jsonb,'company_financial_entries','[]'::jsonb,'audit_logs','[]'::jsonb
  )
 );
 begin
  perform public.restore_company_backup(
   'a4000000-0000-4000-8000-000000000002',
   'a2000000-0000-4000-8000-000000000002',
   'a7000000-0000-4000-8000-000000000003',invalid_backup
  );
  raise exception 'Invalid FK restore unexpectedly succeeded';
 exception when foreign_key_violation then
  null;
 end;
 if exists(select 1 from public.customers where company_id='a4000000-0000-4000-8000-000000000002')
  or exists(select 1 from public.company_backup_restore_runs where company_id='a4000000-0000-4000-8000-000000000002'
   and idempotency_key='a7000000-0000-4000-8000-000000000003') then
  raise exception 'Failed restore left partial data or an idempotency record';
 end if;
end;
$$;

select 'Company backup restore tests passed: import, generated fields, isolation, idempotency and rollback.' as result;
