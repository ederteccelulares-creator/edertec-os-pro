-- Edertec OS Pro - prevent direct privilege escalation through membership writes
-- Apply after migrations 0001 through 0010.
--
-- Membership changes must go through the audited SECURITY DEFINER RPCs
-- (set_organization_member_role / set_organization_member_active) or the
-- trusted invitation trigger. Direct table writes allowed admins to bypass
-- the role checks in those functions.

drop policy if exists "Admins manage memberships" on public.organization_members;

revoke insert, update, delete on table public.organization_members from anon, authenticated;
grant select on table public.organization_members to authenticated;

-- Explicitly keep the audited management API available to signed-in users.
revoke all on function public.set_organization_member_role(uuid,uuid,public.member_role) from public, anon;
revoke all on function public.set_organization_member_active(uuid,uuid,boolean) from public, anon;
grant execute on function public.set_organization_member_role(uuid,uuid,public.member_role) to authenticated;
grant execute on function public.set_organization_member_active(uuid,uuid,boolean) to authenticated;

-- The invitation trigger is internal-only; no client role may invoke it.
revoke all on function public.accept_pending_team_invitation() from public, anon, authenticated;
