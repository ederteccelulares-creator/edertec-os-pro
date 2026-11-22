-- Remove broad member-wide CRUD policies and replace them with role-aware policies.
drop policy if exists "members can manage branches" on public.branches;
create policy "Active members read branches" on public.branches
for select to authenticated using (public.is_company_member(company_id));
create policy "Management manages branches" on public.branches
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage customers" on public.customers;
create policy "Active members read customers" on public.customers
for select to authenticated using (public.is_company_member(company_id));
create policy "Attendants and management create customers" on public.customers
for insert to authenticated
with check (public.has_company_role(company_id,array['owner','admin','manager','attendant']));
create policy "Attendants and management update customers" on public.customers
for update to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager','attendant']))
with check (public.has_company_role(company_id,array['owner','admin','manager','attendant']));
create policy "Management deletes customers" on public.customers
for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage service catalog" on public.service_catalog;
create policy "Active members read service catalog" on public.service_catalog
for select to authenticated using (public.is_company_member(company_id));
create policy "Management manages service catalog" on public.service_catalog
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage order items" on public.service_order_items;
create policy "Active members read order items" on public.service_order_items
for select to authenticated using (public.is_company_member(company_id));
create policy "Management manages order items" on public.service_order_items
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (
  public.has_company_role(company_id,array['owner','admin','manager'])
  and exists(select 1 from public.service_orders so where so.id=service_order_id and so.company_id=company_id)
);

drop policy if exists "members can manage service orders" on public.service_orders;
create policy "Active members read service orders" on public.service_orders
for select to authenticated using (public.is_company_member(company_id));
create policy "Active members create service orders" on public.service_orders
for insert to authenticated with check (public.is_company_member(company_id));
create policy "Active members update service orders" on public.service_orders
for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
create policy "Management deletes service orders" on public.service_orders
for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "company members can read audit logs" on public.audit_logs;
create policy "Company management reads audit logs" on public.audit_logs
for select to authenticated
using (company_id is not null and public.has_company_role(company_id,array['owner','admin']));

create or replace function public.guard_service_order_financial_fields()
returns trigger language plpgsql set search_path to ''
as $$
declare v_role text;
begin
  if auth.uid() is null then
    if current_user in ('postgres','service_role') then return new; end if;
    raise exception 'Authentication required';
  end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=new.company_id and cm.user_id=auth.uid() and cm.is_active=true;
  if v_role is null then raise exception 'Active company membership required'; end if;
  if tg_op='UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'A service order cannot be moved to another company';
  end if;
  if v_role in ('owner','admin','manager') then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.estimated_price,0)<>0 or coalesce(new.final_price,0)<>0 then
      raise exception 'Only company management can set service order prices';
    end if;
    return new;
  end if;
  if new.estimated_price is distinct from old.estimated_price
    or new.final_price is distinct from old.final_price
    or new.warranty_started_at is distinct from old.warranty_started_at
    or new.warranty_expires_at is distinct from old.warranty_expires_at
    or new.warranty_days is distinct from old.warranty_days
    or new.customer_approval_decision is distinct from old.customer_approval_decision
    or new.customer_approval_at is distinct from old.customer_approval_at
    or new.customer_approval_note is distinct from old.customer_approval_note then
    raise exception 'Only company management or the customer approval portal can change financial and warranty fields';
  end if;
  if v_role='attendant' and (
    new.diagnosis is distinct from old.diagnosis or new.status is distinct from old.status
    or new.assigned_employee_id is distinct from old.assigned_employee_id
  ) then raise exception 'Attendants cannot change diagnosis, technical status or technician assignment'; end if;
  return new;
end;
$$;

