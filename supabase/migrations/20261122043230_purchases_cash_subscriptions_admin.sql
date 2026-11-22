-- Atomic supplier purchase creation and receipt into company stock.
create or replace function public.create_company_purchase(p_company_id uuid,p_supplier_id uuid,p_branch_id uuid,p_discount numeric,p_freight numeric,p_notes text,p_items jsonb)
returns uuid language plpgsql set search_path=''
as $$
declare
 v_purchase_id uuid; v_purchase_number bigint; v_subtotal numeric:=0; v_total numeric:=0;
 v_item jsonb; v_product_id uuid; v_description text; v_quantity numeric; v_unit_cost numeric;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado à empresa.'; end if;
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
end $$;

create or replace function public.receive_company_purchase(p_company_id uuid,p_purchase_id uuid)
returns void language plpgsql set search_path=''
as $$
declare v_purchase public.purchases%rowtype; v_item record;
begin
 if auth.uid() is null or not public.is_company_member(p_company_id) then raise exception 'Acesso não autorizado à empresa.'; end if;
 select * into v_purchase from public.purchases where id=p_purchase_id and company_id=p_company_id for update;
 if not found then raise exception 'Compra não encontrada.'; end if;
 if v_purchase.status='received' then raise exception 'Esta compra já foi recebida.'; end if;
 if v_purchase.status='cancelled' then raise exception 'Compra cancelada não pode ser recebida.'; end if;
 for v_item in select product_id,description,quantity,unit_cost from public.purchase_items where purchase_id=p_purchase_id and company_id=p_company_id order by created_at,id loop
  if v_item.product_id is not null then
   perform public.record_stock_movement(p_company_id,v_item.product_id,'in',v_item.quantity,v_purchase.branch_id,v_item.unit_cost,'Recebimento da compra #'||v_purchase.purchase_number||' - '||v_item.description);
   update public.products set cost_price=v_item.unit_cost,updated_at=now() where id=v_item.product_id and company_id=p_company_id;
  end if;
 end loop;
 update public.purchases set status='received',received_at=now() where id=p_purchase_id and company_id=p_company_id;
end $$;
revoke all on function public.create_company_purchase(uuid,uuid,uuid,numeric,numeric,text,jsonb) from public,anon;
revoke all on function public.receive_company_purchase(uuid,uuid) from public,anon;
grant execute on function public.create_company_purchase(uuid,uuid,uuid,numeric,numeric,text,jsonb) to authenticated;
grant execute on function public.receive_company_purchase(uuid,uuid) to authenticated;
