-- Company-scoped operational backup export.
-- Authentication, membership and subscription records are intentionally excluded.
create or replace function public.export_company_backup(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'company_financial_entries','audit_logs'
  ];
  result_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner','admin')
  ) then
    raise exception 'Only a company owner or admin can export a backup';
  end if;

  perform 1 from public.companies where id = p_company_id for share;
  if not found then raise exception 'Company not found'; end if;

  foreach table_name in array allowed_tables loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.id), ''[]''::jsonb)
       from public.%I t where t.company_id = $1',
      table_name
    ) into rows_value using p_company_id;

    row_count := jsonb_array_length(rows_value);
    if row_count > 10000 then
      raise exception 'Backup table % exceeds the 10,000 row limit', table_name;
    end if;
    total_rows := total_rows + row_count;
    if total_rows > 150000 then
      raise exception 'Backup exceeds the 150,000 row limit';
    end if;
    tables_value := tables_value || jsonb_build_object(table_name, rows_value);
  end loop;

  result_value := jsonb_build_object(
    'format','edertec-os-pro-company-backup',
    'version',1,
    'exported_at',now(),
    'company',(
      select jsonb_build_object('id',c.id,'name',c.name,'legal_name',c.legal_name)
      from public.companies c where c.id=p_company_id
    ),
    'tables',tables_value,
    'record_count',total_rows
  );

  if octet_length(result_value::text) > 10485760 then
    raise exception 'Backup exceeds the 10 MB limit';
  end if;
  return result_value;
end;
$$;

revoke all on function public.export_company_backup(uuid) from public, anon;
grant execute on function public.export_company_backup(uuid) to authenticated;
