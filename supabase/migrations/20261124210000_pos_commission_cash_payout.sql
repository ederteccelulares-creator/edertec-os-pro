-- Record commission payment and cash outflow atomically.
alter table public.company_pos_commission_settlements
 add column if not exists cash_transaction_id uuid;

do $$
begin
 if not exists(select 1 from pg_constraint where conname='company_pos_commission_settlements_cash_transaction_fk') then
  alter table public.company_pos_commission_settlements
   add constraint company_pos_commission_settlements_cash_transaction_fk
   foreign key(cash_transaction_id,company_id)
   references public.cash_transactions(id,company_id);
 end if;
end $$;

create unique index if not exists company_pos_commission_settlements_cash_transaction_uidx
 on public.company_pos_commission_settlements(cash_transaction_id)
 where cash_transaction_id is not null;

drop function if exists public.pay_company_pos_commission_settlement(uuid,uuid,text,text);

create or replace function public.pay_company_pos_commission_settlement(
 p_company_id uuid,
 p_settlement_id uuid,
 p_payment_method text,
 p_payment_reference text,
 p_financial_account_id uuid
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_row public.company_pos_commission_settlements%rowtype;
 v_employee_name text;
 v_account public.company_financial_accounts%rowtype;
 v_session_id uuid;
 v_transaction_id uuid;
 v_description text;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then
  raise exception 'Somente a administração pode confirmar o pagamento.';
 end if;
 if p_payment_method is null or p_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then
  raise exception 'Informe uma forma de pagamento válida.';
 end if;

 select * into v_row
 from public.company_pos_commission_settlements
 where id=p_settlement_id and company_id=p_company_id
 for update;
 if not found then raise exception 'Fechamento de comissão não encontrado.'; end if;

 if v_row.status='paid' then
  if v_row.cash_transaction_id is not null then return v_row.id; end if;
  raise exception 'Este fechamento já foi marcado como pago sem lançamento de caixa. Faça a conferência manual antes de qualquer novo lançamento.';
 end if;

 if p_financial_account_id is not null then
  select * into v_account
  from public.company_financial_accounts
  where id=p_financial_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.'; end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from v_row.branch_id then
   raise exception 'A conta selecionada pertence a outra filial.';
  end if;
  if v_row.branch_id is null and v_account.branch_id is not null then
   raise exception 'Não é possível usar uma conta vinculada a filial neste fechamento da Matriz / sem filial.';
  end if;
 end if;

 select e.name into v_employee_name
 from public.employees e
 where e.id=v_row.employee_id and e.company_id=p_company_id;
 if not found then raise exception 'Funcionário vinculado ao fechamento não foi encontrado.'; end if;

 select cs.id into v_session_id
 from public.cash_sessions cs
 where cs.company_id=p_company_id and cs.status='open'
  and cs.branch_id is not distinct from v_row.branch_id
 order by cs.opened_at desc
 limit 1
 for update;

 v_description:='Pagamento de comissão · '||v_employee_name||' · período '||
  to_char(v_row.period_start,'DD/MM/YYYY')||' a '||to_char(v_row.period_end,'DD/MM/YYYY');

 insert into public.cash_transactions(
  company_id,branch_id,cash_session_id,financial_account_id,direction,
  category,description,amount,payment_method,occurred_at
 ) values(
  p_company_id,v_row.branch_id,v_session_id,p_financial_account_id,'out',
  'Comissões de funcionários',v_description,v_row.total_amount,p_payment_method,now()
 ) returning id into v_transaction_id;

 update public.company_pos_commission_settlements
 set status='paid',paid_at=now(),paid_by=auth.uid(),
  payment_method=p_payment_method,
  payment_reference=nullif(trim(coalesce(p_payment_reference,'')),''),
  cash_transaction_id=v_transaction_id
 where id=p_settlement_id and company_id=p_company_id;

 return p_settlement_id;
end;
$$;

revoke all on function public.pay_company_pos_commission_settlement(uuid,uuid,text,text,uuid) from public,anon;
grant execute on function public.pay_company_pos_commission_settlement(uuid,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
