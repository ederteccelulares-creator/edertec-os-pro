create or replace function public.record_company_service_order_payment(p_company_id uuid,p_service_order_id uuid,p_amount numeric,p_method text,p_notes text default null,p_financial_account_id uuid default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_order public.service_orders%rowtype;v_payment_id uuid;v_account public.company_financial_accounts%rowtype;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado à empresa.';end if;
 if p_amount is null or p_amount<=0 then raise exception 'Informe um valor de pagamento válido.';end if;
 if p_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.';end if;
 select * into v_order from public.service_orders where id=p_service_order_id and company_id=p_company_id for update;
 if not found then raise exception 'Ordem de serviço não encontrada.';end if;
 if v_order.status='cancelled' then raise exception 'Não é possível receber pagamento de uma OS cancelada.';end if;
 if p_financial_account_id is not null then
  select * into v_account from public.company_financial_accounts where id=p_financial_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.';end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from v_order.branch_id then raise exception 'A conta selecionada pertence a outra filial.';end if;
 end if;
 insert into public.payments(company_id,branch_id,service_order_id,customer_id,amount,method,status,paid_at,notes)
 values(p_company_id,v_order.branch_id,v_order.id,v_order.customer_id,p_amount,p_method,'paid',now(),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_payment_id;
 insert into public.cash_transactions(company_id,branch_id,payment_id,financial_account_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_order.branch_id,v_payment_id,p_financial_account_id,'in','Pagamento de OS','Pagamento da OS #'||v_order.order_number,p_amount,p_method,now());
 return v_payment_id;
end $$;
revoke all on function public.record_company_service_order_payment(uuid,uuid,numeric,text,text,uuid) from public,anon;
grant execute on function public.record_company_service_order_payment(uuid,uuid,numeric,text,text,uuid) to authenticated;
drop function if exists public.record_company_service_order_payment(uuid,uuid,numeric,text,text);

create or replace function public.settle_financial_entry(p_company_id uuid,p_entry_id uuid,p_method text,p_financial_account_id uuid default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_entry public.company_financial_entries%rowtype;v_tx uuid;v_account public.company_financial_accounts%rowtype;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado.';end if;
 if p_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.';end if;
 select * into v_entry from public.company_financial_entries where id=p_entry_id and company_id=p_company_id for update;
 if not found then raise exception 'Lançamento não encontrado.';end if;
 if v_entry.status<>'open' then raise exception 'Somente lançamentos em aberto podem ser baixados.';end if;
 if p_financial_account_id is not null then
  select * into v_account from public.company_financial_accounts where id=p_financial_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.';end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from v_entry.branch_id then raise exception 'A conta selecionada pertence a outra filial.';end if;
 end if;
 update public.company_financial_entries set status='paid',payment_method=p_method,paid_at=now(),updated_at=now() where id=p_entry_id and company_id=p_company_id;
 insert into public.cash_transactions(company_id,branch_id,financial_entry_id,financial_account_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_entry.branch_id,p_entry_id,p_financial_account_id,case when v_entry.entry_type='receivable' then 'in' else 'out' end,v_entry.category,v_entry.description,v_entry.amount,p_method,now()) returning id into v_tx;
 return v_tx;
end $$;
revoke all on function public.settle_financial_entry(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.settle_financial_entry(uuid,uuid,text,uuid) to authenticated;
drop function if exists public.settle_financial_entry(uuid,uuid,text);
notify pgrst,'reload schema';