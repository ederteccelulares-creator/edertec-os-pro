-- Edertec OS Pro current company-schema security regression checks.
-- Runs only in the disposable PostgreSQL CI database after all migrations.

\set ON_ERROR_STOP on

do $$
declare
  missing text[] := array[]::text[];
  t text;
  fn regprocedure;
begin
  foreach t in array array[
    'companies','company_members','branches','customers','employees','service_catalog',
    'products','service_orders','service_order_items','stock_movements','payments',
    'suppliers','purchases','purchase_items','cash_sessions','cash_transactions',
    'company_financial_entries','company_customer_portal_tokens',
    'company_service_order_tracking_tokens','company_backup_restore_runs'
  ] loop
    if not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity
    ) then missing:=array_append(missing,'RLS missing: public.'||t); end if;
  end loop;

  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
  ) then missing:=array_append(missing,'At least one public table has RLS disabled'); end if;

  foreach fn in array array[
    'public.get_company_customer_portal(text)'::regprocedure,
    'public.get_company_service_order_tracking(text)'::regprocedure,
    'public.respond_company_customer_portal_approval(text,uuid,text)'::regprocedure,
    'public.respond_company_service_order_approval(text,text,text)'::regprocedure
  ] loop
    if not exists(
      select 1 from pg_proc p
      where p.oid=fn and p.prosecdef
        and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=""%'
    ) then missing:=array_append(missing,'Public token RPC is not hardened: '||fn::text); end if;
  end loop;

  if has_table_privilege('anon','public.company_customer_portal_tokens','SELECT')
     or has_table_privilege('anon','public.company_service_order_tracking_tokens','SELECT') then
    missing:=array_append(missing,'Anonymous role can read bearer-token records directly');
  end if;

  if not has_function_privilege('anon','public.get_company_customer_portal(text)','EXECUTE')
     or not has_function_privilege('anon','public.get_company_service_order_tracking(text)','EXECUTE')
     or not has_function_privilege('anon','public.respond_company_customer_portal_approval(text,uuid,text)','EXECUTE')
     or not has_function_privilege('anon','public.respond_company_service_order_approval(text,text,text)','EXECUTE') then
    missing:=array_append(missing,'Anonymous token-gated portal RPC grants are incomplete');
  end if;

  if has_function_privilege('anon','public.create_company_customer_portal_link(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.create_company_service_order_tracking_link(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.export_company_backup(uuid)','EXECUTE') then
    missing:=array_append(missing,'Anonymous role can mint links or export backups');
  end if;

  if not exists(select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='Management deletes customers' and cmd='DELETE')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='branches' and policyname='Management manages branches' and cmd='ALL')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='service_orders' and policyname='Management deletes service orders' and cmd='DELETE')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='Company management reads audit logs' and cmd='SELECT') then
    missing:=array_append(missing,'Expected role-aware RLS policies are missing');
  end if;

  if not exists(select 1 from pg_constraint where conname='tracking_tokens_order_company_fkey' and contype='f') then
    missing:=array_append(missing,'Tracking token composite company/order FK is missing');
  end if;

  if not exists(select 1 from pg_constraint where conname='service_orders_customer_company_fkey' and contype='f')
     or not exists(select 1 from pg_constraint where conname='service_orders_branch_company_fkey' and contype='f')
     or not exists(select 1 from pg_constraint where conname='service_orders_employee_company_fkey' and contype='f') then
    missing:=array_append(missing,'Service order tenant-scoped relationship constraints are missing');
  end if;

  if cardinality(missing)>0 then
    raise exception 'Current-schema security regression checks failed: %',array_to_string(missing,'; ');
  end if;
  raise notice 'Current Edertec company-schema security checks passed.';
end;
$$;
