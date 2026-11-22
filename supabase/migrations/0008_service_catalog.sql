-- Edertec OS Pro - service catalog and service-to-order workflow
-- Apply after migrations 0001 through 0007.

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'Geral',
  price numeric(12,2) not null default 0 check(price>=0),
  estimated_minutes integer not null default 0 check(estimated_minutes>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,organization_id)
);
create index service_catalog_org_active_idx on public.service_catalog(organization_id,active,name);

create table public.service_order_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  service_order_id uuid not null,
  service_id uuid,
  service_name text not null,
  quantity numeric(10,2) not null default 1 check(quantity>0),
  unit_price numeric(12,2) not null check(unit_price>=0),
  line_total numeric(12,2) generated always as (quantity*unit_price) stored,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint service_lines_order_fk foreign key(service_order_id,organization_id)
    references public.service_orders(id,organization_id) on delete cascade,
  constraint service_lines_branch_fk foreign key(branch_id,organization_id)
    references public.branches(id,organization_id) on delete restrict,
  constraint service_lines_service_fk foreign key(service_id,organization_id)
    references public.service_catalog(id,organization_id) on delete restrict
);
create index service_order_lines_order_idx on public.service_order_lines(service_order_id,created_at);

alter table public.service_catalog enable row level security;
alter table public.service_order_lines enable row level security;
create policy "Members read service catalog" on public.service_catalog
  for select to authenticated using(public.is_org_member(organization_id));
create policy "Members read service order lines" on public.service_order_lines
  for select to authenticated using(public.is_org_member(organization_id));

create or replace function public.save_service_catalog_item(
  p_organization_id uuid,p_service_id uuid,p_name text,p_description text,
  p_category text,p_price numeric,p_estimated_minutes integer,p_active boolean
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare saved_id uuid;
begin
  if not public.has_org_role(p_organization_id,array['owner','admin','manager']::public.member_role[]) then
    raise exception 'Only managers can manage the service catalog';
  end if;
  if nullif(trim(coalesce(p_name,'')),'') is null or p_price<0 or p_estimated_minutes<0 then
    raise exception 'Check service name, price and estimated time';
  end if;
  if p_service_id is null then
    insert into public.service_catalog(organization_id,name,description,category,price,estimated_minutes,active)
    values(p_organization_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),coalesce(nullif(trim(p_category),''),'Geral'),p_price,p_estimated_minutes,coalesce(p_active,true))
    returning id into saved_id;
  else
    update public.service_catalog set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),
      category=coalesce(nullif(trim(p_category),''),'Geral'),price=p_price,estimated_minutes=p_estimated_minutes,
      active=coalesce(p_active,true),updated_at=now()
    where id=p_service_id and organization_id=p_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Service not found'; end if;
  end if;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'service_catalog.saved','service_catalog',saved_id::text,
    jsonb_build_object('name',trim(p_name),'price',p_price,'active',p_active));
  return saved_id;
end;
$$;

create or replace function public.add_service_to_order(
  p_organization_id uuid,p_branch_id uuid,p_order_id uuid,p_service_id uuid,p_quantity numeric default 1
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare svc public.service_catalog; ord public.service_orders; line_id uuid;
begin
  if not public.has_org_role(p_organization_id,array['owner','admin','manager','technician']::public.member_role[]) then
    raise exception 'You do not have permission to add services to orders';
  end if;
  if p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
  select * into ord from public.service_orders where id=p_order_id and organization_id=p_organization_id and branch_id=p_branch_id for update;
  if not found then raise exception 'Service order not found in this branch'; end if;
  if ord.status in ('delivered','cancelled') then raise exception 'Closed orders cannot be changed'; end if;
  select * into svc from public.service_catalog where id=p_service_id and organization_id=p_organization_id and active;
  if not found then raise exception 'Active service not found'; end if;
  insert into public.service_order_lines(organization_id,branch_id,service_order_id,service_id,service_name,quantity,unit_price)
  values(p_organization_id,p_branch_id,p_order_id,svc.id,svc.name,p_quantity,svc.price) returning id into line_id;
  update public.service_orders set estimated_amount=estimated_amount+(svc.price*p_quantity) where id=p_order_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'service_order.service_added','service_order',p_order_id::text,
    jsonb_build_object('service_id',svc.id,'service_name',svc.name,'quantity',p_quantity,'unit_price',svc.price));
  return line_id;
end;
$$;

create or replace function public.touch_service_catalog_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
create trigger service_catalog_touch before update on public.service_catalog
for each row execute function public.touch_service_catalog_updated_at();

revoke all on function public.save_service_catalog_item(uuid,uuid,text,text,text,numeric,integer,boolean) from public;
revoke all on function public.add_service_to_order(uuid,uuid,uuid,uuid,numeric) from public;
grant execute on function public.save_service_catalog_item(uuid,uuid,text,text,text,numeric,integer,boolean) to authenticated;
grant execute on function public.add_service_to_order(uuid,uuid,uuid,uuid,numeric) to authenticated;
