-- Read-only schema contract for a future safe backup restore.
-- Run only in a disposable Supabase test project after migrations 0001-0017.
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

  -- Verify every cross-table relationship and ensure the tenant key is
  -- part of the SAME composite FK (not merely present on both tables).
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
      from pg_constraint fk
      join pg_class source_rel on source_rel.oid=fk.conrelid
      join pg_namespace source_ns on source_ns.oid=source_rel.relnamespace
      join pg_class target_rel on target_rel.oid=fk.confrelid
      join pg_namespace target_ns on target_ns.oid=target_rel.relnamespace
      where fk.contype='f'
        and source_ns.nspname='public'
        and source_rel.relname=expected.source_table
        and target_ns.nspname='public'
        and target_rel.relname=expected.target_table
        and exists (
          select 1
          from unnest(fk.conkey) with ordinality source_key(attnum, position)
          join unnest(fk.confkey) with ordinality target_key(attnum, position)
            using (position)
          join pg_attribute source_att
            on source_att.attrelid=fk.conrelid and source_att.attnum=source_key.attnum
          join pg_attribute target_att
            on target_att.attrelid=fk.confrelid and target_att.attnum=target_key.attnum
          where source_att.attname=expected.source_column
            and target_att.attname=expected.target_column
        )
        and exists (
          select 1
          from unnest(fk.conkey) with ordinality source_key(attnum, position)
          join unnest(fk.confkey) with ordinality target_key(attnum, position)
            using (position)
          join pg_attribute source_att
            on source_att.attrelid=fk.conrelid and source_att.attnum=source_key.attnum
          join pg_attribute target_att
            on target_att.attrelid=fk.confrelid and target_att.attnum=target_key.attnum
          where source_att.attname='organization_id'
            and target_att.attname='organization_id'
        )
    ) then
      raise exception 'Backup schema contract failed: missing tenant-scoped FK %.% -> %.% including organization_id',
        expected.source_table, expected.source_column, expected.target_table, expected.target_column;
    end if;
  end loop;

  -- Service line totals must remain generated, rather than trusting imported totals.
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='service_order_lines'
      and column_name='line_total' and is_generated='ALWAYS'
  ) into identity_ok;
  if not identity_ok then
    raise exception 'Backup schema contract failed: service_order_lines.line_total must remain generated';
  end if;

  -- Unique keys used to detect collisions during a future restore.
  if not exists (
    select 1
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, position)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='u' and c.conrelid='public.branches'::regclass
    group by c.oid
    having array_agg(a.attname order by k.position)=array['organization_id','code']::name[]
  ) then
    raise exception 'Backup schema contract failed: branches must be unique by organization_id and code';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, position)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='u' and c.conrelid='public.financial_categories'::regclass
    group by c.oid
    having array_agg(a.attname order by k.position)=array['organization_id','name','entry_type']::name[]
  ) then
    raise exception 'Backup schema contract failed: financial category uniqueness is missing';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality k(attnum, position)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
    where c.contype='u' and c.conrelid='public.branch_inventory'::regclass
    group by c.oid
    having array_agg(a.attname order by k.position)=array['branch_id','item_id']::name[]
  ) then
    raise exception 'Backup schema contract failed: branch inventory uniqueness is missing';
  end if;

  if to_regclass('public.inventory_items_org_sku_unique') is null
     or not exists (
       select 1 from pg_index i
       where i.indexrelid=to_regclass('public.inventory_items_org_sku_unique')
         and i.indisunique and i.indpred is not null
     ) then
    raise exception 'Backup schema contract failed: partial unique SKU index is missing';
  end if;

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
