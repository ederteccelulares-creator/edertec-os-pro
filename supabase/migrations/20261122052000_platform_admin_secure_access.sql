-- Safe platform-admin verification without exposing the platform_admins registry.
-- The function returns only a boolean and never accepts a user id from the caller.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

comment on function public.is_platform_admin() is
  'Returns whether the current authenticated user is a platform administrator; does not expose registry contents.';
