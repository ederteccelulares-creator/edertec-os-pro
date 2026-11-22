create unique index if not exists cash_transactions_payment_id_unique on public.cash_transactions(payment_id) where payment_id is not null;
create or replace function public.record_company_service_order_payment(p_company_id uuid,p_service_order_id uuid,p_amount numeric,p_method text,p_notes text default null)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_order public.service_orders%rowtype; v_payment_id uuid;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado à empresa.'; end if;
 if p_amount is null or p_amount<=0 then raise exception 'Informe um valor de pagamento válido.'; end if;
 if p_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.'; end if;
 select * into v_order from public.service_orders where id=p_service_order_id and company_id=p_company_id for update;
 if not found then raise exception 'Ordem de serviço não encontrada.'; end if;
 if v_order.status='cancelled' then raise exception 'Não é possível receber pagamento de uma OS cancelada.'; end if;
 insert into public.payments(company_id,branch_id,service_order_id,customer_id,amount,method,status,paid_at,notes)
 values(p_company_id,v_order.branch_id,v_order.id,v_order.customer_id,p_amount,p_method,'paid',now(),nullif(trim(coalesce(p_notes,'')),''))
 returning id into v_payment_id;
 insert into public.cash_transactions(company_id,branch_id,payment_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_order.branch_id,v_payment_id,'in','Pagamento de OS','Pagamento da OS #'||v_order.order_number,p_amount,p_method,now());
 return v_payment_id;
end $$;
revoke all on function public.record_company_service_order_payment(uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.record_company_service_order_payment(uuid,uuid,numeric,text,text) to authenticated;