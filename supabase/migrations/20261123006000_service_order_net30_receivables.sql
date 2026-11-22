alter table public.company_financial_entries
 add column if not exists source_service_order_id uuid,
 add column if not exists source_order_number bigint,
 add column if not exists customer_id uuid;

do $$ begin
 if not exists(select 1 from pg_constraint where conname='company_financial_entries_source_order_company_fk') then
  alter table public.company_financial_entries add constraint company_financial_entries_source_order_company_fk
   foreign key(source_service_order_id,company_id) references public.service_orders(id,company_id);
 end if;
 if not exists(select 1 from pg_constraint where conname='company_financial_entries_customer_company_fk') then
  alter table public.company_financial_entries add constraint company_financial_entries_customer_company_fk
   foreign key(customer_id,company_id) references public.customers(id,company_id);
 end if;
end $$;
create unique index if not exists company_financial_entries_one_os_invoice on public.company_financial_entries(source_service_order_id) where source_service_order_id is not null;
create or replace function public.invoice_service_order_net30(p_company_id uuid,p_service_order_id uuid)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_order public.service_orders%rowtype; v_customer text; v_entry uuid; v_amount numeric;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Somente a gestão pode faturar uma OS a prazo.'; end if;
 select * into v_order from public.service_orders where id=p_service_order_id and company_id=p_company_id for update;
 if not found then raise exception 'Ordem de serviço não encontrada.'; end if;
 if v_order.status in ('cancelled','rejected') then raise exception 'Não é possível faturar uma OS cancelada ou recusada.'; end if;
 if v_order.customer_id is null then raise exception 'Cadastre um cliente na OS antes de faturar.'; end if;
 select name into v_customer from public.customers where id=v_order.customer_id and company_id=p_company_id;
 if v_customer is null then raise exception 'Cliente da OS não encontrado.'; end if;
 v_amount:=case when coalesce(v_order.final_price,0)>0 then v_order.final_price else v_order.estimated_price end;
 if v_amount<=0 then raise exception 'Informe o valor final da OS antes de faturar.'; end if;
 if exists(select 1 from public.company_financial_entries where source_service_order_id=v_order.id) then raise exception 'Esta OS já possui uma fatura vinculada. Consulte Contas a receber.'; end if;
 insert into public.company_financial_entries(company_id,branch_id,entry_type,category,description,counterparty,amount,due_date,status,notes,source_service_order_id,source_order_number,customer_id)
 values(p_company_id,v_order.branch_id,'receivable','Ordem de serviço','OS #'||v_order.order_number||' · '||coalesce(v_order.device_brand||' ','')||coalesce(v_order.device_model,''),v_customer,v_amount,current_date+30,'open','Faturamento a prazo de 30 dias',v_order.id,v_order.order_number,v_order.customer_id)
 returning id into v_entry;
 return v_entry;
end $$;
revoke all on function public.invoice_service_order_net30(uuid,uuid) from public,anon;
grant execute on function public.invoice_service_order_net30(uuid,uuid) to authenticated;
