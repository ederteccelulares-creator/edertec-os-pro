-- Read-only schema contract for a future safe backup restore.
-- Run only in a disposable Supabase test project after migrations 0001-0016.
-- This script does not import, update, or delete application data.

do $$
declare
  expected record;
  identity_ok boolean;
begin
  -- Every exported operational table must carry the tenant key.
  for expected in
    select unnest(array[
      'branches','customers','devices','service_orders','service_order_events',
      'inventory_items','branch_inventory','stock_movements','financial_categories',
      'financial_entries','sales','sale_items','service_catalog','service_order_lines',
      'audit_logs'
    ]) as table_name
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema='public'
        and c.table_name=expected.table_name
        and c.column_name='organization_id'
    ) then
      raise exception 'Backup schema contract failed: %.organization_id is missing', expected.table_name;
    end if;
  end loop;

  -- Verify the foreign-key edges used by the restore dependency plan.
  for expected in
    select * from (values
      ('devices','customer_id','customers','id'),
      ('service_orders','branch_id','branches','id'),
      ('service_orders','customer_id','customers','id'),
      ('service_orders','device_id','devices','id'),
      ('service_order_events','service_order_id','service_orders','id'),
      ('branch_inventory','branch_id','branches','id'),
      ('branch_inventory','item_id','inventory_items','id'),
      ('stock_movements','branch_id','branches','id'),
      ('stock_movements','item_id','inventory_items','id'),
      ('financial_entries','branch_id','branches','id'),
      ('financial_entries','category_id','financial_categories','id'),
      ('sales','branch_id','branches','id'),
      ('sales','customer_id','customers','id'),
      ('sale_items','sale_id','sales','id'),
      ('sale_items','item_id','inventory_items','id'),
      ('service_order_lines','service_order_id','service_orders','id'),
      ('service_order_lines','branch_id','branches','id'),
      ('service_order_lines','service_id','service_catalog','id')
    ) as edges(source_table,source_column,target_table,target_column)
  loop
    if not exists (
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_catalog=tc.constraint_catalog
       and kcu.constraint_schema=tc.constraint_schema
       and kcu.constraint_name=tc.constraint_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_catalog=tc.constraint_catalog
       and ccu.constraint_schema=tc.constraint_schema
       and ccu.constraint_name=tc.constraint_name
      where tc.constraint_type='FOREIGN KEY'
        and tc.table_schema='public'
        and tc.table_name=expected.source_table
        and kcu.column_name=expected.source_column
        and ccu.table_schema='public'
        and ccu.table_name=expected.target_table
        and ccu.column_name=expected.target_column
    ) then
      raise exception 'Backup schema contract failed: missing FK %.% -> %.%',
        expected.source_table, expected.source_column, expected.target_table, expected.target_column;
    end if;
  end loop;

  -- Identity columns must be imported with explicit identity handling and
  -- their sequences reconciled after a successful transaction.
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='service_orders'
      and column_name='order_number' and is_identity='YES'
      and identity_generation='ALWAYS'
  ) into identity_ok;
  if not identity_ok then
    raise exception 'Backup schema contract failed: service_orders.order_number must be GENERATED ALWAYS AS IDENTITY';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='sales'
      and column_name='sale_number' and is_identity='YES'
      and identity_generation='ALWAYS'
  ) into identity_ok;
  if not identity_ok then
    raise exception 'Backup schema contract failed: sales.sale_number must be GENERATED ALWAYS AS IDENTITY';
  end if;
end;
$$;

select 'Backup restore schema contract: OK (read-only)' as result;
