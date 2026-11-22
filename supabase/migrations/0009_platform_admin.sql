-- Edertec OS Pro - platform super administrator controls
-- Apply after migrations 0001 through 0008.
-- Bootstrap the first platform administrator manually with the SQL statement in README.

-- Subscription enforcement: suspended/expired tenants cannot perform role-protected writes.
create or replace function public.has_org_role(target_org uuid, allowed public.member_role[])
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.organization_members m
    join public.subscriptions s on s.organization_id=m.organization_id
    where m.organization_id=target_org and m.user_id=auth.uid() and m.active
      and m.role=any(allowed)
      and (
        (s.status='active' and (s.current_period_end is null or s.current_period_end>now()))
        or (s.status='trialing' and (s.trial_ends_at is null or s.trial_ends_at>now()))
      )
  );
$$;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.platform_admins enable row level security;
-- Intentionally no client-facing policies: membership is readable only through trusted RPCs.

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()); $$;

create or replace function public.platform_dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path=public
as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  select jsonb_build_object(
    'organizations',(select count(*) from public.organizations),
    'active_subscriptions',(select count(*) from public.subscriptions where status='active'),
    'trialing_subscriptions',(select count(*) from public.subscriptions where status='trialing'),
    'past_due_subscriptions',(select count(*) from public.subscriptions where status='past_due'),
    'suspended_subscriptions',(select count(*) from public.subscriptions where status='suspended'),
    'users',(select count(distinct user_id) from public.organization_members where active)
  ) into result;
  return result;
end;
$$;

create or replace function public.platform_list_organizations()
returns table (
  organization_id uuid,
  organization_name text,
  organization_slug text,
  created_at timestamptz,
  member_count bigint,
  branch_count bigint,
  subscription_id uuid,
  subscription_status public.subscription_status,
  plan_id uuid,
  plan_name text,
  trial_ends_at timestamptz,
  current_period_end timestamptz
)
language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  return query
    select o.id,o.name,o.slug,o.created_at,
      (select count(*) from public.organization_members m where m.organization_id=o.id and m.active),
      (select count(*) from public.branches b where b.organization_id=o.id and b.active),
      s.id,s.status,s.plan_id,p.name,s.trial_ends_at,s.current_period_end
    from public.organizations o
    left join public.subscriptions s on s.organization_id=o.id
    left join public.plans p on p.id=s.plan_id
    order by o.created_at desc;
end;
$$;

create or replace function public.platform_update_subscription(
  p_organization_id uuid,
  p_status public.subscription_status,
  p_plan_id uuid default null,
  p_trial_ends_at timestamptz default null,
  p_current_period_end timestamptz default null
)
returns void language plpgsql security definer set search_path=public
as $$
declare old_status public.subscription_status;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if p_plan_id is not null and not exists(select 1 from public.plans where id=p_plan_id) then raise exception 'Plan not found'; end if;
  select status into old_status from public.subscriptions where organization_id=p_organization_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  update public.subscriptions set status=p_status,plan_id=p_plan_id,
    trial_ends_at=p_trial_ends_at,current_period_end=p_current_period_end,updated_at=now()
  where organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'platform.subscription_updated','subscription',p_organization_id::text,
    jsonb_build_object('old_status',old_status,'new_status',p_status,'plan_id',p_plan_id,
      'trial_ends_at',p_trial_ends_at,'current_period_end',p_current_period_end));
end;
$$;

create or replace function public.platform_save_plan(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_monthly_price numeric,
  p_yearly_price numeric,
  p_max_users integer,
  p_max_branches integer,
  p_active boolean
)
returns uuid language plpgsql security definer set search_path=public
as $$
declare saved_id uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  if nullif(trim(coalesce(p_code,'')),'') is null or nullif(trim(coalesce(p_name,'')),'') is null
    or p_monthly_price<0 or p_yearly_price<0 or coalesce(p_max_users,0)<0 or coalesce(p_max_branches,0)<0 then
    raise exception 'Check plan code, name, prices and limits';
  end if;
  if p_plan_id is null then
    insert into public.plans(code,name,description,monthly_price,yearly_price,max_users,max_branches,active)
    values(lower(trim(p_code)),trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_monthly_price,p_yearly_price,p_max_users,p_max_branches,coalesce(p_active,true))
    returning id into saved_id;
  else
    update public.plans set code=lower(trim(p_code)),name=trim(p_name),
      description=nullif(trim(coalesce(p_description,'')),''),monthly_price=p_monthly_price,
      yearly_price=p_yearly_price,max_users=p_max_users,max_branches=p_max_branches,
      active=coalesce(p_active,true)
    where id=p_plan_id returning id into saved_id;
    if saved_id is null then raise exception 'Plan not found'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.platform_list_plans()
