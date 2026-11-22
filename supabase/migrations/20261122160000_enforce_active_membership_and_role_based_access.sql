alter table public.company_members
  add column if not exists is_active boolean not null default true;

create or replace function public.is_company_member(target_company_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from public.company_members cm
    where cm.company_id=target_company_id and cm.user_id=(select auth.uid()) and cm.is_active=true);
$$;

create or replace function public.has_company_role(target_company_id uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (select 1 from public.company_members cm
    where cm.company_id=target_company_id and cm.user_id=(select auth.uid())
      and cm.is_active=true and cm.role=any(allowed_roles));
$$;

revoke all on function public.is_company_member(uuid) from public, anon;
grant execute on function public.is_company_member(uuid) to authenticated, service_role;
revoke all on function public.has_company_role(uuid,text[]) from public, anon;
grant execute on function public.has_company_role(uuid,text[]) to authenticated, service_role;

drop policy if exists "members can manage cash sessions" on public.cash_sessions;
create policy "finance roles manage cash sessions" on public.cash_sessions for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage cash transactions" on public.cash_transactions;
create policy "finance roles manage cash transactions" on public.cash_transactions for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager'])
 and (cash_session_id is null or exists(select 1 from public.cash_sessions cs where cs.id=cash_session_id and cs.company_id=cash_transactions.company_id))
 and (payment_id is null or exists(select 1 from public.payments p where p.id=payment_id and p.company_id=cash_transactions.company_id)));

drop policy if exists "members can manage company financial entries" on public.company_financial_entries;
create policy "finance roles manage company financial entries" on public.company_financial_entries for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage payments" on public.payments;
create policy "finance roles manage payments" on public.payments for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage purchases" on public.purchases;
create policy "management roles manage purchases" on public.purchases for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage purchase items" on public.purchase_items;
create policy "management roles manage purchase items" on public.purchase_items for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager'])
 and exists(select 1 from public.purchases p where p.id=purchase_id and p.company_id=purchase_items.company_id)
 and (product_id is null or exists(select 1 from public.products pr where pr.id=product_id and pr.company_id=purchase_items.company_id)));

drop policy if exists "members can manage suppliers" on public.suppliers;
create policy "management roles manage suppliers" on public.suppliers for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage stock movements" on public.stock_movements;
create policy "management roles manage stock movements" on public.stock_movements for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage products" on public.products;
create policy "active members read products" on public.products for select to authenticated
using (public.is_company_member(company_id));
create policy "management roles insert products" on public.products for insert to authenticated
with check (public.has_company_role(company_id,array['owner','admin','manager']));
create policy "management roles update products" on public.products for update to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));
create policy "management roles delete products" on public.products for delete to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']));

drop policy if exists "members can manage employees" on public.employees;
create policy "active members read employees" on public.employees for select to authenticated
using (public.is_company_member(company_id));
create policy "management roles manage employees" on public.employees for all to authenticated
using (public.has_company_role(company_id,array['owner','admin','manager']))
with check (public.has_company_role(company_id,array['owner','admin','manager']));

create or replace function public.create_company_customer_portal_link(p_company_id uuid,p_customer_id uuid)
returns text language plpgsql security definer set search_path to ''
as $$
declare v_token text;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then
  raise exception 'Only active company management can create customer portal links';
 end if;
 if not exists(select 1 from public.customers where id=p_customer_id and company_id=p_company_id) then raise exception 'Customer not found'; end if;
 update public.company_customer_portal_tokens set revoked_at=now()
 where company_id=p_company_id and customer_id=p_customer_id and revoked_at is null;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.company_customer_portal_tokens(company_id,customer_id,token_hash,created_by)
 values(p_company_id,p_customer_id,encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),auth.uid());
 return v_token;
end;
$$;

create or replace function public.create_company_service_order_tracking_link(p_company_id uuid,p_order_id uuid)
returns text language plpgsql security definer set search_path to ''
as $$
declare v_token text;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Not authorized for this company'; end if;
 if not exists(select 1 from public.service_orders where id=p_order_id and company_id=p_company_id) then raise exception 'Service order not found'; end if;
 update public.company_service_order_tracking_tokens set revoked_at=now()
 where company_id=p_company_id and service_order_id=p_order_id and revoked_at is null;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.company_service_order_tracking_tokens(company_id,service_order_id,token_hash,created_by)
 values(p_company_id,p_order_id,encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),auth.uid());
 return v_token;
end;
$$;

