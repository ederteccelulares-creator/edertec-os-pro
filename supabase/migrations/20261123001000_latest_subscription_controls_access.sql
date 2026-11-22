-- Ensure only the newest subscription controls company access.
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
        not exists (
          select 1 from public.company_subscriptions any_sub
          where any_sub.company_id = target_company_id
        )
        or exists (
          select 1
          from public.company_subscriptions cs
          where cs.company_id = target_company_id
            and not exists (
              select 1 from public.company_subscriptions newer
              where newer.company_id = cs.company_id
                and (newer.created_at, newer.id) > (cs.created_at, cs.id)
            )
            and (
              (cs.status = 'trial' and coalesce(cs.trial_ends_at, cs.ends_at) > now())
              or (cs.status = 'active' and (cs.ends_at is null or cs.ends_at > now()))
            )
        )
      )
  );
$function$;
