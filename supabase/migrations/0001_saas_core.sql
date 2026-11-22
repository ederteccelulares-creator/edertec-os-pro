-- Edertec OS Pro - SaaS multiempresa core
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','admin','manager','attendant','technician');
create type public.subscription_status as enum ('trialing','active','past_due','suspended','cancelled','expired');
create type public.service_order_status as enum ('received','diagnosing','waiting_approval','waiting_parts','repairing','ready','delivered','cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  document text,
  phone text,
  email text,
  logo_url text,
  timezone text not null default 'America/Sao_Paulo',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'attendant',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  phone text,
  address jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id,code),
  unique (id,organization_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  document text,
  address jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,organization_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null,
  brand text not null,
  model text not null,
  color text,
  storage text,
  imei text,
  serial_number text,
  notes text,
  created_at timestamptz not null default now(),
  constraint devices_customer_org_fk foreign key (customer_id,organization_id)
    references public.customers(id,organization_id) on delete restrict,
  unique (id,organization_id)
);

create table public.service_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  customer_id uuid not null,
  device_id uuid,
  order_number bigint generated always as identity,
  status public.service_order_status not null default 'received',
  reported_issue text not null,
  diagnosis text,
  accessories text,
  physical_condition text,
  estimated_amount numeric(12,2) not null default 0 check (estimated_amount >= 0),
  approved_amount numeric(12,2) check (approved_amount >= 0),
  technician_id uuid references auth.users(id),
  opened_by uuid not null default auth.uid() references auth.users(id),
  received_at timestamptz not null default now(),
  delivered_at timestamptz,
  warranty_days integer not null default 90 check (warranty_days >= 0),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_branch_org_fk foreign key (branch_id,organization_id)
    references public.branches(id,organization_id) on delete restrict,
  constraint orders_customer_org_fk foreign key (customer_id,organization_id)
    references public.customers(id,organization_id) on delete restrict,
  constraint orders_device_org_fk foreign key (device_id,organization_id)
    references public.devices(id,organization_id) on delete restrict
);

create table public.service_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  from_status public.service_order_status,
  to_status public.service_order_status not null,
  description text,
  changed_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  monthly_price numeric(10,2) not null default 0 check (monthly_price >= 0),
  yearly_price numeric(10,2) not null default 0 check (yearly_price >= 0),
  max_users integer,
  max_branches integer,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid references public.plans(id),
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index customers_org_phone_idx on public.customers(organization_id,phone);
create index devices_org_imei_idx on public.devices(organization_id,imei);
create index service_orders_org_created_idx on public.service_orders(organization_id,created_at desc);
create index service_orders_branch_status_idx on public.service_orders(branch_id,status);
create index audit_logs_org_created_idx on public.audit_logs(organization_id,created_at desc);

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.active); $$;

create or replace function public.has_org_role(target_org uuid, allowed public.member_role[])
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.active and m.role=any(allowed)); $$;

create or replace function public.create_organization(org_name text, org_slug text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(org_name)) < 2 then raise exception 'Organization name is required'; end if;
  if org_slug !~ '^[a-z0-9][a-z0-9-]{2,39}
  insert into public.organizations(name,slug,created_by) values(trim(org_name),lower(org_slug),auth.uid()) returning id into new_org;
  insert into public.organization_members(organization_id,user_id,role) values(new_org,auth.uid(),'owner');
  insert into public.branches(organization_id,name,code) values(new_org,'Matriz','MATRIZ');
  insert into public.subscriptions(organization_id,status,trial_ends_at) values(new_org,'trialing',now()+interval '14 days');
  return new_org;
end; $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger service_orders_touch before update on public.service_orders for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.devices enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_order_events enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "Members read organizations" on public.organizations for select to authenticated using(public.is_org_member(id));
create policy "Owners update organization" on public.organizations for update to authenticated using(public.has_org_role(id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(id,array['owner','admin']::public.member_role[]));
create policy "Members read memberships" on public.organization_members for select to authenticated using(public.is_org_member(organization_id));
create policy "Admins manage memberships" on public.organization_members for all to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner']::public.member_role[]) or (public.has_org_role(organization_id,array['admin']::public.member_role[]) and role <> 'owner'));
create policy "Members read branches" on public.branches for select to authenticated using(public.is_org_member(organization_id));
create policy "Admins manage branches" on public.branches for all to authenticated using(public.has_org_role(organization_id,array['owner','admin','manager']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin','manager']::public.member_role[]));
create policy "Members manage customers" on public.customers for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage devices" on public.devices for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage orders" on public.service_orders for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members read order events" on public.service_order_events for select to authenticated using(public.is_org_member(organization_id));
create policy "Members add order events" on public.service_order_events for insert to authenticated with check(public.is_org_member(organization_id) and changed_by=auth.uid());
create policy "Anyone reads active plans" on public.plans for select to authenticated using(active);
create policy "Members read subscription" on public.subscriptions for select to authenticated using(public.is_org_member(organization_id));
create policy "Members read audit logs" on public.audit_logs for select to authenticated using(public.is_org_member(organization_id));
create policy "Members insert audit logs" on public.audit_logs for insert to authenticated with check(public.is_org_member(organization_id) and actor_id=auth.uid());

grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid,public.member_role[]) to authenticated;
 then raise exception 'Invalid organization slug'; end if;
  insert into public.organizations(name,slug,created_by) values(trim(org_name),lower(org_slug),auth.uid()) returning id into new_org;
  insert into public.organization_members(organization_id,user_id,role) values(new_org,auth.uid(),'owner');
  insert into public.branches(organization_id,name,code) values(new_org,'Matriz','MATRIZ');
  insert into public.subscriptions(organization_id,status,trial_ends_at) values(new_org,'trialing',now()+interval '14 days');
  return new_org;
end; $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.touch_updated_at();
create trigger service_orders_touch before update on public.service_orders for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.devices enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_order_events enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "Members read organizations" on public.organizations for select to authenticated using(public.is_org_member(id));
create policy "Owners update organization" on public.organizations for update to authenticated using(public.has_org_role(id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(id,array['owner','admin']::public.member_role[]));
create policy "Members read memberships" on public.organization_members for select to authenticated using(public.is_org_member(organization_id));
create policy "Admins manage memberships" on public.organization_members for all to authenticated using(public.has_org_role(organization_id,array['owner','admin']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin']::public.member_role[]));
create policy "Members read branches" on public.branches for select to authenticated using(public.is_org_member(organization_id));
create policy "Admins manage branches" on public.branches for all to authenticated using(public.has_org_role(organization_id,array['owner','admin','manager']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','admin','manager']::public.member_role[]));
create policy "Members manage customers" on public.customers for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage devices" on public.devices for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members manage orders" on public.service_orders for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy "Members read order events" on public.service_order_events for select to authenticated using(public.is_org_member(organization_id));
create policy "Members add order events" on public.service_order_events for insert to authenticated with check(public.is_org_member(organization_id) and changed_by=auth.uid());
create policy "Anyone reads active plans" on public.plans for select to authenticated using(active);
create policy "Members read subscription" on public.subscriptions for select to authenticated using(public.is_org_member(organization_id));
create policy "Members read audit logs" on public.audit_logs for select to authenticated using(public.is_org_member(organization_id));
create policy "Members insert audit logs" on public.audit_logs for insert to authenticated with check(public.is_org_member(organization_id) and actor_id=auth.uid());

grant execute on function public.create_organization(text,text) to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid,public.member_role[]) to authenticated;
