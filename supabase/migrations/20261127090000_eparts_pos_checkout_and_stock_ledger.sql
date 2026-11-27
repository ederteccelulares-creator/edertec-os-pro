-- PDV EPARTS: finalização presencial atômica, baixa imediata e trilha de estoque.
alter table public.eparts_sales drop constraint if exists eparts_sales_source_check;
alter table public.eparts_sales add constraint eparts_sales_source_check check(source in('admin','catalog','pos'));

create table if not exists public.eparts_stock_movements(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 product_id uuid not null,
 sale_id uuid,
 movement_type text not null check(movement_type in('sale','sale_reversal','adjustment','purchase')),
 quantity numeric(12,3) not null check(quantity>0),
 stock_before numeric(12,3) not null,
 stock_after numeric(12,3) not null,
 note text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key(product_id,company_id) references public.eparts_products(id,company_id),
 foreign key(sale_id,company_id) references public.eparts_sales(id,company_id)
);
create index if not exists eparts_stock_movements_company_date_idx on public.eparts_stock_movements(company_id,created_at desc);
alter table public.eparts_stock_movements enable row level security;
drop policy if exists eparts_stock_movements_manager_read on public.eparts_stock_movements;
create policy eparts_stock_movements_manager_read on public.eparts_stock_movements for select to authenticated using(
 exists(select 1 from public.company_members m where m.company_id=eparts_stock_movements.company_id
 and m.user_id=auth.uid() and m.is_active=true and m.role in('owner','admin','manager'))
);
revoke insert,update,delete on public.eparts_stock_movements from public,anon,authenticated;

create or replace function public.eparts_finalize_pos_sale(
 p_company_id uuid,
 p_items jsonb,
 p_payment_method text,
 p_customer_name text default 'Consumidor final',
 p_discount numeric default 0,
 p_notes text default null
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
 v_sale_id uuid; v_item jsonb; v_product public.eparts_products%rowtype;
 v_group record; v_qty numeric(12,3); v_line numeric(12,2);
 v_subtotal numeric(12,2):=0; v_commission numeric(12,2):=0;
 v_supplier numeric(12,2):=0; v_discount numeric(12,2):=coalesce(p_discount,0);
 v_before numeric(12,3);
begin
 if auth.uid() is null or not exists(
  select 1 from public.company_members m where m.company_id=p_company_id
  and m.user_id=auth.uid() and m.is_active=true and m.role in('owner','admin','manager')
 ) then raise exception 'Sem permissão para operar o PDV da EPARTS.'; end if;
 if p_company_id<>'336c5941-6f23-418e-968e-730442650d98'::uuid then
  raise exception 'Este PDV pertence exclusivamente à EPARTS.';
 end if;
 if p_payment_method not in('pix','cash','card') then raise exception 'Forma de pagamento inválida.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then
  raise exception 'Adicione pelo menos um produto à venda.';
 end if;
 if v_discount<0 then raise exception 'Desconto inválido.'; end if;

 -- Agrupa produtos repetidos e bloqueia linhas em ordem estável para evitar corrida de estoque.
 for v_group in
  select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::numeric) quantity
  from jsonb_array_elements(p_items)
  group by (value->>'product_id')::uuid order by (value->>'product_id')::uuid
 loop
  if v_group.quantity<=0 then raise exception 'Quantidade inválida.'; end if;
  select * into v_product from public.eparts_products
   where id=v_group.product_id and company_id=p_company_id and is_active=true for update;
  if not found then raise exception 'Produto não encontrado ou inativo.'; end if;
  if v_product.stock_quantity<v_group.quantity then
   raise exception 'Estoque insuficiente para % (disponível: %).',v_product.name,v_product.stock_quantity;
  end if;
 end loop;

 for v_item in select value from jsonb_array_elements(p_items) loop
  if coalesce(v_item->>'quantity','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Quantidade inválida.'; end if;
  v_qty:=(v_item->>'quantity')::numeric;
  if v_qty<=0 then raise exception 'Quantidade inválida.'; end if;
  select * into v_product from public.eparts_products where id=(v_item->>'product_id')::uuid and company_id=p_company_id;
  v_line:=round(v_product.sale_price*v_qty,2);
  v_subtotal:=v_subtotal+v_line;
  v_commission:=v_commission+round(v_line*0.12,2);
  v_supplier:=v_supplier+(v_line-round(v_line*0.12,2));
 end loop;
 if v_discount>v_subtotal then raise exception 'Desconto não pode superar o subtotal.'; end if;

 insert into public.eparts_sales(company_id,source,status,payment_status,payment_method,subtotal,discount,total_amount,
  eparts_commission_rate,eparts_commission_amount,supplier_amount,customer_name,notes)
 values(p_company_id,'pos','confirmed','paid',p_payment_method,v_subtotal,v_discount,v_subtotal-v_discount,
  12.00,round(v_commission*(v_subtotal-v_discount)/nullif(v_subtotal,0),2),
  v_supplier-v_discount,coalesce(nullif(trim(p_customer_name),''),'Consumidor final'),p_notes)
 returning id into v_sale_id;

 for v_item in select value from jsonb_array_elements(p_items) loop
  v_qty:=(v_item->>'quantity')::numeric;
  select * into v_product from public.eparts_products where id=(v_item->>'product_id')::uuid and company_id=p_company_id for update;
  v_line:=round(v_product.sale_price*v_qty,2);
  insert into public.eparts_sale_items(company_id,sale_id,product_id,supplier_id,product_name,sku,quantity,unit_price,line_total,eparts_commission_amount,supplier_amount)
  values(p_company_id,v_sale_id,v_product.id,v_product.supplier_id,v_product.name,v_product.sku,v_qty,v_product.sale_price,v_line,
   round(v_line*0.12,2),v_line-round(v_line*0.12,2));
 end loop;

 for v_group in
  select (value->>'product_id')::uuid product_id,sum((value->>'quantity')::numeric) quantity
  from jsonb_array_elements(p_items) group by (value->>'product_id')::uuid
 loop
  select stock_quantity into v_before from public.eparts_products where id=v_group.product_id and company_id=p_company_id;
  update public.eparts_products set stock_quantity=stock_quantity-v_group.quantity,updated_at=now()
   where id=v_group.product_id and company_id=p_company_id;
  insert into public.eparts_stock_movements(company_id,product_id,sale_id,movement_type,quantity,stock_before,stock_after,note,created_by)
  values(p_company_id,v_group.product_id,v_sale_id,'sale',v_group.quantity,v_before,v_before-v_group.quantity,'Venda PDV',auth.uid());
 end loop;
 return v_sale_id;
end;
$$;
revoke all on function public.eparts_finalize_pos_sale(uuid,jsonb,text,text,numeric,text) from public,anon;
grant execute on function public.eparts_finalize_pos_sale(uuid,jsonb,text,text,numeric,text) to authenticated;
