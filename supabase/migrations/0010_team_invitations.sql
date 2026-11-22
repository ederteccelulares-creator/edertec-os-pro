-- Edertec OS Pro - secure organization team invitations
-- Apply after migrations 0001 through 0009.

create table if not exists public.pending_team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  constraint pending_team_invites_role_check check (role <> 'owner')
);

create unique index if not exists pending_team_invites_one_open_email
  on public.pending_team_invitations(organization_id, lower(email))
  where status='pending';

alter table public.pending_team_invitations enable row level security;
-- No client policies: only the trusted Edge Function and auth trigger can access this table.

create or replace function public.accept_pending_team_invitation()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  invitation public.pending_team_invitations%rowtype;
  invitation_id uuid;
begin
  if new.email is null then return new; end if;
  begin
    invitation_id := nullif(new.raw_user_meta_data->>'team_invitation_id','')::uuid;
  exception when invalid_text_representation then
    return new;
  end;
  if invitation_id is null then return new; end if;

  select * into invitation
  from public.pending_team_invitations
  where id=invitation_id
    and lower(email)=lower(new.email)
    and status='pending'
    and expires_at>now()
  for update;

  if not found then return new; end if;

  insert into public.organization_members(organization_id,user_id,role,active)
  values(invitation.organization_id,new.id,invitation.role,true)
  on conflict(organization_id,user_id) do update
    set role=excluded.role,active=true;

  update public.pending_team_invitations
    set status='accepted',accepted_at=now()
    where id=invitation.id;

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(invitation.organization_id,invitation.invited_by,'team.invitation_accepted',
    'organization_member',new.id::text,
    jsonb_build_object('email',lower(new.email),'role',invitation.role,'invitation_id',invitation.id));

  return new;
end;
$$;

drop trigger if exists on_auth_user_team_invitation on auth.users;
create trigger on_auth_user_team_invitation
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.accept_pending_team_invitation();

revoke all on function public.accept_pending_team_invitation() from public, anon, authenticated;
