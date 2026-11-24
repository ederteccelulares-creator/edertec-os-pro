alter table public.company_financial_accounts add constraint company_financial_accounts_id_company_unique unique(id,company_id);
alter table public.cash_transactions add column credit_card_invoice_id uuid, add column financial_account_id uuid;
alter table public.cash_transactions add constraint cash_transactions_card_invoice_company_fk foreign key(credit_card_invoice_id,company_id) references public.company_credit_card_invoices(id,company_id), add constraint cash_transactions_financial_account_company_fk foreign key(financial_account_id,company_id) references public.company_financial_accounts(id,company_id);
create unique index cash_transactions_one_card_invoice_uidx on public.cash_transactions(credit_card_invoice_id) where credit_card_invoice_id is not null;
create index cash_transactions_financial_account_idx on public.cash_transactions(company_id,financial_account_id,occurred_at desc) where financial_account_id is not null;
create or replace function public.pay_company_credit_card_invoice(p_company_id uuid,p_invoice_id uuid,p_payment_method text,p_financial_account_id uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_invoice public.company_credit_card_invoices%rowtype;v_card public.company_credit_cards%rowtype;v_amount numeric(12,2);v_branch_id uuid;v_session_id uuid;v_tx uuid;v_account public.company_financial_accounts%rowtype;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Acesso negado para quitar esta fatura.';end if;
 if p_payment_method not in ('pix','cash','debit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida para quitação de fatura.';end if;
 select * into v_invoice from public.company_credit_card_invoices where id=p_invoice_id and company_id=p_company_id for update;
 if not found then raise exception 'Fatura não encontrada.';end if;
 if v_invoice.status<>'open' then raise exception 'Somente faturas em aberto podem ser pagas.';end if;
 if exists(select 1 from public.cash_transactions where credit_card_invoice_id=p_invoice_id and company_id=p_company_id) then raise exception 'Esta fatura já possui um lançamento de pagamento.';end if;
 select * into v_card from public.company_credit_cards where id=v_invoice.card_id and company_id=p_company_id;
 if not found then raise exception 'Cartão da fatura não encontrado.';end if;
 select coalesce(sum(i.amount),0)::numeric(12,2) into v_amount from public.company_credit_card_installments i where i.invoice_id=p_invoice_id and i.company_id=p_company_id;
 if v_amount<=0 then raise exception 'A fatura não possui parcelas para pagamento.';end if;
 select case when count(distinct p.branch_id)=1 then min(p.branch_id::text)::uuid else null end into v_branch_id from public.company_credit_card_installments i join public.company_credit_card_purchases p on p.id=i.purchase_id and p.company_id=i.company_id where i.invoice_id=p_invoice_id and i.company_id=p_company_id;
 if p_financial_account_id is not null then
  select * into v_account from public.company_financial_accounts where id=p_financial_account_id and company_id=p_company_id and is_active for update;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.';end if;
  if v_account.branch_id is not null and v_branch_id is not null and v_account.branch_id<>v_branch_id then raise exception 'A conta selecionada pertence a outra filial da fatura.';end if;
 elsif p_payment_method='bank_transfer' then raise exception 'Selecione a conta bancária usada no pagamento.';
 end if;
 if p_payment_method='cash' then select id into v_session_id from public.cash_sessions where company_id=p_company_id and status='open' and (branch_id is not distinct from v_branch_id) order by opened_at desc limit 1;end if;
 insert into public.cash_transactions(company_id,branch_id,cash_session_id,credit_card_invoice_id,financial_account_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_branch_id,v_session_id,p_invoice_id,p_financial_account_id,'out','Fatura de cartão','Pagamento da fatura '||to_char(v_invoice.billing_month,'MM/YYYY')||' · '||v_card.card_name,v_amount,p_payment_method,now()) returning id into v_tx;
 update public.company_credit_card_invoices set status='paid',paid_at=now(),payment_method=p_payment_method where id=p_invoice_id and company_id=p_company_id;
 return v_tx;
end $function$;
revoke all on function public.pay_company_credit_card_invoice(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.pay_company_credit_card_invoice(uuid,uuid,text,uuid) to authenticated;