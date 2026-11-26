alter table public.company_financial_entries
  add column if not exists financial_account_id uuid
  references public.company_financial_accounts(id) on delete restrict;

create or replace function public.settle_financial_entry(
  p_company_id uuid,
  p_entry_id uuid,
  p_method text,
  p_financial_account_id uuid default null
)
returns uuid
language plpgsql
set search_path=''
as $function$
declare
  v_entry public.company_financial_entries%rowtype;
  v_tx uuid;
  v_account public.company_financial_accounts%rowtype;
  v_account_id uuid;
begin
  if auth.uid() is null or not public.is_company_member(p_company_id) then
    raise exception 'Acesso não autorizado.';
  end if;
  if p_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  select * into v_entry from public.company_financial_entries
    where id=p_entry_id and company_id=p_company_id for update;
  if not found then raise exception 'Lançamento não encontrado.'; end if;
  if v_entry.status<>'open' then raise exception 'Somente lançamentos em aberto podem ser baixados.'; end if;
  v_account_id:=coalesce(p_financial_account_id,v_entry.financial_account_id);
  if v_account_id is null then raise exception 'Selecione uma conta financeira para concluir a baixa.'; end if;
  select * into v_account from public.company_financial_accounts
    where id=v_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.'; end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from v_entry.branch_id then
    raise exception 'A conta selecionada pertence a outra filial.';
  end if;
  update public.company_financial_entries
    set status='paid',payment_method=p_method,paid_at=now(),
        financial_account_id=v_account_id,updated_at=now()
    where id=p_entry_id and company_id=p_company_id;
  insert into public.cash_transactions(
    company_id,branch_id,financial_entry_id,financial_account_id,
    direction,category,description,amount,payment_method,occurred_at
  ) values (
    p_company_id,v_entry.branch_id,p_entry_id,v_account_id,
    case when v_entry.entry_type='receivable' then 'in' else 'out' end,
    v_entry.category,v_entry.description,v_entry.amount,p_method,now()
  ) returning id into v_tx;
  return v_tx;
end
$function$;
