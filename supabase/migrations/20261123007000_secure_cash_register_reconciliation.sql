-- Secure cash register opening and closing, and reconcile only physical cash.
create or replace function public.open_company_cash_session(
 p_company_id uuid,
 p_branch_id uuid,
 p_opening_amount numeric,
 p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.cash_sessions;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin','manager']::text[]) then
  raise exception 'Acesso não autorizado para abrir o caixa.';
 end if;
 if p_opening_amount is null or p_opening_amount < 0 then
  raise exception 'Informe um valor inicial válido.';
 end if;
 if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then
  raise exception 'Filial inválida.';
 end if;
 insert into public.cash_sessions(company_id,branch_id,opened_by,opening_amount,status,notes)
 values(p_company_id,p_branch_id,auth.uid(),p_opening_amount,'open',nullif(trim(coalesce(p_notes,'')),'')) returning * into v_row;
 return v_row;
exception when unique_violation then
 raise exception 'Já existe um caixa aberto nesta filial. Feche o caixa atual antes de abrir outro.';
end;
$$;

create or replace function public.close_company_cash_session(
 p_company_id uuid,
 p_session_id uuid,
 p_closing_amount numeric,
 p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.cash_sessions; v_expected numeric(14,2);
begin
 if auth.uid() is null or not public.has_company_role(p_company_id, array['owner','admin','manager']::text[]) then
  raise exception 'Acesso não autorizado para fechar o caixa.';
 end if;
 if p_closing_amount is null or p_closing_amount < 0 then
  raise exception 'Informe o valor contado no fechamento.';
 end if;
 select * into v_row from public.cash_sessions
 where id=p_session_id and company_id=p_company_id and status='open' for update;
 if not found then raise exception 'Caixa aberto não encontrado.'; end if;

 select round(v_row.opening_amount + coalesce(sum(case when direction='in' then amount else -amount end),0),2)
 into v_expected
 from public.cash_transactions
 where company_id=p_company_id and cash_session_id=p_session_id
 and lower(coalesce(payment_method,'')) in ('cash','dinheiro');

 update public.cash_sessions
 set status='closed',closed_by=auth.uid(),closed_at=now(),
     closing_amount=p_closing_amount,expected_amount=v_expected,
     difference_amount=round(p_closing_amount-v_expected,2),
     notes=concat_ws(E'\\n',nullif(notes,''),nullif(trim(coalesce(p_notes,'')),''))
 where id=p_session_id returning * into v_row;
 return v_row;
end;
$$;

drop policy if exists "finance roles manage cash transactions" on public.cash_transactions;
create policy "finance roles manage cash transactions"
on public.cash_transactions for all to authenticated
using (public.has_company_role(company_id, array['owner','admin','manager']::text[]))
with check (
 public.has_company_role(company_id, array['owner','admin','manager']::text[])
 and (cash_session_id is null or exists (
  select 1 from public.cash_sessions cs
  where cs.id=cash_session_id and cs.company_id=cash_transactions.company_id and cs.status='open'
 ))
 and (payment_id is null or exists (
  select 1 from public.payments p where p.id=payment_id and p.company_id=cash_transactions.company_id
 ))
);

drop policy if exists "pos staff create cash transactions" on public.cash_transactions;
create policy "pos staff create cash transactions"
on public.cash_transactions for insert to authenticated
with check (
 public.has_company_role(company_id, array['owner','admin','manager','attendant']::text[])
 and (cash_session_id is null or exists (
  select 1 from public.cash_sessions cs
  where cs.id=cash_session_id and cs.company_id=cash_transactions.company_id and cs.status='open'
 ))
 and (payment_id is null or exists (
  select 1 from public.payments p where p.id=payment_id and p.company_id=cash_transactions.company_id
 ))
);

revoke all on function public.open_company_cash_session(uuid,uuid,numeric,text) from public, anon;
revoke all on function public.close_company_cash_session(uuid,uuid,numeric,text) from public, anon;
grant execute on function public.open_company_cash_session(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.close_company_cash_session(uuid,uuid,numeric,text) to authenticated;
