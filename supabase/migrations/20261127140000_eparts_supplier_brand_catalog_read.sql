-- Permite ao fornecedor consultar apenas os nomes das marcas vinculadas ao seu próprio cadastro.
drop policy if exists eparts_supplier_brands_catalog_read on public.eparts_brands;
create policy eparts_supplier_brands_catalog_read
on public.eparts_brands
for select
to authenticated
using (
  exists (
    select 1
    from public.eparts_supplier_brands sb
    join public.eparts_suppliers s
      on s.id=sb.supplier_id and s.company_id=sb.company_id
    where sb.company_id=eparts_brands.company_id
      and sb.brand_id=eparts_brands.id
      and s.user_id=auth.uid()
      and s.is_active=true
  )
);
grant select on public.eparts_brands to authenticated;
