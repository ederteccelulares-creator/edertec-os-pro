-- Show the correct expiration date for active subscriptions whose legacy
-- ends_at value was not populated. This is calculated from the stored start
-- date and the plan version purchased; no company or subscription rows change.
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
    case
      when cs.status = 'trial' then coalesce(cs.trial_ends_at, cs.ends_at)
      else coalesce(
        cs.ends_at,
        case sp.billing_interval
          when 'monthly' then cs.starts_at + interval '1 month'
          when 'six_months' then cs.starts_at + interval '6 months'
          when 'yearly' then cs.starts_at + interval '1 year'
          when 'lifetime' then null::timestamptz
          else null::timestamptz
        end
      )
    end,
    sp.name
  from public.companies c
  left join lateral (
    select x.* from public.company_subscriptions x
    where x.company_id = c.id
    order by x.created_at desc, x.id desc
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
