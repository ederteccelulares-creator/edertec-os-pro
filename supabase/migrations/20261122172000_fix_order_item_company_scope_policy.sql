drop policy if exists "Management manages order items" on public.service_order_items;
create policy "Management manages order items" on public.service_order_items
for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (
  public.has_company_role(company_id,array['owner','admin','manager'])
  and exists(
    select 1 from public.service_orders so
    where so.id = service_order_items.service_order_id
      and so.company_id = service_order_items.company_id
  )
);
