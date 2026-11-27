-- Gestão de pedidos Eparts: atualizações protegidas e devolução única do estoque.
alter table public.eparts_sales add column if not exists stock_restored_at timestamptz;

create or replace function public.eparts_update_sale(
 p_company_id uuid,p_sale_id uuid,p_status text,p_payment_status text
) returns void
language plpgsql security definer set search_path=public
as $$
declare v_sale public.eparts_sales%rowtype; v_group record;
begin
 if auth.uid() is null or not exists(
  select 1 from public.company_members m where m.company_id=p_company_id
   and m.user_id=auth.uid() and m.is_active=true and m.role in('owner','admin','manager')
 ) then raise exception 'Sem permissão para gerenciar pedidos.'; end if;
 if p_status is null or p_payment_status is null
  or p_status not in('pending','confirmed','processing','shipped','delivered','cancelled')
  or p_payment_status not in('pending','paid','partially_paid','refunded') then
  raise exception 'Status de pedido ou pagamento inválido.';
 end if;
 select * into v_sale from public.eparts_sales
  where id=p_sale_id and company_id=p_company_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 if v_sale.status='cancelled' and p_status<>'cancelled' then
  raise exception 'Um pedido cancelado não pode ser reativado.';
 end if;
 if p_status='cancelled' and (v_sale.payment_status in('paid','partially_paid') and p_payment_status<>'refunded') then
  raise exception 'Estorne o pagamento antes de cancelar o pedido.';
 end if;
 if p_status='cancelled' and v_sale.status<>'cancelled' and v_sale.stock_restored_at is null then
  for v_group in
   select product_id,sum(quantity) quantity from public.eparts_sale_items
    where sale_id=p_sale_id and company_id=p_company_id group by product_id order by product_id
  loop
   update public.eparts_products set stock_quantity=stock_quantity+v_group.quantity,updated_at=now()
    where id=v_group.product_id and company_id=p_company_id;
  end loop;
  update public.eparts_sales set stock_restored_at=now() where id=p_sale_id and company_id=p_company_id;
 end if;
 update public.eparts_sales set status=p_status,payment_status=p_payment_status,updated_at=now()
  where id=p_sale_id and company_id=p_company_id;
end;
$$;
revoke all on function public.eparts_update_sale(uuid,uuid,text,text) from public,anon;
grant execute on function public.eparts_update_sale(uuid,uuid,text,text) to authenticated;
