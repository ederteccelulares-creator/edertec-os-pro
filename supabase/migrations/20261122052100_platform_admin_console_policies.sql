-- Platform administrators may manage platform metadata only.
-- Authorization is checked by the private registry through is_platform_admin().
drop policy if exists "platform admins can read all companies" on public.companies;
create policy "platform admins can read all companies"
on public.companies for select to authenticated
using (public.is_platform_admin());

drop policy if exists "platform admins can update company status" on public.companies;
create policy "platform admins can update company status"
on public.companies for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "platform admins can manage plans" on public.subscription_plans;
create policy "platform admins can manage plans"
on public.subscription_plans for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

grant update on public.companies to authenticated;
grant insert, update on public.subscription_plans to authenticated;
