-- Edertec OS Pro - inventory module with branch-level stock and audited movements
-- Apply after migrations 0001, 0002 and 0003.

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  category text not null default 'Geral',
  description text,
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  min_stock numeric(12,3) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index inventory_items_org_sku_unique
  on public.inventory_items(organization_id, sku) where sku is not null and sku <> '';

create table public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null,
  quantity numeric(12,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  constraint branch_inventory_branch_fk foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  constraint branch_inventory_item_fk foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id) on delete cascade,
  unique (branch_id, item_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null,
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  quantity numeric(12,3) not null check (quantity > 0),
  previous_quantity numeric(12,3) not null,
  new_quantity numeric(12,3) not null,
  reason text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint stock_movements_branch_fk foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  constraint stock_movements_item_fk foreign key (item_id, organization_id)
    references public.inventory_items(id, organization_id) on delete cascade
);

create index branch_inventory_org_branch_idx on public.branch_inventory(organization_id, branch_id);
create index stock_movements_org_created_idx on public.stock_movements(organization_id, created_at desc);

create trigger inventory_items_touch before update on public.inventory_items
for each row execute function public.touch_updated_at();

alter table public.inventory_items enable row level security;
alter table public.branch_inventory enable row level security;
alter table public.stock_movements enable row level security;

create policy "Members read inventory items" on public.inventory_items
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Managers manage inventory items" on public.inventory_items
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[]));

create policy "Members read branch inventory" on public.branch_inventory
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Members read stock movements" on public.stock_movements
  for select to authenticated using (public.is_org_member(organization_id));

create or replace function public.adjust_branch_stock(
  p_organization_id uuid,
  p_branch_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_reason text default null
)
returns public.branch_inventory
language plpgsql
security definer
set search_path = public
as $$
declare
  current_qty numeric(12,3);
  next_qty numeric(12,3);
  stock_row public.branch_inventory;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'You do not have permission to change stock';
  end if;
  if p_movement_type not in ('in','out','adjustment') then raise exception 'Invalid movement type'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if not exists(select 1 from public.inventory_items where id=p_item_id and organization_id=p_organization_id and active) then
    raise exception 'Inventory item not found or inactive';
  end if;

  insert into public.branch_inventory(organization_id, branch_id, item_id, quantity)
  values(p_organization_id, p_branch_id, p_item_id, 0)
  on conflict(branch_id, item_id) do nothing;

  select quantity into current_qty
  from public.branch_inventory
  where organization_id=p_organization_id and branch_id=p_branch_id and item_id=p_item_id
  for update;

  next_qty := case
    when p_movement_type='in' then current_qty + p_quantity
    when p_movement_type='out' then current_qty - p_quantity
    else p_quantity
  end;
  if next_qty < 0 then raise exception 'Insufficient stock'; end if;

  update public.branch_inventory
  set quantity=next_qty, updated_at=now()
  where organization_id=p_organization_id and branch_id=p_branch_id and item_id=p_item_id
  returning * into stock_row;

  insert into public.stock_movements(
    organization_id, branch_id, item_id, movement_type, quantity,
    previous_quantity, new_quantity, reason, actor_id
  ) values (
    p_organization_id, p_branch_id, p_item_id, p_movement_type, p_quantity,
    current_qty, next_qty, nullif(trim(coalesce(p_reason,'')), ''), auth.uid()
  );

  insert into public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  values(p_organization_id, auth.uid(), 'inventory.stock_changed', 'inventory_item', p_item_id::text,
    jsonb_build_object('branch_id',p_branch_id,'type',p_movement_type,'previous',current_qty,'new',next_qty));

  return stock_row;
end;
$$;

revoke all on function public.adjust_branch_stock(uuid,uuid,uuid,text,numeric,text) from public;
grant execute on function public.adjust_branch_stock(uuid,uuid,uuid,text,numeric,text) to authenticated;


create or replace function public.create_inventory_item_for_branch(
  p_organization_id uuid,
  p_branch_id uuid,
  p_name text,
  p_sku text default null,
  p_category text default 'Geral',
  p_cost_price numeric default 0,
  p_sale_price numeric default 0,
  p_min_stock numeric default 0
)
returns public.inventory_items
language plpgsql
security definer
set search_path = public
as $$
declare new_item public.inventory_items;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'You do not have permission to create inventory items';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and organization_id=p_organization_id and active) then
    raise exception 'Branch not found or inactive';
  end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then raise exception 'Product name is required'; end if;
  if coalesce(p_cost_price,0)<0 or coalesce(p_sale_price,0)<0 or coalesce(p_min_stock,0)<0 then
    raise exception 'Prices and minimum stock cannot be negative';
  end if;

  insert into public.inventory_items(organization_id,name,sku,category,cost_price,sale_price,min_stock)
  values(p_organization_id,trim(p_name),nullif(trim(coalesce(p_sku,'')),''),coalesce(nullif(trim(coalesce(p_category,'')),''),'Geral'),coalesce(p_cost_price,0),coalesce(p_sale_price,0),coalesce(p_min_stock,0))
  returning * into new_item;

  insert into public.branch_inventory(organization_id,branch_id,item_id,quantity)
  values(p_organization_id,p_branch_id,new_item.id,0);

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'inventory.item_created','inventory_item',new_item.id::text,
    jsonb_build_object('branch_id',p_branch_id,'name',new_item.name));

  return new_item;
end;
$$;

revoke all on function public.create_inventory_item_for_branch(uuid,uuid,text,text,text,numeric,numeric,numeric) from public;
grant execute on function public.create_inventory_item_for_branch(uuid,uuid,text,text,text,numeric,numeric,numeric) to authenticated;
