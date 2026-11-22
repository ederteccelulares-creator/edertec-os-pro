-- Edertec OS Pro - database security regression checks
-- Run in Supabase SQL Editor only after applying migrations 0001 through 0017.
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
    'financial_entries','sales','sale_items','service_order_events',
    'service_catalog','service_order_lines'
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
    'stock_movements_prevent_tenant_key_changes',
    'service_order_events_prevent_reassignment',
    'service_order_lines_prevent_reassignment',
    'service_catalog_prevent_tenant_key_changes'
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

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='assign_service_order_technician'
      and pg_get_function_identity_arguments(p.oid)='p_organization_id uuid, p_branch_id uuid, p_order_id uuid, p_technician_id uuid'
  ) then
    missing := array_append(missing, 'Technician assignment RPC missing');
  else
    if not has_function_privilege('authenticated',
      'public.assign_service_order_technician(uuid,uuid,uuid,uuid)', 'EXECUTE') then
      missing := array_append(missing, 'Authenticated role cannot execute technician assignment RPC');
    end if;
    if has_function_privilege('anon',
      'public.assign_service_order_technician(uuid,uuid,uuid,uuid)', 'EXECUTE') then
      missing := array_append(missing, 'Anonymous role can execute technician assignment RPC');
    end if;
  end if;

  if cardinality(missing)>0 then
    raise exception 'Security regression checks failed: %', array_to_string(missing, '; ');
  end if;

  raise notice 'Security regression checks passed for migrations 0001-0018.';
end;
$$;


-- Backup restore is callable only by the trusted service role, never by
-- browser sessions or anonymous clients.
do $$
begin
  if not has_function_privilege('service_role',
    'public.restore_organization_backup(uuid,uuid,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Restore RPC must be executable by service_role';
  end if;
  if has_function_privilege('authenticated',
    'public.restore_organization_backup(uuid,uuid,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Authenticated users must not execute restore RPC directly';
  end if;
  if has_function_privilege('anon',
    'public.restore_organization_backup(uuid,uuid,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'Anonymous users must not execute restore RPC';
  end if;
end;
$$;


-- Customer portal bearer links: anonymous users may read only via the
-- narrowly scoped token RPC; only authenticated staff may mint links.
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='service_order_portal_tokens'
      and c.relrowsecurity
  ) then
    raise exception 'Customer portal token table must have RLS enabled';
  end if;

  if not has_function_privilege('anon',
    'public.get_service_order_portal(text)', 'EXECUTE') then
    raise exception 'Anonymous role must be able to use the token-gated customer portal';
  end if;

  if not has_function_privilege('authenticated',
    'public.create_service_order_portal_link(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'Authenticated staff must be able to mint customer portal links';
  end if;

  if has_function_privilege('anon',
    'public.create_service_order_portal_link(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'Anonymous users must not mint customer portal links';
  end if;

  if has_table_privilege('anon',
    'public.service_order_portal_tokens', 'SELECT') then
    raise exception 'Anonymous users must not read portal token records directly';
  end if;
end;
$$;


-- Quote decisions are token-gated and cannot be submitted twice.
do $$
begin
  if not has_function_privilege('anon',
    'public.respond_service_order_quote(text,text)', 'EXECUTE') then
    raise exception 'Anonymous customers must be able to submit a decision using a valid portal token';
  end if;

  if not has_function_privilege('authenticated',
    'public.respond_service_order_quote(text,text)', 'EXECUTE') then
    raise exception 'Authenticated portal clients must be able to submit a decision';
  end if;

  if not has_column_privilege('anon',
    'public.service_orders', 'customer_quote_decision', 'UPDATE') then
    -- The public role must not directly modify order decisions.
    null;
  else
    raise exception 'Anonymous users must not directly update customer quote decisions';
  end if;

  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='respond_service_order_quote'
      and p.prosecdef
  ) then
    raise exception 'Customer quote decision RPC must be security definer';
  end if;
end;
$$;


do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.service_orders'::regclass
      and tgname='service_orders_quote_decision_default'
      and not tgisinternal
  ) then
    raise exception 'Legacy backup compatibility trigger for quote decisions is missing';
  end if;
end;
$$;
