-- Edertec OS Pro - transactional service order workflow and role hardening
-- Apply after 0001_saas_core.sql in Supabase SQL Editor.

drop policy if exists "Members manage orders" on public.service_orders;
create policy "Members read orders" on public.service_orders
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Staff create orders" on public.service_orders
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['owner','admin','manager','attendant']::public.member_role[])
    and opened_by = auth.uid()
  );
create policy "Managers and technicians update orders" on public.service_orders
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager','technician']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager','technician']::public.member_role[]));
create policy "Owners delete orders" on public.service_orders
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.member_role[]));

-- A single database transaction updates the OS and writes its timeline event.
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

  select status into previous_status
  from public.service_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id
  for update;

  if not found then
    raise exception 'Service order not found in this branch';
  end if;

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

revoke all on function public.update_service_order_status(uuid,uuid,uuid,public.service_order_status,text) from public;
grant execute on function public.update_service_order_status(uuid,uuid,uuid,public.service_order_status,text) to authenticated;