create or replace function public.export_company_backup(p_company_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare
 table_name text; tables_value jsonb:='{}'::jsonb; rows_value jsonb; total_rows integer:=0;
 row_count integer; allowed_tables text[]:=array['branches','customers','employees','service_catalog','products','service_orders','service_order_items','stock_movements','payments','suppliers','purchases','purchase_items','cash_sessions','cash_transactions','company_financial_entries'];
 result_value jsonb;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin']) then raise exception 'Only an active company owner or admin can export a backup'; end if;
 perform 1 from public.companies where id=p_company_id for share;
 if not found then raise exception 'Company not found'; end if;
 foreach table_name in array allowed_tables loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.company_id=$1',table_name) into rows_value using p_company_id;
  row_count:=jsonb_array_length(rows_value);
  if row_count>10000 then raise exception 'Backup table % exceeds the 10,000 row limit',table_name; end if;
  total_rows:=total_rows+row_count;
  if total_rows>150000 then raise exception 'Backup exceeds the 150,000 row limit'; end if;
  tables_value:=tables_value||jsonb_build_object(table_name,rows_value);
 end loop;
 result_value:=jsonb_build_object('format','edertec-os-pro-company-backup','version',1,'exported_at',now(),
  'company',(select jsonb_build_object('id',c.id,'name',c.name,'legal_name',c.legal_name) from public.companies c where c.id=p_company_id),
  'tables',tables_value,'record_count',total_rows);
 if octet_length(result_value::text)>10485760 then raise exception 'Backup exceeds the 10 MB limit'; end if;
 return result_value;
end;
$$;

create or replace function public.create_company_purchase(
 p_company_id uuid,p_supplier_id uuid,p_branch_id uuid,p_discount numeric,p_freight numeric,p_notes text,p_items jsonb
) returns uuid language plpgsql set search_path to ''
as $$
declare v_purchase_id uuid; v_purchase_number bigint; v_subtotal numeric:=0; v_total numeric:=0;
 v_item jsonb; v_product_id uuid; v_description text; v_quantity numeric; v_unit_cost numeric;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Acesso não autorizado à empresa.'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um item à compra.'; end if;
 if coalesce(p_discount,0)<0 or coalesce(p_freight,0)<0 then raise exception 'Desconto e frete não podem ser negativos.'; end if;
 if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.company_id=p_company_id) then raise exception 'Fornecedor inválido para esta empresa.'; end if;
 if p_branch_id is not null and not exists(select 1 from public.branches b where b.id=p_branch_id and b.company_id=p_company_id) then raise exception 'Filial inválida para esta empresa.'; end if;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_product_id:=nullif(v_item->>'product_id','')::uuid; v_description:=trim(coalesce(v_item->>'description',''));
  v_quantity:=(v_item->>'quantity')::numeric; v_unit_cost:=(v_item->>'unit_cost')::numeric;
  if v_description='' or v_quantity<=0 or v_unit_cost<0 then raise exception 'Item da compra inválido.'; end if;
  if v_product_id is not null and not exists(select 1 from public.products pr where pr.id=v_product_id and pr.company_id=p_company_id) then raise exception 'Produto não pertence a esta empresa.'; end if;
  v_subtotal:=v_subtotal+(v_quantity*v_unit_cost);
 end loop;
 v_total:=greatest(0,v_subtotal-coalesce(p_discount,0)+coalesce(p_freight,0));
 v_purchase_number:=nextval('public.purchases_purchase_number_seq'::regclass);
 insert into public.purchases(company_id,branch_id,supplier_id,purchase_number,status,subtotal,discount,freight,total,purchased_at,notes)
 values(p_company_id,p_branch_id,p_supplier_id,v_purchase_number,'draft',v_subtotal,coalesce(p_discount,0),coalesce(p_freight,0),v_total,now(),nullif(trim(coalesce(p_notes,'')),'')) returning id into v_purchase_id;
 for v_item in select value from jsonb_array_elements(p_items) loop
  v_product_id:=nullif(v_item->>'product_id','')::uuid; v_description:=trim(coalesce(v_item->>'description',''));
  v_quantity:=(v_item->>'quantity')::numeric; v_unit_cost:=(v_item->>'unit_cost')::numeric;
  insert into public.purchase_items(company_id,purchase_id,product_id,description,quantity,unit_cost,total_cost)
  values(p_company_id,v_purchase_id,v_product_id,v_description,v_quantity,v_unit_cost,v_quantity*v_unit_cost);
 end loop;
 return v_purchase_id;
end;
$$;
