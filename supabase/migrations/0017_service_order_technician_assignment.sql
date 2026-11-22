-- Edertec OS Pro - audited technician assignment for service orders
-- Apply after migrations 0001 through 0016.
-- Direct service_orders UPDATE remains revoked; assignment is performed only
-- through this tenant- and role-checked SECURITY DEFINER function.

create or replace function public.assign_service_order_technician(
  p_organization_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_technician_id uuid default null
)
returns public.service_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.service_orders;
  previous_technician uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager']::public.member_role[]
  ) then
    raise exception 'Only owners, admins or managers can assign technicians';
  end if;

  if p_technician_id is not null and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_technician_id
      and m.role = 'technician'
      and m.active = true
  ) then
    raise exception 'The selected user is not an active technician in this organization';
  end if;

  select *
    into order_row
  from public.service_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id
  for update;

  if not found then
    raise exception 'Service order not found in this branch';
  end if;

  if order_row.status in ('delivered','cancelled') then
    raise exception 'Closed service orders cannot be reassigned';
  end if;

  previous_technician := order_row.technician_id;

  update public.service_orders
  set technician_id = p_technician_id
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id
  returning * into order_row;

  insert into public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, metadata
  ) values (
    p_organization_id,
    auth.uid(),
    'service_order.technician_assigned',
    'service_order',
    p_order_id::text,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'previous_technician_id', previous_technician,
      'technician_id', p_technician_id
    )
  );

  return order_row;
end;
$$;

revoke all on function public.assign_service_order_technician(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.assign_service_order_technician(uuid,uuid,uuid,uuid) to authenticated;
