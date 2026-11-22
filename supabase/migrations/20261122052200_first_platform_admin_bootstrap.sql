-- One-time bootstrap for the first platform administrator.
-- This function is callable only by the postgres database role (e.g. SQL Editor),
-- never by anon/authenticated API clients.
create or replace function public.bootstrap_first_platform_admin(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_user <> 'postgres' then
    raise exception 'This operation must be run by the database postgres role.';
  end if;

  if p_user_id is null or not exists (
    select 1 from auth.users u where u.id = p_user_id
  ) then
    raise exception 'The selected Auth user does not exist.';
  end if;

  if exists (select 1 from public.platform_admins) then
    raise exception 'A platform administrator is already configured. Bootstrap is closed.';
  end if;

  insert into public.platform_admins(user_id) values (p_user_id);
end;
$$;

revoke all on function public.bootstrap_first_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_admin(uuid) to postgres;

comment on function public.bootstrap_first_platform_admin(uuid) is
  'One-time initial platform admin bootstrap; callable only from the postgres SQL role.';
