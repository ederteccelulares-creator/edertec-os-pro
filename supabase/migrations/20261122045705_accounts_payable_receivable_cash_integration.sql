create table if not exists public.company_financial_entries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 branch_id uuid, entry_type text not null check(entry_type in ('payable','receivable')), category text not null,
 description text not null, counterparty text, amount numeric(12,2) not null check(amount>0), due_date date not null,
 status text not null default 'open' check(status in ('open','paid','cancelled')),
 payment_method text check(payment_method is null or payment_method in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other')),
 paid_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint company_financial_entries_id_company_unique unique(id,company_id),
 constraint company_financial_entries_branch_company_fk foreign key(branch_id,company_id) references public.branches(id,company_id)
);
alter table public.company_financial_entries enable row level security;
drop policy if exists "members can manage company financial entries" on public.company_financial_entries;
create policy "members can manage company financial entries" on public.company_financial_entries for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
grant select,insert,update,delete on public.company_financial_entries to authenticated;
alter table public.cash_transactions add column if not exists financial_entry_id uuid;
create unique index if not exists cash_transactions_financial_entry_unique on public.cash_transactions(financial_entry_id) where financial_entry_id is not null;
do $$ begin if not exists(select 1 from pg_constraint where conname='cash_transactions_financial_entry_company_fk') then alter table public.cash_transactions add constraint cash_transactions_financial_entry_company_fk foreign key(financial_entry_id,company_id) references public.company_financial_entries(id,company_id); end if; end $$;
create or replace function public.settle_financial_entry(p_company_id uuid,p_entry_id uuid,p_method text)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_entry public.company_financial_entries%rowtype; v_tx uuid;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado.'; end if;
 if p_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.'; end if;
 select * into v_entry from public.company_financial_entries where id=p_entry_id and company_id=p_company_id for update;
 if not found then raise exception 'Lançamento não encontrado.'; end if;
 if v_entry.status <> 'open' then raise exception 'Somente lançamentos em aberto podem ser baixados.'; end if;
 update public.company_financial_entries set status='paid',payment_method=p_method,paid_at=now(),updated_at=now() where id=p_entry_id and company_id=p_company_id;
 insert into public.cash_transactions(company_id,branch_id,financial_entry_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_entry.branch_id,p_entry_id,case when v_entry.entry_type='receivable' then 'in' else 'out' end,v_entry.category,v_entry.description,v_entry.amount,p_method,now()) returning id into v_tx;
 return v_tx;
end $$;
revoke all on function public.settle_financial_entry(uuid,uuid,text) from public,anon;
grant execute on function public.settle_financial_entry(uuid,uuid,text) to authenticated;