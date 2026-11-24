alter table public.cash_transactions add column if not exists pos_sale_key uuid;
create unique index if not exists cash_transactions_company_pos_sale_key_uidx
 on public.cash_transactions(company_id,pos_sale_key) where pos_sale_key is not null;

create or replace function public.finalize_company_pos_sale(
 p_company_id uuid,p_branch_id uuid,p_items jsonb,p_amount numeric,p_payment_method text,
 p_financial_account_id uuid default null,p_idempotency_key uuid default null,p_description text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_session_id uuid;v_account public.company_financial_accounts%rowtype;v_item record;v_stock numeric;v_tx uuid;v_existing uuid;v_lines integer;v_distinct integer;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager','attendant']) then raise exception 'Acesso não autorizado para finalizar venda.';end if;
 if p_idempotency_key is null then raise exception 'Chave de segurança da venda ausente.';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Carrinho vazio ou com quantidade inválida de itens.';end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999 then raise exception 'Valor total inválido.';end if;
 if p_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.';end if;
 if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id and is_active) then raise exception 'Filial inválida ou inativa.';end if;
 if p_financial_account_id is not null then
  select * into v_account from public.company_financial_accounts where id=p_financial_account_id and company_id=p_company_id and is_active;
  if not found then raise exception 'Conta financeira não encontrada ou inativa.';end if;
  if v_account.branch_id is not null and v_account.branch_id is distinct from p_branch_id then raise exception 'A conta selecionada pertence a outra filial.';end if;
  if p_branch_id is null and v_account.branch_id is not null then raise exception 'Selecione a filial vinculada à conta.';end if;
 end if;
 select count(*),count(distinct x.product_id) into v_lines,v_distinct from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric);
 if v_lines=0 or v_lines<>v_distinct then raise exception 'Itens inválidos ou produtos repetidos no carrinho.';end if;
 select id into v_session_id from public.cash_sessions where company_id=p_company_id and status='open' and branch_id is not distinct from p_branch_id order by opened_at desc limit 1 for update;
 if v_session_id is null then raise exception 'Abra o caixa desta filial antes de finalizar a venda.';end if;
 begin
  select id into v_existing from public.cash_transactions where company_id=p_company_id and pos_sale_key=p_idempotency_key;
  if v_existing is not null then return v_existing;end if;
  for v_item in select x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric) order by x.product_id loop
   if v_item.product_id is null or v_item.quantity is null or v_item.quantity<=0 or v_item.quantity>999999 then raise exception 'Produto ou quantidade inválida.';end if;
   select stock_quantity into v_stock from public.products where id=v_item.product_id and company_id=p_company_id and is_active for update;
   if not found then raise exception 'Produto não encontrado ou inativo.';end if;
   if v_stock<v_item.quantity then raise exception 'Estoque insuficiente para um ou mais produtos.';end if;
  end loop;
  for v_item in select x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric) order by x.product_id loop
   insert into public.stock_movements(company_id,branch_id,product_id,movement_type,quantity,unit_cost,reason)
   select p_company_id,p_branch_id,p.id,'out',v_item.quantity,p.cost_price,'Venda PDV · '||coalesce(nullif(trim(p_description),''),'Venda registrada no PDV') from public.products p where p.id=v_item.product_id and p.company_id=p_company_id;
   update public.products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now() where id=v_item.product_id and company_id=p_company_id;
  end loop;
  insert into public.cash_transactions(company_id,branch_id,cash_session_id,financial_account_id,pos_sale_key,direction,category,description,amount,payment_method,occurred_at)
  values(p_company_id,p_branch_id,v_session_id,p_financial_account_id,p_idempotency_key,'in','Venda PDV',coalesce(nullif(trim(p_description),''),'Venda PDV'),p_amount,p_payment_method,now()) returning id into v_tx;
  return v_tx;
 exception when unique_violation then
  select id into v_existing from public.cash_transactions where company_id=p_company_id and pos_sale_key=p_idempotency_key;
  if v_existing is not null then return v_existing;end if;raise;
 end;
end;
$$;
revoke all on function public.finalize_company_pos_sale(uuid,uuid,jsonb,numeric,text,uuid,uuid,text) from public,anon;
grant execute on function public.finalize_company_pos_sale(uuid,uuid,jsonb,numeric,text,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';