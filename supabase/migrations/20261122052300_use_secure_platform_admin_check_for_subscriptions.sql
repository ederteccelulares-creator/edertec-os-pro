-- The platform_admins registry is intentionally not readable by API roles.
-- Use the boolean SECURITY DEFINER helper instead of querying that table in RLS.
drop policy if exists "platform admins can manage subscriptions" on public.company_subscriptions;

create policy "platform admins can manage subscriptions"
on public.company_subscriptions
for all
to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));
