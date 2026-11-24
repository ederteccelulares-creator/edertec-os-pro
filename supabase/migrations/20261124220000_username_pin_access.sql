-- Username + PIN access for company employees. Existing auth accounts remain intact.
alter table public.companies add column if not exists login_code text;
alter table public.employees add column if not exists username text;
alter table public.employees add column if not exists pin_hash text;

update public.companies
set login_code = upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))
where login_code is null;

alter table public.companies
  alter column login_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
alter table public.companies alter column login_code set not null;

create unique index if not exists companies_login_code_uidx on public.companies(login_code);
create unique index if not exists employees_company_username_uidx
  on public.employees(company_id, lower(username)) where username is not null;

create table if not exists public.employee_login_attempts (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  username text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists employee_login_attempts_lookup_idx
  on public.employee_login_attempts(company_id,lower(username),attempted_at desc);
alter table public.employee_login_attempts enable row level security;
revoke all on public.employee_login_attempts from anon, authenticated, public;
grant select,insert,delete on public.employee_login_attempts to service_role;

-- Backfill staff profiles for existing memberships without replacing auth accounts.
insert into public.employees(company_id,user_id,name,email,username,is_active)
select m.company_id,m.user_id,
       coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(split_part(coalesce(u.email,''),'@',1),''),'Usuário'),
       u.email,
       left(coalesce(nullif(regexp_replace(lower(split_part(coalesce(u.email,''),'@',1)),'[^a-z0-9._-]','','g'),''),'usuario') || left(replace(m.user_id::text,'-',''),4),30),
       m.is_active
from public.company_members m
join auth.users u on u.id=m.user_id
where not exists(select 1 from public.employees e where e.company_id=m.company_id and e.user_id=m.user_id);

grant select,insert,update,delete on table public.company_members to service_role;
grant select,insert,update,delete on table public.employees to service_role;
