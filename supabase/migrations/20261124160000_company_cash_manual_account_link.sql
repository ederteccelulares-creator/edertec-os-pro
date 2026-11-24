create or replace function public.create_company_cash_transaction(p_company_id uuid,p_branch_id uuid,p_direction text,p_category text,p_description text,p_amount numeric,p_payment_method text,p_financial_account_id uuid default null)
returns uuid language plpgsql security definer set search_path to ''
as $function$
declare v_account public.company_financial_accounts%rowtype;v_session_id uuid;v_tx uuid;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager','attendant']) then raise exception 'Acesso não autorizado para registrar movimentação.';end if;
 if p_direction not in ('in','out') or p_amount is null or p_amount<=0 or p_amount>999999999 then raise exception 'Tipo ou valor da movimentação inválido.';end if;
 if p_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.';end if;
 if nullif(trim(p_category),'') is null or nullif(trim(p_description),'') is null then raise exception 'Informe categoria e descrição.';end if;
 if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Filial não pertence à empresa.';end if;
 if p_financial_account_id is not null then
  select * into v_account from public.company_financial_accounts where id=p_financial_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.';end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from p_branch_id then raise exception 'A conta selecionada pertence a outra filial.';end if;
  if p_branch_id is null and v_account.branch_id is not null then raise exception 'Selecione a filial vinculada à conta.';end if;
 end if;
 select id into v_session_id from public.cash_sessions where company_id=p_company_id and status='open' and branch_id is not distinct from p_branch_id order by opened_at desc limit 1;
 insert into public.cash_transactions(company_id,branch_id,cash_session_id,financial_account_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,p_branch_id,v_session_id,p_financial_account_id,p_direction,trim(p_category),trim(p_description),p_amount,p_payment_method,now()) returning id into v_tx;
 return v_tx;
end $function$;
revoke all on function public.create_company_cash_transaction(uuid,uuid,text,text,text,numeric,text,uuid) from public,anon;
grant execute on function public.create_company_cash_transaction(uuid,uuid,text,text,text,numeric,text,uuid) to authenticated;