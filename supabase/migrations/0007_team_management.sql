-- Edertec OS Pro - team directory and safe role/access administration
-- Apply after migrations 0001 through 0006.

create or replace function public.list_organization_team(p_organization_id uuid)
returns table (
  member_id uuid,
  user_id uuid,
  full_name text,
  phone text,
  member_role public.member_role,
  is_active boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if not public.has_org_role(p_organization_id,array['owner','admin','manager']::public.member_role[]) then
    raise exception 'You do not have permission to view team members';
  end if;
  return query
    select m.id,m.user_id,coalesce(p.full_name,''),p.phone,m.role,m.active,m.created_at
    from public.organization_members m
    left join public.profiles p on p.id=m.user_id
    where m.organization_id=p_organization_id
    order by case when m.role='owner' then 0 when m.role='admin' then 1 else 2 end,
      p.full_name,m.created_at;
end;
$$;

create or replace function public.set_organization_member_role(
  p_organization_id uuid,
  p_member_id uuid,
  p_new_role public.member_role
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  actor_role public.member_role;
  target_row public.organization_members;
  owner_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into actor_role from public.organization_members
    where organization_id=p_organization_id and user_id=auth.uid() and active;
  if actor_role is null or actor_role not in ('owner','admin') then
    raise exception 'Only owners and admins can change team roles';
  end if;

  select * into target_row from public.organization_members
    where id=p_member_id and organization_id=p_organization_id
    for update;
  if not found then raise exception 'Team member not found'; end if;
  if actor_role='admin' and (target_row.role in ('owner','admin') or p_new_role in ('owner','admin')) then
    raise exception 'Admins can only manage non-admin roles';
  end if;
  if target_row.role='owner' and p_new_role<>'owner' then
    select count(*) into owner_count from public.organization_members
      where organization_id=p_organization_id and role='owner' and active;
    if owner_count<=1 then raise exception 'The organization must keep at least one active owner'; end if;
  end if;
  if target_row.user_id=auth.uid() and actor_role='owner' and p_new_role<>'owner' then
    select count(*) into owner_count from public.organization_members
      where organization_id=p_organization_id and role='owner' and active;
    if owner_count<=1 then raise exception 'You cannot remove the last owner role from your own account'; end if;
  end if;

  update public.organization_members set role=p_new_role
    where id=p_member_id and organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'team.role_changed','organization_member',p_member_id::text,
    jsonb_build_object('user_id',target_row.user_id,'previous_role',target_row.role,'new_role',p_new_role));
end;
$$;

create or replace function public.set_organization_member_active(
  p_organization_id uuid,
  p_member_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  actor_role public.member_role;
  target_row public.organization_members;
  owner_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into actor_role from public.organization_members
    where organization_id=p_organization_id and user_id=auth.uid() and active;
  if actor_role is null or actor_role not in ('owner','admin') then
    raise exception 'Only owners and admins can change team access';
  end if;
  select * into target_row from public.organization_members
    where id=p_member_id and organization_id=p_organization_id
    for update;
  if not found then raise exception 'Team member not found'; end if;
  if target_row.user_id=auth.uid() then raise exception 'You cannot deactivate your own account'; end if;
  if actor_role='admin' and target_row.role in ('owner','admin') then
    raise exception 'Admins cannot deactivate owners or other admins';
  end if;
  if target_row.role='owner' and not p_active then
    select count(*) into owner_count from public.organization_members
      where organization_id=p_organization_id and role='owner' and active;
    if owner_count<=1 then raise exception 'The organization must keep at least one active owner'; end if;
  end if;
  update public.organization_members set active=p_active
    where id=p_member_id and organization_id=p_organization_id;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),case when p_active then 'team.access_activated' else 'team.access_deactivated' end,
    'organization_member',p_member_id::text,jsonb_build_object('user_id',target_row.user_id,'role',target_row.role));
end;
$$;

revoke all on function public.list_organization_team(uuid) from public;
revoke all on function public.set_organization_member_role(uuid,uuid,public.member_role) from public;
revoke all on function public.set_organization_member_active(uuid,uuid,boolean) from public;
grant execute on function public.list_organization_team(uuid) to authenticated;
grant execute on function public.set_organization_member_role(uuid,uuid,public.member_role) to authenticated;
grant execute on function public.set_organization_member_active(uuid,uuid,boolean) to authenticated;
