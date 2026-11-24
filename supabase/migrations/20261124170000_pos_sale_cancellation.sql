-- Authorized cancellation of PDV sales. Never deletes financial or inventory history.
alter table public.company_pos_sales
 add column if not exists reversal_transaction_id uuid,
 add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
 add column if not exists cancellation_reason text,
 add column if not exists cancel_idempotency_key uuid;
alter table public.cash_transactions add column if not exists pos_sale_reversal_key uuid;
do $$
begin
 if not exists(select 1 from pg_constraint where conname='company_pos_sales_reversal_tx_company_fkey') then
  alter table public.company_pos_sales add constraint company_pos_sales_reversal_tx_company_fkey foreign key(reversal_transaction_id,company_id) references public.cash_transactions(id,company_id);
 end if;
end $$;
create unique index if not exists cash_transactions_pos_sale_reversal_uidx on public.cash_transactions(company_id,pos_sale_reversal_key) where pos_sale_reversal_key is not null;
create unique index if not exists company_pos_sales_cancel_idempotency_uidx on public.company_pos_sales(company_id,cancel_idempotency_key) where cancel_idempotency_key is not null;
create or replace function public.cancel_company_pos_sale(p_company_id uuid,p_sale_id uuid,p_reason text,p_idempotency_key uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_sale public.company_pos_sales%rowtype;v_session public.cash_sessions%rowtype;v_item record;v_reversal uuid;v_reason text;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Somente proprietário, administrador ou gerente pode cancelar vendas.';end if;
 v_reason:=nullif(trim(coalesce(p_reason,'')),'');
 if v_reason is null or length(v_reason)<5 or length(v_reason)>500 then raise exception 'Informe o motivo do cancelamento (de 5 a 500 caracteres).';end if;
 if p_idempotency_key is null then raise exception 'Chave de segurança do cancelamento ausente.';end if;
 select * into v_sale from public.company_pos_sales where id=p_sale_id and company_id=p_company_id for update;
 if not found then raise exception 'Venda não encontrada nesta empresa.';end if;
 if v_sale.status='cancelled' then
  if v_sale.cancel_idempotency_key=p_idempotency_key then return v_sale.reversal_transaction_id;end if;
  raise exception 'Esta venda já foi cancelada.';
 end if;
 if v_sale.status<>'completed' then raise exception 'Somente vendas concluídas podem ser canceladas.';end if;
 select * into v_session from public.cash_sessions where id=v_sale.cash_session_id and company_id=p_company_id for update;
 if not found or v_session.status<>'open' then raise exception 'O caixa original já foi fechado. Para proteger o fechamento, esta venda não pode ser cancelada por aqui. Faça um ajuste financeiro autorizado.';end if;
 if v_sale.cash_transaction_id is null then raise exception 'Venda sem lançamento financeiro original. Solicite conferência administrativa.';end if;
 for v_item in select product_id,quantity,unit_cost from public.company_pos_sale_items where sale_id=p_sale_id and company_id=p_company_id order by product_id loop
  perform 1 from public.products where id=v_item.product_id and company_id=p_company_id for update;
  if not found then raise exception 'Um produto desta venda não existe mais. Cancelamento interrompido.';end if;
  update public.products set stock_quantity=stock_quantity+v_item.quantity,updated_at=now() where id=v_item.product_id and company_id=p_company_id;
  insert into public.stock_movements(company_id,branch_id,product_id,movement_type,quantity,unit_cost,reason)
  values(p_company_id,v_sale.branch_id,v_item.product_id,'in',v_item.quantity,v_item.unit_cost,'Estorno da venda PDV #'||v_sale.sale_number||' · '||v_reason);
 end loop;
 insert into public.cash_transactions(company_id,branch_id,cash_session_id,financial_account_id,pos_sale_reversal_key,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_sale.branch_id,v_sale.cash_session_id,v_sale.financial_account_id,p_idempotency_key,'out','Estorno venda PDV','Cancelamento da venda #'||v_sale.sale_number||' · '||v_reason,v_sale.total,v_sale.payment_method,now())
 returning id into v_reversal;
 update public.company_pos_sales set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=v_reason,cancel_idempotency_key=p_idempotency_key,reversal_transaction_id=v_reversal
 where id=p_sale_id and company_id=p_company_id;
 return v_reversal;
end;
$$;
revoke all on function public.cancel_company_pos_sale(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.cancel_company_pos_sale(uuid,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';