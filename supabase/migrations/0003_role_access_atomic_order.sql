-- Edertec OS Pro - role-based customer/device access and atomic order creation
-- Apply after 0002_order_workflow_security.sql.

-- Members can view tenant records; operational writes are limited by role.
drop policy if exists "Members manage customers" on public.customers;
create policy "Members read customers" on public.customers
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Staff create customers" on public.customers
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[])
  );
create policy "Staff update customers" on public.customers
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[]));
create policy "Managers delete customers" on public.customers
  for delete to authenticated using (
    public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[])
  );

drop policy if exists "Members manage devices" on public.devices;
create policy "Members read devices" on public.devices
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Staff create devices" on public.devices
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[])
  );
create policy "Staff update devices" on public.devices
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[]));
create policy "Managers delete devices" on public.devices
  for delete to authenticated using (
    public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[])
  );

-- Timeline and audit records must only be written by trusted database functions.
drop policy if exists "Members add order events" on public.service_order_events;
drop policy if exists "Members insert audit logs" on public.audit_logs;

create or replace function public.create_service_order_with_device(
  p_organization_id uuid,
  p_branch_id uuid,
  p_customer_id uuid,
  p_brand text,
  p_model text,
  p_imei text,
  p_reported_issue text,
  p_estimated_amount numeric default 0,
  p_accessories text default null,
  p_physical_condition text default null
)
returns public.service_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  new_device_id uuid;
  new_order public.service_orders;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','attendant']::public.member_role[]
  ) then
    raise exception 'You do not have permission to open service orders';
  end if;

  if not exists (
    select 1 from public.branches
    where id = p_branch_id and organization_id = p_organization_id and active
  ) then
    raise exception 'Branch not found or inactive';
  end if;

  if not exists (
    select 1 from public.customers
    where id = p_customer_id and organization_id = p_organization_id
  ) then
    raise exception 'Customer not found in this organization';
  end if;

  if nullif(trim(coalesce(p_brand, '')), '') is null
     or nullif(trim(coalesce(p_model, '')), '') is null
     or nullif(trim(coalesce(p_reported_issue, '')), '') is null then
    raise exception 'Brand, model and reported issue are required';
  end if;

  if coalesce(p_estimated_amount, 0) < 0 then
    raise exception 'Estimated amount cannot be negative';
  end if;

  insert into public.devices(
    organization_id, customer_id, brand, model, imei
  ) values (
    p_organization_id, p_customer_id, trim(p_brand), trim(p_model),
    nullif(trim(coalesce(p_imei, '')), '')
  ) returning id into new_device_id;

  insert into public.service_orders(
    organization_id, branch_id, customer_id, device_id, reported_issue,
    estimated_amount, accessories, physical_condition, opened_by
  ) values (
    p_organization_id, p_branch_id, p_customer_id, new_device_id,
    trim(p_reported_issue), coalesce(p_estimated_amount, 0),
    nullif(trim(coalesce(p_accessories, '')), ''),
    nullif(trim(coalesce(p_physical_condition, '')), ''),
    auth.uid()
  ) returning * into new_order;

  insert into public.service_order_events(
    organization_id, service_order_id, from_status, to_status, description, changed_by
  ) values (
    p_organization_id, new_order.id, null, new_order.status,
    'Ordem de serviço criada', auth.uid()
  );

  insert into public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) values (
    p_organization_id, auth.uid(), 'service_order.created',
    'service_order', new_order.id::text,
    jsonb_build_object('branch_id', p_branch_id, 'order_number', new_order.order_number)
  );

  return new_order;
end;
$$;

revoke all on function public.create_service_order_with_device(uuid,uuid,uuid,text,text,text,text,numeric,text,text) from public;
grant execute on function public.create_service_order_with_device(uuid,uuid,uuid,text,text,text,text,numeric,text,text) to authenticated;
