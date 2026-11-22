-- Edertec OS Pro - restrict service-order writes to audited status RPC
-- Apply after 0012_sales_pricing_and_privacy.sql.

-- The frontend only changes OS status through update_service_order_status.
-- Removing direct UPDATE prevents clients from changing tenant, branch,
-- customer, device, opener, technician assignment, prices or timestamps.
drop policy if exists "Managers and technicians update orders" on public.service_orders;

create or replace function public.update_service_order_status(
  p_organization_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_status public.service_order_status,
  p_description text default null
)
returns public.service_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_status public.service_order_status;
  updated_order public.service_orders;
  actor_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','technician']::public.member_role[]
  ) then
    raise exception 'You do not have permission to update service orders';
  end if;

  select om.role into actor_role
  from public.organization_members om
  where om.organization_id = p_organization_id
    and om.user_id = auth.uid()
    and om.active = true;

  select * into updated_order
  from public.service_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id
  for update;

  if not found then
    raise exception 'Service order not found in this branch';
  end if;

  if actor_role = 'technician' and updated_order.technician_id is distinct from auth.uid() then
    raise exception 'Technicians can only update orders assigned to them';
  end if;

  previous_status := updated_order.status;

  update public.service_orders
  set status = p_status,
      delivered_at = case when p_status = 'delivered' then now()
                          when status = 'delivered' then null
                          else delivered_at end
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id
  returning * into updated_order;

  insert into public.service_order_events(
    organization_id, service_order_id, from_status, to_status, description, changed_by
  ) values (
    p_organization_id, p_order_id, previous_status, p_status,
    nullif(trim(coalesce(p_description, '')), ''), auth.uid()
  );

  insert into public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  values (
    p_organization_id, auth.uid(), 'service_order.status_changed',
    'service_order', p_order_id::text,
    jsonb_build_object('from', previous_status, 'to', p_status, 'branch_id', p_branch_id)
  );

  return updated_order;
end;
$$;

revoke all on function public.update_service_order_status(uuid,uuid,uuid,public.service_order_status,text) from public, anon;
grant execute on function public.update_service_order_status(uuid,uuid,uuid,public.service_order_status,text) to authenticated;
