-- Read access for active members; writes are restricted by operational role.
drop policy if exists "members can manage branches" on public.branches;
create policy "active members read branches" on public.branches
for select to authenticated using (public.is_company_member(company_id));
create policy "management roles manage branches" on public.branches
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage customers" on public.customers;
create policy "active members read customers" on public.customers
for select to authenticated using (public.is_company_member(company_id));
create policy "customer desk roles insert customers" on public.customers
for insert to authenticated
with check (public.has_company_role(company_id,array['owner','admin','manager','attendant']));
create policy "customer desk roles update customers" on public.customers
for update to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager','attendant']))
with check (public.has_company_role(company_id,array['owner','admin','manager','attendant']));
create policy "management roles delete customers" on public.customers
for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage service catalog" on public.service_catalog;
create policy "active members read service catalog" on public.service_catalog
for select to authenticated using (public.is_company_member(company_id));
create policy "management roles manage service catalog" on public.service_catalog
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage order items" on public.service_order_items;
create policy "active members read order items" on public.service_order_items
for select to authenticated using (public.is_company_member(company_id));
create policy "technical roles insert order items" on public.service_order_items
for insert to authenticated
with check (
  public.has_company_role(company_id,array['owner','admin','manager','technician'])
  and exists (select 1 from public.service_orders so
    where so.id=service_order_items.service_order_id and so.company_id=service_order_items.company_id)
);
create policy "technical roles update order items" on public.service_order_items
for update to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager','technician']))
with check (
  public.has_company_role(company_id,array['owner','admin','manager','technician'])
  and exists (select 1 from public.service_orders so
    where so.id=service_order_items.service_order_id and so.company_id=service_order_items.company_id)
);
create policy "management roles delete order items" on public.service_order_items
for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage service orders" on public.service_orders;
create policy "active members read service orders" on public.service_orders
for select to authenticated using (public.is_company_member(company_id));
create policy "active operational roles create service orders" on public.service_orders
for insert to authenticated
with check (public.has_company_role(company_id,array['owner','admin','manager','attendant','technician']));
create policy "active operational roles update service orders" on public.service_orders
for update to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));
create policy "management roles delete service orders" on public.service_orders
for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));
