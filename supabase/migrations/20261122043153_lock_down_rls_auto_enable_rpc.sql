-- Company membership and tenant-scoped access controls.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean language sql stable set search_path=''
as $$
 select exists(select 1 from public.company_members cm where cm.company_id=target_company_id and cm.user_id=(select auth.uid()));
$$;

create or replace function public.register_company(company_name text, company_tax_id text default null, main_phone text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare new_company_id uuid; current_user_id uuid;
begin
 current_user_id:=auth.uid();
 if current_user_id is null then raise exception 'Authentication required'; end if;
 if company_name is null or length(trim(company_name))<2 then raise exception 'Company name must contain at least 2 characters'; end if;
 insert into public.companies(name,tax_id,phone) values(trim(company_name),nullif(trim(company_tax_id),''),nullif(trim(main_phone),'')) returning id into new_company_id;
 insert into public.company_members(company_id,user_id,role) values(new_company_id,current_user_id,'owner');
 insert into public.branches(company_id,name,phone) values(new_company_id,'Matriz',nullif(trim(main_phone),''));
 return new_company_id;
end $$;

create or replace function public.record_stock_movement(p_company_id uuid,p_product_id uuid,p_movement_type text,p_quantity numeric,p_branch_id uuid default null,p_unit_cost numeric default 0,p_reason text default null)
returns uuid language plpgsql set search_path=''
as $$
declare v_stock numeric; v_movement_id uuid;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado.'; end if;
 if p_movement_type not in ('in','out','adjustment') then raise exception 'Tipo de movimentação inválido.'; end if;
 if p_quantity is null or p_quantity<=0 or p_unit_cost is null or p_unit_cost<0 then raise exception 'Quantidade deve ser maior que zero e custo não pode ser negativo.'; end if;
 select stock_quantity into v_stock from public.products where id=p_product_id and company_id=p_company_id for update;
 if not found then raise exception 'Produto não encontrado nesta empresa.'; end if;
 if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Filial não pertence a esta empresa.'; end if;
 if p_movement_type='out' and v_stock<p_quantity then raise exception 'Estoque insuficiente. Saldo atual: %',v_stock; end if;
 insert into public.stock_movements(company_id,product_id,branch_id,movement_type,quantity,unit_cost,reason)
 values(p_company_id,p_product_id,p_branch_id,p_movement_type,p_quantity,p_unit_cost,nullif(trim(coalesce(p_reason,'')),'')) returning id into v_movement_id;
 update public.products set stock_quantity=case when p_movement_type='in' then stock_quantity+p_quantity when p_movement_type='out' then stock_quantity-p_quantity else p_quantity end,updated_at=now()
 where id=p_product_id and company_id=p_company_id;
 return v_movement_id;
end $$;
revoke all on function public.record_stock_movement(uuid,uuid,text,numeric,uuid,numeric,text) from public,anon;
grant execute on function public.record_stock_movement(uuid,uuid,text,numeric,uuid,numeric,text) to authenticated;

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.branches enable row level security;
alter table public.customers enable row level security;
alter table public.employees enable row level security;
alter table public.service_catalog enable row level security;
alter table public.products enable row level security;
alter table public.service_orders enable row level security;
alter table public.service_order_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.payments enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.platform_admins enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.company_subscriptions enable row level security;
alter table public.audit_logs enable row level security;

create policy "members can read their company" on public.companies for select to authenticated using(public.is_company_member(id));
create policy "users can read their own memberships" on public.company_members for select to authenticated using(user_id=(select auth.uid()));
create policy "members can manage branches" on public.branches for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage customers" on public.customers for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage employees" on public.employees for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage service catalog" on public.service_catalog for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage products" on public.products for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage service orders" on public.service_orders for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage order items" on public.service_order_items for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id) and exists(select 1 from public.service_orders so where so.id=service_order_items.service_order_id and so.company_id=service_order_items.company_id));
create policy "members can manage stock movements" on public.stock_movements for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage payments" on public.payments for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage suppliers" on public.suppliers for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage purchases" on public.purchases for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage purchase items" on public.purchase_items for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id) and exists(select 1 from public.purchases p where p.id=purchase_items.purchase_id and p.company_id=purchase_items.company_id) and (product_id is null or exists(select 1 from public.products pr where pr.id=purchase_items.product_id and pr.company_id=purchase_items.company_id)));
create policy "members can manage cash sessions" on public.cash_sessions for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id));
create policy "members can manage cash transactions" on public.cash_transactions for all to authenticated using(public.is_company_member(company_id)) with check(public.is_company_member(company_id) and (cash_session_id is null or exists(select 1 from public.cash_sessions cs where cs.id=cash_transactions.cash_session_id and cs.company_id=cash_transactions.company_id)) and (payment_id is null or exists(select 1 from public.payments p where p.id=cash_transactions.payment_id and p.company_id=cash_transactions.company_id)));
create policy "anyone can read active plans" on public.subscription_plans for select to anon,authenticated using(is_active=true);
create policy "company members can read subscriptions" on public.company_subscriptions for select to authenticated using(public.is_company_member(company_id));
create policy "platform admins can manage subscriptions" on public.company_subscriptions for all to authenticated using(exists(select 1 from public.platform_admins pa where pa.user_id=(select auth.uid()))) with check(exists(select 1 from public.platform_admins pa where pa.user_id=(select auth.uid())));
create policy "company members can read audit logs" on public.audit_logs for select to authenticated using(company_id is not null and public.is_company_member(company_id));

grant select,insert,update,delete on public.branches,public.customers,public.employees,public.service_catalog,public.products,public.service_orders,public.service_order_items,public.stock_movements,public.payments,public.suppliers,public.purchases,public.purchase_items,public.cash_sessions,public.cash_transactions to authenticated;
grant select on public.companies,public.company_members,public.company_subscriptions,public.audit_logs to authenticated;
grant select on public.subscription_plans to anon,authenticated;
