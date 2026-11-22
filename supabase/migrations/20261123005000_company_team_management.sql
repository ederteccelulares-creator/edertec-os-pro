-- Employee and account management is restricted to owner/admin through the company-team Edge Function.
-- Ensure membership activation state exists and indexes support the team panel.
alter table public.company_members add column if not exists is_active boolean not null default true;
create index if not exists company_members_company_role_active_idx on public.company_members(company_id,role,is_active);
create index if not exists employees_company_user_idx on public.employees(company_id,user_id);
