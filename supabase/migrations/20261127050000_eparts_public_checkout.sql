-- Public checkout creates pending orders atomically and reserves stock.
create or replace function public.eparts_public_checkout(
 p_company_id uuid,p_items jsonb,p_customer_name text,p_customer_phone text,
 p_customer_email text default null,p_customer_address jsonb default '{}'::jsonb,
 p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_sale_id uuid; v_customer_id uuid; v_item jsonb; v_product public.eparts_products%rowtype;
 v_group record; v_qty numeric(12,3); v_line numeric(12,2);
 v_subtotal numeric(12,2):=0; v_commission_total numeric(12,2):=0;
 v_supplier_total numeric(12,2):=0; v_phone text;
begin
 if length(trim(coalesce(p_customer_name,'')))<2 then raise exception 'Informe seu nome completo.'; end if;
 v_phone:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
 if length(v_phone)<10 or length(v_phone)>15 then raise exception 'Informe um telefone válido com DDD.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>30 then
  raise exception 'O carrinho deve conter de 1 a 30 itens.';
 end if;
 if not exists(select 1 from public.companies c where c.id=p_company_id and c.status='active' and c.id='336c5941-6f23-418e-968e-730442650d98'::uuid) then
  raise exception 'Catálogo não encontrado ou indisponível.';
 end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item)<>'object'
   or coalesce(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or coalesce(v_item->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$'
   or (v_item->>'quantity')::numeric<=0 then raise exception 'Produto ou quantidade inválida.'; end if;
 end loop;
 for v_group in
  select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::numeric) total_quantity
  from jsonb_array_elements(p_items) group by (value->>'product_id')::uuid order by (value->>'product_id')::uuid
 loop
  select * into v_product from public.eparts_products
   where id=v_group.product_id and company_id=p_company_id and is_active and show_in_catalog for update;
  if not found then raise exception 'Um produto não está mais disponível.'; end if;
  if v_product.stock_quantity<v_group.total_quantity then raise exception 'Estoque insuficiente para: %.',v_product.name; end if;
 end loop;
 insert into public.eparts_customers(company_id,name,email,phone,address)
 values(p_company_id,trim(p_customer_name),nullif(trim(coalesce(p_customer_email,'')),''),v_phone,coalesce(p_customer_address,'{}'::jsonb))
 returning id into v_customer_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::numeric;
  select * into v_product from public.eparts_products where id=(v_item->>'product_id')::uuid and company_id=p_company_id;
  v_line:=round(v_product.sale_price*v_qty,2);
  v_subtotal:=v_subtotal+v_line;
  v_commission_total:=v_commission_total+round(v_line*0.12,2);
  v_supplier_total:=v_supplier_total+(v_line-round(v_line*0.12,2));
 end loop;
 insert into public.eparts_sales(company_id,customer_id,source,status,payment_status,subtotal,total_amount,
  eparts_commission_rate,eparts_commission_amount,supplier_amount,customer_name,customer_email,customer_phone,customer_address,notes)
 values(p_company_id,v_customer_id,'catalog','pending','pending',v_subtotal,v_subtotal,12.00,
  v_commission_total,v_supplier_total,trim(p_customer_name),nullif(trim(coalesce(p_customer_email,'')),''),v_phone,
  coalesce(p_customer_address,'{}'::jsonb),p_notes)
 returning id into v_sale_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::numeric;
  select * into v_product from public.eparts_products where id=(v_item->>'product_id')::uuid and company_id=p_company_id;
  v_line:=round(v_product.sale_price*v_qty,2);
  insert into public.eparts_sale_items(company_id,sale_id,product_id,supplier_id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount)
  values(p_company_id,v_sale_id,v_product.id,v_product.supplier_id,v_product.name,v_product.sku,v_qty,v_product.sale_price,
   v_line,round(v_line*0.12,2),v_line-round(v_line*0.12,2));
 end loop;
 for v_group in
  select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::numeric) total_quantity
  from jsonb_array_elements(p_items) group by (value->>'product_id')::uuid
 loop
  update public.eparts_products set stock_quantity=stock_quantity-v_group.total_quantity,updated_at=now()
  where id=v_group.product_id and company_id=p_company_id;
 end loop;
 return v_sale_id;
end;
$$;
revoke all on function public.eparts_public_checkout(uuid,jsonb,text,text,text,jsonb,text) from public,authenticated;
grant execute on function public.eparts_public_checkout(uuid,jsonb,text,text,text,jsonb,text) to anon;