returns setof public.plans language plpgsql stable security definer set search_path=public
as $$
begin
  if auth.uid() is null or not public.is_platform_admin() then raise exception 'Platform administrator access required'; end if;
  return query select * from public.plans order by monthly_price,name;
end;
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.platform_dashboard_summary() from public;
revoke all on function public.platform_list_organizations() from public;
revoke all on function public.platform_update_subscription(uuid,public.subscription_status,uuid,timestamptz,timestamptz) from public;
revoke all on function public.platform_save_plan(uuid,text,text,text,numeric,numeric,integer,integer,boolean) from public;
revoke all on function public.platform_list_plans() from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.platform_dashboard_summary() to authenticated;
grant execute on function public.platform_list_organizations() to authenticated;
grant execute on function public.platform_update_subscription(uuid,public.subscription_status,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.platform_save_plan(uuid,text,text,text,numeric,numeric,integer,integer,boolean) to authenticated;
grant execute on function public.platform_list_plans() to authenticated;


-- Plan limits are enforced in PostgreSQL, not only displayed in the admin UI.
create or replace function public.create_organization(org_name text, org_slug text)
returns uuid language plpgsql security definer set search_path=public
as $$
declare new_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(org_name)) < 2 then raise exception 'Organization name is required'; end if;
  if org_slug !~ '^[a-z0-9][a-z0-9-]{2,39}$' then raise exception 'Invalid organization slug'; end if;
  insert into public.organizations(name,slug,created_by)
    values(trim(org_name),lower(org_slug),auth.uid()) returning id into new_org;
  insert into public.subscriptions(organization_id,status,trial_ends_at)
    values(new_org,'trialing',now()+interval '14 days');
  insert into public.organization_members(organization_id,user_id,role)
    values(new_org,auth.uid(),'owner');
  insert into public.branches(organization_id,name,code)
    values(new_org,'Matriz','MATRIZ');
  return new_org;
end;
$$;

create or replace function public.enforce_plan_user_limit()
returns trigger language plpgsql security definer set search_path=public
as $$
declare user_limit integer; current_count bigint;
begin
  if tg_op='INSERT' then
    if new.active then
      select p.max_users into user_limit from public.subscriptions s
        left join public.plans p on p.id=s.plan_id
        where s.organization_id=new.organization_id for update of s;
      if not found then raise exception 'Organization subscription not found'; end if;
      if user_limit is not null then
        select count(*) into current_count from public.organization_members m
          where m.organization_id=new.organization_id and m.active;
        if current_count>=user_limit then raise exception 'User limit reached for the current plan'; end if;
      end if;
    end if;
  elsif tg_op='UPDATE' and new.active and (not old.active or old.organization_id<>new.organization_id) then
    select p.max_users into user_limit from public.subscriptions s
      left join public.plans p on p.id=s.plan_id
      where s.organization_id=new.organization_id for update of s;
    if not found then raise exception 'Organization subscription not found'; end if;
    if user_limit is not null then
      select count(*) into current_count from public.organization_members m
        where m.organization_id=new.organization_id and m.active and m.id<>new.id;
      if current_count>=user_limit then raise exception 'User limit reached for the current plan'; end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_plan_branch_limit()
returns trigger language plpgsql security definer set search_path=public
as $$
declare branch_limit integer; current_count bigint;
begin
  if tg_op='INSERT' then
    if new.active then
      select p.max_branches into branch_limit from public.subscriptions s
        left join public.plans p on p.id=s.plan_id
        where s.organization_id=new.organization_id for update of s;
      if not found then raise exception 'Organization subscription not found'; end if;
      if branch_limit is not null then
        select count(*) into current_count from public.branches b
          where b.organization_id=new.organization_id and b.active;
        if current_count>=branch_limit then raise exception 'Branch limit reached for the current plan'; end if;
      end if;
    end if;
  elsif tg_op='UPDATE' and new.active and (not old.active or old.organization_id<>new.organization_id) then
    select p.max_branches into branch_limit from public.subscriptions s
      left join public.plans p on p.id=s.plan_id
      where s.organization_id=new.organization_id for update of s;
    if not found then raise exception 'Organization subscription not found'; end if;
    if branch_limit is not null then
      select count(*) into current_count from public.branches b
        where b.organization_id=new.organization_id and b.active and b.id<>new.id;
      if current_count>=branch_limit then raise exception 'Branch limit reached for the current plan'; end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_organization_user_limit
before insert or update of active,organization_id on public.organization_members
for each row execute function public.enforce_plan_user_limit();

create trigger enforce_organization_branch_limit
before insert or update of active,organization_id on public.branches
for each row execute function public.enforce_plan_branch_limit();

