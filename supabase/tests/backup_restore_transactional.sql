-- Transactional backup restore tests.
-- Runs only in the disposable PostgreSQL CI database after migrations 0001-0018.
-- Creates two isolated synthetic organizations; no production data is touched.

do $$
declare
  owner_a uuid := '40000000-0000-4000-8000-000000000001';
  owner_b uuid := '40000000-0000-4000-8000-000000000002';
  source_user_a uuid := '50000000-0000-4000-8000-000000000001';
  source_user_b uuid := '50000000-0000-4000-8000-000000000002';
  org_a uuid := '41000000-0000-4000-8000-000000000001';
  org_b uuid := '41000000-0000-4000-8000-000000000002';
  branch_a uuid := '42000000-0000-4000-8000-000000000001';
  branch_b uuid := '42000000-0000-4000-8000-000000000002';
  source_branch_a uuid := '43000000-0000-4000-8000-000000000001';
  source_branch_b uuid := '43000000-0000-4000-8000-000000000002';
  customer_a uuid := '44000000-0000-4000-8000-000000000001';
  device_a uuid := '45000000-0000-4000-8000-000000000001';
  order_a uuid := '46000000-0000-4000-8000-000000000001';
  event_a uuid := '47000000-0000-4000-8000-000000000001';
  bad_customer uuid := '44000000-0000-4000-8000-000000000002';
  bad_device uuid := '45000000-0000-4000-8000-000000000002';
  missing_customer uuid := '44000000-0000-4000-8000-000000000099';
  payload jsonb;
  bad_payload jsonb;
  result_value jsonb;
  replay_value jsonb;
  idempotency uuid := '48000000-0000-4000-8000-000000000001';
  bad_idempotency uuid := '48000000-0000-4000-8000-000000000002';
