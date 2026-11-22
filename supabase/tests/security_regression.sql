-- Edertec OS Pro - database security regression checks
-- Run in Supabase SQL Editor only after applying migrations 0001 through 0015.
-- These checks validate critical policies and triggers; they do not replace
-- end-to-end tests with separate authenticated users and organizations.

do $$
declare
  required_table text;
  required_trigger text;
  missing text[] := array[]::text[];
begin
  foreach required_table in array array[
    'customers','devices','service_orders','branches','inventory_items',
    'branch_inventory','stock_movements','financial_categories',
    'financial_entries','sales','sale_items'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=required_table
        and c.relrowsecurity
    ) then
      missing := array_append(missing, 'RLS disabled: '||required_table);
    end if;
  end loop;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='service_orders'
      and cmd='UPDATE' and roles @> array['authenticated']::name[]
  ) then
    missing := array_append(missing, 'Direct authenticated UPDATE policy remains on service_orders');
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='service_orders'
      and cmd='INSERT' and roles @> array['authenticated']::name[]
  ) then
    missing := array_append(missing, 'Direct authenticated INSERT policy remains on service_orders');
  end if;

  foreach required_trigger in array array[
    'customers_prevent_tenant_reassignment',
    'devices_prevent_tenant_reassignment',
    'branches_prevent_tenant_key_changes',
    'inventory_items_prevent_tenant_key_changes',
    'financial_categories_prevent_tenant_key_changes',
    'financial_entries_prevent_tenant_key_changes',
    'branch_inventory_prevent_tenant_key_changes',
    'sales_prevent_tenant_key_changes',
    'sale_items_prevent_tenant_key_changes',
    'stock_movements_prevent_tenant_key_changes'
  ] loop
    if not exists (
      select 1 from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and t.tgname=required_trigger
        and not t.tgisinternal
    ) then
      missing := array_append(missing, 'Missing trigger: '||required_trigger);
    end if;
  end loop;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sales'
      and policyname='Managers or seller read sales'
  ) then
    missing := array_append(missing, 'Sales privacy policy missing');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='sale_items'
      and policyname='Managers or seller read sale items'
  ) then
    missing := array_append(missing, 'Sale item privacy policy missing');
  end if;

  if cardinality(missing)>0 then
    raise exception 'Security regression checks failed: %', array_to_string(missing, '; ');
  end if;

  raise notice 'Security regression checks passed for migrations 0001-0015.';
end;
$$;
