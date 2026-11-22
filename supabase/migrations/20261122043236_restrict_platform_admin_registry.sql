-- The platform administrator registry is intentionally inaccessible through
-- ordinary client roles. Access is mediated by narrowly scoped server-side
-- operations and policies on platform-managed resources.
alter table public.platform_admins enable row level security;
revoke all on table public.platform_admins from anon,authenticated;