begin
  insert into auth.users(id,email,email_confirmed_at)
  values
    (owner_a,'restore-owner-a@example.invalid',now()),
    (owner_b,'restore-owner-b@example.invalid',now())
  on conflict (id) do nothing;

  insert into public.organizations(id,name,slug,created_by)
  values
    (org_a,'Restore Tenant A','restore-tenant-a',owner_a),
    (org_b,'Restore Tenant B','restore-tenant-b',owner_b);

  insert into public.subscriptions(organization_id,status,trial_ends_at)
  values
    (org_a,'trialing',now()+interval '14 days'),
    (org_b,'trialing',now()+interval '14 days');

  insert into public.organization_members(organization_id,user_id,role,active)
  values
    (org_a,owner_a,'owner',true),
    (org_b,owner_b,'owner',true);

  insert into public.branches(id,organization_id,name,code,active)
  values
    (branch_a,org_a,'Matriz A','MATRIZ',true),
    (branch_b,org_b,'Matriz B','MATRIZ',true);

  perform set_config('request.jwt.claim.role','service_role',false);

  payload := jsonb_build_object(
    'format','edertec-os-pro-backup',
    'version',1,
    'exported_at',now(),
    'organization',jsonb_build_object('id',org_a,'name','Restore Tenant A'),
    'tables',jsonb_build_object(
      'branches',jsonb_build_array(jsonb_build_object(
        'id',source_branch_a,'organization_id',org_a,'name','Filial origem','code','ORIGEM',
        'phone',null,'address','{}'::jsonb,'active',true,'created_at',now()
      )),
      'customers',jsonb_build_array(jsonb_build_object(
        'id',customer_a,'organization_id',org_a,'name','Cliente restaurado','phone','47999990000',
        'email',null,'document',null,'address','{}'::jsonb,'notes',null,
        'created_at',now(),'updated_at',now()
      )),
      'devices',jsonb_build_array(jsonb_build_object(
        'id',device_a,'organization_id',org_a,'customer_id',customer_a,'brand','Apple',
        'model','iPhone de teste','color',null,'storage',null,'imei',null,'serial_number',null,
        'notes',null,'created_at',now()
      )),
      'service_orders',jsonb_build_array(jsonb_build_object(
        'id',order_a,'organization_id',org_a,'branch_id',source_branch_a,'customer_id',customer_a,
        'device_id',device_a,'order_number',777,'status','received','reported_issue','Teste de restauração',
        'diagnosis',null,'accessories',null,'physical_condition',null,'estimated_amount',150,
        'approved_amount',null,'technician_id',null,'opened_by',source_user_a,'received_at',now(),
        'delivered_at',null,'warranty_days',90,'internal_notes',null,'created_at',now(),'updated_at',now()
      )),
      'service_order_events',jsonb_build_array(jsonb_build_object(
        'id',event_a,'organization_id',org_a,'service_order_id',order_a,'from_status',null,
        'to_status','received','description','OS restaurada','changed_by',source_user_a,'created_at',now()
      )),
      'inventory_items','[]'::jsonb,
      'branch_inventory','[]'::jsonb,
      'stock_movements','[]'::jsonb,
      'financial_categories','[]'::jsonb,
      'financial_entries','[]'::jsonb,
      'sales','[]'::jsonb,
      'sale_items','[]'::jsonb,
      'service_catalog','[]'::jsonb,
      'service_order_lines','[]'::jsonb,
      'audit_logs','[]'::jsonb
    )
  );

  result_value := public.restore_organization_backup(
    org_a,owner_a,idempotency,payload,
    jsonb_build_object(source_branch_a::text,branch_a),
    jsonb_build_object(source_user_a::text,owner_a)
  );
  if coalesce((result_value->>'success')::boolean,false) is not true
     or coalesce((result_value->>'applied')::boolean,false) is not true then
    raise exception 'Restore success test returned unexpected result: %', result_value;
  end if;
  if (select count(*) from public.customers where organization_id=org_a) <> 1
     or (select count(*) from public.devices where organization_id=org_a) <> 1
     or (select count(*) from public.service_orders where organization_id=org_a) <> 1
     or (select count(*) from public.service_order_events where organization_id=org_a) <> 1 then
    raise exception 'Restore success test did not import all expected records';
  end if;
  if not exists (
    select 1 from public.service_orders
    where id=order_a and organization_id=org_a and branch_id=branch_a
      and order_number=777 and opened_by=owner_a
  ) then
    raise exception 'Restore did not preserve order number or remap branch/user IDs';
  end if;
  if not exists (
    select 1 from public.service_order_events
    where id=event_a and organization_id=org_a and changed_by=owner_a
  ) then
    raise exception 'Restore did not remap historical event actor';
  end if;

  replay_value := public.restore_organization_backup(
    org_a,owner_a,idempotency,payload,
    jsonb_build_object(source_branch_a::text,branch_a),
    jsonb_build_object(source_user_a::text,owner_a)
  );
  if coalesce((replay_value->>'replayed')::boolean,false) is not true
     or (select count(*) from public.customers where organization_id=org_a) <> 1 then
    raise exception 'Idempotency replay duplicated or changed restored data';
  end if;

  -- Force an FK failure after the customer insert. The whole function call
  -- must roll back, including the early customer row and idempotency record.
  bad_payload := jsonb_build_object(
    'format','edertec-os-pro-backup',
    'version',1,
    'organization',jsonb_build_object('id',org_b,'name','Restore Tenant B'),
    'tables',jsonb_build_object(
      'branches',jsonb_build_array(jsonb_build_object(
        'id',source_branch_b,'organization_id',org_b,'name','Filial origem B','code','ORIGEM-B',
        'phone',null,'address','{}'::jsonb,'active',true,'created_at',now()
      )),
      'customers',jsonb_build_array(jsonb_build_object(
        'id',bad_customer,'organization_id',org_b,'name','Cliente que deve voltar','phone','47999990001',
        'email',null,'document',null,'address','{}'::jsonb,'notes',null,
        'created_at',now(),'updated_at',now()
      )),
      'devices',jsonb_build_array(jsonb_build_object(
        'id',bad_device,'organization_id',org_b,'customer_id',missing_customer,'brand','Teste',
        'model','FK inválida','color',null,'storage',null,'imei',null,'serial_number',null,
        'notes',null,'created_at',now()
      )),
      'service_orders','[]'::jsonb,
      'service_order_events','[]'::jsonb,
      'inventory_items','[]'::jsonb,
      'branch_inventory','[]'::jsonb,
      'stock_movements','[]'::jsonb,
      'financial_categories','[]'::jsonb,
      'financial_entries','[]'::jsonb,
      'sales','[]'::jsonb,
      'sale_items','[]'::jsonb,
      'service_catalog','[]'::jsonb,
      'service_order_lines','[]'::jsonb,
      'audit_logs',jsonb_build_array(jsonb_build_object(
        'id',999001,'organization_id',org_b,'actor_id',source_user_b,'action','restore.rollback.test',
        'entity','organization','entity_id',org_b::text,'metadata','{}'::jsonb,'created_at',now()
      ))
    )
  );

  begin
    perform public.restore_organization_backup(
      org_b,owner_b,bad_idempotency,bad_payload,
      jsonb_build_object(source_branch_b::text,branch_b),
      jsonb_build_object(source_user_b::text,owner_b)
    );
    raise exception 'Test failure: invalid foreign key unexpectedly restored';
  exception when foreign_key_violation then
    null;
  end;

  if (select count(*) from public.customers where organization_id=org_b) <> 0
     or (select count(*) from public.devices where organization_id=org_b) <> 0
     or exists (
       select 1 from public.backup_restore_runs
       where organization_id=org_b and idempotency_key=bad_idempotency
     ) then
    raise exception 'Restore rollback test left partial data or an idempotency record';
  end if;
end;
$$;

select 'Transactional backup restore tests passed: import, remapping, idempotency and rollback.' as result;
