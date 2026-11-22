do $$
begin
 if to_regclass('public.company_financial_entries') is null
    and to_regclass('public.financial_entries') is not null
    and exists(select 1 from information_schema.columns where table_schema='public' and table_name='financial_entries' and column_name='company_id') then
   alter table public.financial_entries rename to company_financial_entries;
   alter table public.company_financial_entries rename constraint financial_entries_id_company_unique to company_financial_entries_id_company_unique;
   alter table public.company_financial_entries rename constraint financial_entries_branch_company_fk to company_financial_entries_branch_company_fk;
   alter policy "members can manage financial entries" on public.company_financial_entries rename to "members can manage company financial entries";
 end if;
end $$;
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
