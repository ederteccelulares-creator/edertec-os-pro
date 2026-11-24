-- Financial accounts must exist before account transfers and card settlement migrations.
create table if not exists public.company_financial_accounts (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 branch_id uuid,
 account_name text not null check (char_length(trim(account_name)) between 2 and 80),
 bank_name text not null check (char_length(trim(bank_name)) between 2 and 80),
 account_type text not null default 'checking' check (account_type in ('checking','savings','digital_wallet','cash','other')),
 agency text,
 account_last4 text check (account_last4 is null or account_last4 ~ '^[0-9]{4}$'),
 opening_balance numeric(12,2) not null default 0,
 notes text,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint company_financial_accounts_branch_company_fk foreign key(branch_id,company_id) references public.branches(id,company_id)
);
create index if not exists company_financial_accounts_company_idx on public.company_financial_accounts(company_id,is_active,created_at desc);
alter table public.company_financial_accounts enable row level security;
do $$
begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='company_financial_accounts' and policyname='Company members can read financial accounts') then
  create policy "Company members can read financial accounts" on public.company_financial_accounts for select to authenticated using (public.is_company_member(company_id));
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='company_financial_accounts' and policyname='Company finance managers can manage financial accounts') then
  create policy "Company finance managers can manage financial accounts" on public.company_financial_accounts for all to authenticated using (public.has_company_role(company_id,array['owner','admin','manager'])) with check (public.has_company_role(company_id,array['owner','admin','manager']));
 end if;
end $$;
