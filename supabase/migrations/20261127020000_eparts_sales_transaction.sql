-- Eparts: criação transacional de pedidos com comissão e baixa de estoque.
-- A função só pode ser executada por membro ativo com perfil de gestão da empresa.
create or replace function public.eparts_create_sale(
  p_company_id uuid,
  p_items jsonb,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_address jsonb default '{}'::jsonb,
  p_payment_method text default null,
  p_shipping_amount numeric default 0,
  p_discount numeric default 0,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_product public.eparts_products%rowtype;
  v_qty numeric(12,3);
  v_line_total numeric(12,2);
  v_commission numeric(12,2);
  v_subtotal numeric(12,2) := 0;
  v_commission_total numeric(12,2) := 0;
  v_supplier_total numeric(12,2) := 0;
  v_shipping numeric(12,2) := coalesce(p_shipping_amount,0);
  v_discount numeric(12,2) := coalesce(p_discount,0);
  v_total numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id and m.user_id=auth.uid()
      and m.is_active=true and m.role in ('owner','admin','manager')
  ) then
    raise exception 'Sem permissão para criar pedidos nesta empresa.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'O pedido precisa conter pelo menos um produto.';
  end if;
  if v_shipping<0 or v_discount<0 then
    raise exception 'Frete e desconto não podem ser negativos.';
  end if;

  -- Valida e bloqueia cada produto durante a transação para impedir estoque negativo.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(v_item->>'product_id','')='' then
      raise exception 'Produto inválido no pedido.';
    end if;
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty<=0 then raise exception 'Quantidade deve ser maior que zero.'; end if;
    select * into v_product
      from public.eparts_products
      where id=(v_item->>'product_id')::uuid and company_id=p_company_id
      for update;
    if not found or not v_product.is_active then
      raise exception 'Produto não encontrado ou inativo.';
    end if;
    if v_product.stock_quantity < v_qty then
      raise exception 'Estoque insuficiente para o produto: %.',v_product.name;
    end if;
    v_line_total := round(v_product.sale_price*v_qty,2);
    v_commission := round(v_line_total*0.12,2);
    v_subtotal := v_subtotal+v_line_total;
    v_commission_total := v_commission_total+v_commission;
    v_supplier_total := v_supplier_total+(v_line_total-v_commission);
  end loop;

  v_total := v_subtotal-v_discount+v_shipping;
  if v_discount>v_subtotal or v_total<0 then raise exception 'Desconto maior que o subtotal.'; end if;

  insert into public.eparts_sales(
    company_id,customer_id,source,status,payment_status,payment_method,
    subtotal,discount,shipping_amount,total_amount,eparts_commission_rate,
    eparts_commission_amount,supplier_amount,customer_name,customer_email,
    customer_phone,customer_address,notes
  ) values (
    p_company_id,p_customer_id,'admin','confirmed','pending',p_payment_method,
    v_subtotal,v_discount,v_shipping,v_total,12.00,
    v_commission_total,v_supplier_total,p_customer_name,p_customer_email,
    p_customer_phone,coalesce(p_customer_address,'{}'::jsonb),p_notes
  ) returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_product from public.eparts_products
      where id=(v_item->>'product_id')::uuid and company_id=p_company_id for update;
    v_line_total := round(v_product.sale_price*v_qty,2);
    v_commission := round(v_line_total*0.12,2);
    insert into public.eparts_sale_items(
      company_id,sale_id,product_id,supplier_id,product_name,sku,
      quantity,unit_price,line_total,eparts_commission_amount,supplier_amount
    ) values (
      p_company_id,v_sale_id,v_product.id,v_product.supplier_id,v_product.name,
      v_product.sku,v_qty,v_product.sale_price,v_line_total,v_commission,
      v_line_total-v_commission
    );
    update public.eparts_products
      set stock_quantity=stock_quantity-v_qty,updated_at=now()
      where id=v_product.id and company_id=p_company_id;
  end loop;
  return v_sale_id;
end;
$$;

revoke all on function public.eparts_create_sale(uuid,jsonb,uuid,text,text,text,jsonb,text,numeric,numeric,text) from public, anon;
grant execute on function public.eparts_create_sale(uuid,jsonb,uuid,text,text,text,jsonb,text,numeric,numeric,text) to authenticated;
