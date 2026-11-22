-- Append-only audit trail for privileged platform administration.
create or replace function public.log_platform_admin_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_entity_id text;
  v_company_id uuid;
  v_action text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_action := 'platform_admin.update';
  elsif tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_action := 'platform_admin.create';
  else
    return old;
  end if;

  v_entity_id := coalesce(v_new->>'id', v_old->>'id');
  if tg_table_name = 'companies' then
    v_company_id := nullif(v_entity_id, '')::uuid;
  elsif tg_table_name = 'company_subscriptions' then
    v_company_id := nullif(coalesce(v_new->>'company_id',v_old->>'company_id'),'')::uuid;
  else
    v_company_id := null;
  end if;

  insert into public.audit_logs(company_id,user_id,action,entity_table,entity_id,details)
  values (
    v_company_id,
    (select auth.uid()),
    v_action,
    tg_table_name,
    v_entity_id,
    jsonb_build_object(
      'changed_fields',
      case when tg_op = 'UPDATE' then
        (select coalesce(jsonb_object_agg(n.key,jsonb_build_object('old',v_old->n.key,'new',n.value)),'{}'::jsonb)
         from jsonb_each(v_new) n
         where n.key in ('status','is_active','price','billing_interval','plan_id','ends_at','max_branches','max_users')
           and v_old->n.key is distinct from n.value)
      else
        (select coalesce(jsonb_object_agg(n.key,n.value),'{}'::jsonb)
         from jsonb_each(v_new) n
         where n.key in ('status','is_active','price','billing_interval','plan_id','ends_at','max_branches','max_users'))
      end
    )
  );
  return coalesce(new,old);
end;
$$;

revoke all on function public.log_platform_admin_change() from public, anon, authenticated;

drop trigger if exists platform_admin_audit_companies on public.companies;
create trigger platform_admin_audit_companies
after update of status on public.companies
for each row execute function public.log_platform_admin_change();

drop trigger if exists platform_admin_audit_plans on public.subscription_plans;
create trigger platform_admin_audit_plans
after insert or update of is_active,price,billing_interval,max_branches,max_users on public.subscription_plans
for each row execute function public.log_platform_admin_change();

drop trigger if exists platform_admin_audit_subscriptions on public.company_subscriptions;
create trigger platform_admin_audit_subscriptions
after insert or update of status,plan_id,ends_at on public.company_subscriptions
for each row execute function public.log_platform_admin_change();

drop policy if exists "platform admins can read platform audit logs" on public.audit_logs;
create policy "platform admins can read platform audit logs"
on public.audit_logs
for select
to authenticated
using ((select public.is_platform_admin()));

grant select on public.audit_logs to authenticated;
