-- Three-day trial and server-enforced subscription access.
-- Existing companies without a subscription keep their current access.
create or replace function public.register_company(
  company_name text,
  company_tax_id text default null,
  main_phone text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_company_id uuid;
  current_user_id uuid;
  trial_plan_id uuid;
  trial_deadline timestamptz := now() + interval '3 days';
begin
  current_user_id := auth.uid();
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if company_name is null or length(trim(company_name)) < 2 then
    raise exception 'Company name must contain at least 2 characters';
  end if;

  select sp.id into trial_plan_id
  from public.subscription_plans sp
  where sp.is_active = true
  order by sp.price asc, sp.created_at asc
  limit 1;
  if trial_plan_id is null then
    raise exception 'No active subscription plan is available for the trial';
  end if;

  insert into public.companies (name, tax_id, phone, status)
  values (trim(company_name), nullif(trim(company_tax_id), ''), nullif(trim(main_phone), ''), 'active')
  returning id into new_company_id;

  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, current_user_id, 'owner');

  insert into public.branches (company_id, name, phone)
  values (new_company_id, 'Matriz', nullif(trim(main_phone), ''));

  insert into public.company_subscriptions
    (company_id, plan_id, status, starts_at, ends_at, trial_ends_at)
  values
    (new_company_id, trial_plan_id, 'trial', now(), trial_deadline, trial_deadline);

  return new_company_id;
end;
$function$;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.company_id = target_company_id
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
      and c.status = 'active'
      and (
        not exists (select 1 from public.company_subscriptions cs where cs.company_id = target_company_id)
        or exists (
          select 1 from public.company_subscriptions cs
          where cs.company_id = target_company_id
            and (
              (cs.status = 'trial' and coalesce(cs.trial_ends_at, cs.ends_at) > now())
              or (cs.status = 'active' and (cs.ends_at is null or cs.ends_at > now()))
            )
        )
      )
  );
$function$;

create or replace function public.has_company_role(target_company_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.is_company_member(target_company_id)
    and exists (
      select 1 from public.company_members cm
      where cm.company_id = target_company_id
        and cm.user_id = (select auth.uid())
        and cm.is_active = true
        and cm.role = any(allowed_roles)
    );
$function$;

-- Keep the company name visible to its own members so the expired-trial screen can render.
drop policy if exists "members can read their company" on public.companies;
create policy "members can read their company"
on public.companies for select to authenticated
using (exists (
  select 1 from public.company_members cm
  where cm.company_id = companies.id
    and cm.user_id = (select auth.uid())
    and cm.is_active = true
));

create or replace function public.get_company_access_status(target_company_id uuid)
returns table (
  is_allowed boolean,
  company_status text,
  subscription_status text,
  trial_ends_at timestamptz,
  ends_at timestamptz,
  plan_name text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.is_company_member(target_company_id),
    c.status,
    cs.status,
    cs.trial_ends_at,
    cs.ends_at,
    sp.name
  from public.companies c
  left join lateral (
    select x.* from public.company_subscriptions x
    where x.company_id = c.id
    order by x.created_at desc
    limit 1
  ) cs on true
  left join public.subscription_plans sp on sp.id = cs.plan_id
  where c.id = target_company_id
    and exists (
      select 1 from public.company_members cm
      where cm.company_id = c.id
        and cm.user_id = (select auth.uid())
        and cm.is_active = true
    );
$function$;

revoke all on function public.get_company_access_status(uuid) from public, anon;
grant execute on function public.get_company_access_status(uuid) to authenticated;
