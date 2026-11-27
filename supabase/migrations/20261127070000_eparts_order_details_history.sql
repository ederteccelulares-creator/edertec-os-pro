-- Histórico de alterações de pedidos Eparts, com acesso somente à gestão da empresa.
create table if not exists public.eparts_sale_events(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 sale_id uuid not null,
 actor_user_id uuid references auth.users(id) on delete set null,
 old_status text,new_status text not null,
 old_payment_status text,new_payment_status text not null,
 created_at timestamptz not null default now(),
 foreign key(sale_id,company_id) references public.eparts_sales(id,company_id) on delete cascade
);
create index if not exists eparts_sale_events_sale_idx on public.eparts_sale_events(company_id,sale_id,created_at desc);
alter table public.eparts_sale_events enable row level security;
drop policy if exists eparts_sale_events_manager_read on public.eparts_sale_events;
create policy eparts_sale_events_manager_read on public.eparts_sale_events for select to authenticated using(
 exists(select 1 from public.company_members m where m.company_id=eparts_sale_events.company_id
 and m.user_id=auth.uid() and m.is_active=true and m.role in('owner','admin','manager'))
);

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
 if v_sale.status is distinct from p_status or v_sale.payment_status is distinct from p_payment_status then
  insert into public.eparts_sale_events(company_id,sale_id,actor_user_id,old_status,new_status,old_payment_status,new_payment_status)
  values(p_company_id,p_sale_id,auth.uid(),v_sale.status,p_status,v_sale.payment_status,p_payment_status);
 end if;
end;
$$;
revoke all on function public.eparts_update_sale(uuid,uuid,text,text) from public,anon;
grant execute on function public.eparts_update_sale(uuid,uuid,text,text) to authenticated;
