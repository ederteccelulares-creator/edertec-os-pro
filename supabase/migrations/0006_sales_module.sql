-- Edertec OS Pro - sales with atomic stock deduction and cashflow integration
-- Apply after migrations 0001 through 0005.

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  customer_id uuid,
  sale_number bigint generated always as identity,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total > 0),
  payment_method text not null check (payment_method in ('cash','pix','debit_card','credit_card','bank_transfer','boleto','other')),
  payment_status text not null default 'paid' check (payment_status in ('pending','paid')),
  notes text,
  sold_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint sales_branch_fk foreign key (branch_id,organization_id)
    references public.branches(id,organization_id) on delete restrict,
  constraint sales_customer_fk foreign key (customer_id,organization_id)
    references public.customers(id,organization_id) on delete restrict,
  unique (id,organization_id)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  item_id uuid not null,
  product_name text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  constraint sale_items_sale_fk foreign key (sale_id,organization_id)
    references public.sales(id,organization_id) on delete cascade,
  constraint sale_items_product_fk foreign key (item_id,organization_id)
    references public.inventory_items(id,organization_id) on delete restrict
);

create index sales_org_branch_created_idx on public.sales(organization_id,branch_id,created_at desc);
create index sale_items_sale_idx on public.sale_items(sale_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy "Members read branch sales" on public.sales
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Members read sale items" on public.sale_items
  for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.create_sale(
  p_organization_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_payment_status text default 'paid',
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_notes text default null
)
returns public.sales
language plpgsql security definer set search_path=public
as $$
declare
  sale_row public.sales;
  line jsonb;
  product_row public.inventory_items;
  stock_qty numeric(12,3);
  line_qty numeric(12,3);
  line_price numeric(12,2);
  line_sum numeric(12,2);
  subtotal_value numeric(12,2) := 0;
  total_value numeric(12,2);
  line_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id,array['owner','admin','manager','attendant']::public.member_role[]) then
    raise exception 'You do not have permission to create sales';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and organization_id=p_organization_id and active) then
    raise exception 'Branch not found or inactive';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one product'; end if;
  if jsonb_array_length(p_items)>100 then raise exception 'Too many sale lines'; end if;
  if p_payment_method not in ('cash','pix','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Invalid payment method'; end if;
  if p_payment_status not in ('paid','pending') then raise exception 'Invalid payment status'; end if;
  if coalesce(p_discount,0)<0 then raise exception 'Discount cannot be negative'; end if;
  if p_customer_id is not null and not exists(select 1 from public.customers where id=p_customer_id and organization_id=p_organization_id) then
    raise exception 'Customer not found';
  end if;

  -- Validate all requested quantities before writing any records.
  for line in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(line->>'item_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'Invalid product id'; end if;
    line_qty := (line->>'quantity')::numeric;
    if line_qty is null or line_qty<=0 then raise exception 'Invalid product quantity'; end if;
    select * into product_row from public.inventory_items
      where id=(line->>'item_id')::uuid and organization_id=p_organization_id and active;
    if not found then raise exception 'Product not found or inactive'; end if;
    select quantity into stock_qty from public.branch_inventory
      where organization_id=p_organization_id and branch_id=p_branch_id and item_id=product_row.id for update;
    if not found then raise exception 'Product is not registered in this branch stock'; end if;
    if stock_qty<line_qty then raise exception 'Insufficient stock for product: %',product_row.name; end if;
    line_price := coalesce((line->>'unit_price')::numeric,product_row.sale_price);
    if line_price<0 then raise exception 'Invalid unit price'; end if;
    subtotal_value := subtotal_value + round(line_qty*line_price,2);
    line_count := line_count+1;
  end loop;

  if line_count=0 then raise exception 'Add at least one product'; end if;
  if coalesce(p_discount,0)>subtotal_value then raise exception 'Discount cannot exceed subtotal'; end if;
  total_value := subtotal_value-coalesce(p_discount,0);
  if total_value<=0 then raise exception 'Sale total must be greater than zero'; end if;

  insert into public.sales(organization_id,branch_id,customer_id,subtotal,discount,total,payment_method,payment_status,notes,sold_by)
  values(p_organization_id,p_branch_id,p_customer_id,subtotal_value,coalesce(p_discount,0),total_value,p_payment_method,p_payment_status,
    nullif(trim(coalesce(p_notes,'')),''),auth.uid()) returning * into sale_row;

  for line in select value from jsonb_array_elements(p_items)
  loop
    line_qty := (line->>'quantity')::numeric;
    select * into product_row from public.inventory_items
      where id=(line->>'item_id')::uuid and organization_id=p_organization_id and active;
    line_price := coalesce((line->>'unit_price')::numeric,product_row.sale_price);
    line_sum := round(line_qty*line_price,2);

    insert into public.sale_items(organization_id,sale_id,item_id,product_name,quantity,unit_price,unit_cost,line_total)
    values(p_organization_id,sale_row.id,product_row.id,product_row.name,line_qty,line_price,product_row.cost_price,line_sum);

    update public.branch_inventory set quantity=quantity-line_qty,updated_at=now()
      where organization_id=p_organization_id and branch_id=p_branch_id and item_id=product_row.id
        and quantity>=line_qty;
    if not found then raise exception 'Stock changed during sale; please retry'; end if;

    insert into public.stock_movements(organization_id,branch_id,item_id,movement_type,quantity,previous_quantity,new_quantity,reason,actor_id)
    values(p_organization_id,p_branch_id,product_row.id,'out',line_qty,
      (select quantity+line_qty from public.branch_inventory where organization_id=p_organization_id and branch_id=p_branch_id and item_id=product_row.id),
      (select quantity from public.branch_inventory where organization_id=p_organization_id and branch_id=p_branch_id and item_id=product_row.id),
      'Venda #'||sale_row.sale_number,auth.uid());
  end loop;

  insert into public.financial_entries(organization_id,branch_id,entry_type,description,amount,payment_method,status,paid_at,notes,created_by)
  values(p_organization_id,p_branch_id,'income','Venda #'||sale_row.sale_number,total_value,p_payment_method,p_payment_status,
    case when p_payment_status='paid' then now() else null end,
    'Gerado automaticamente pela venda '||sale_row.id::text,auth.uid());

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'sales.created','sale',sale_row.id::text,
    jsonb_build_object('branch_id',p_branch_id,'sale_number',sale_row.sale_number,'total',total_value,'items',line_count));
  return sale_row;
end;
$$;

revoke all on function public.create_sale(uuid,uuid,jsonb,text,text,uuid,numeric,text) from public;
grant execute on function public.create_sale(uuid,uuid,jsonb,text,text,uuid,numeric,text) to authenticated;
