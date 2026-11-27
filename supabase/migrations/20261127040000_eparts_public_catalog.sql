-- Public Eparts catalog: exposes only customer-safe product fields.
create or replace function public.eparts_public_catalog(p_company_id uuid)
returns table(product_id uuid,name text,description text,sku text,image_url text,sale_price numeric,brand_name text,in_stock boolean)
language sql
stable
security definer
set search_path=public
as $$
 select p.id,p.name,p.description,p.sku,p.image_url,p.sale_price,b.name,(p.stock_quantity>0)
 from public.eparts_products p
 join public.companies c on c.id=p.company_id
 left join public.eparts_brands b on b.id=p.brand_id and b.company_id=p.company_id
 where p.company_id=p_company_id
   and lower(trim(c.name))='eparts'
   and c.status='active'
   and p.is_active=true
   and p.show_in_catalog=true
 order by p.name;
$$;
revoke all on function public.eparts_public_catalog(uuid) from public;
grant execute on function public.eparts_public_catalog(uuid) to anon,authenticated;
