-- Saldo dos fornecedores e registro de repasses com limite transacional.
-- Somente pedidos não cancelados e totalmente pagos geram saldo liberado para repasse.
create or replace function public.eparts_supplier_balances(p_company_id uuid)
returns table(
 supplier_id uuid,
 supplier_name text,
 eligible_amount numeric(12,2),
 paid_amount numeric(12,2),
 pending_amount numeric(12,2)
)
language plpgsql
security definer
set search_path=public
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.company_members m
  where m.company_id=p_company_id and m.user_id=auth.uid()
   and m.is_active=true and m.role in('owner','admin','manager')
 ) then raise exception 'Sem permissão para consultar os saldos dos fornecedores.'; end if;

 return query
 select s.id,s.name,
  coalesce(sum(i.supplier_amount) filter(where o.payment_status='paid' and o.status<>'cancelled'),0)::numeric(12,2) as eligible_amount,
  coalesce((select sum(p.amount) from public.eparts_supplier_payouts p
    where p.company_id=p_company_id and p.supplier_id=s.id),0)::numeric(12,2) as paid_amount,
  (coalesce(sum(i.supplier_amount) filter(where o.payment_status='paid' and o.status<>'cancelled'),0)
   -coalesce((select sum(p.amount) from public.eparts_supplier_payouts p
    where p.company_id=p_company_id and p.supplier_id=s.id),0))::numeric(12,2) as pending_amount
 from public.eparts_suppliers s
 left join public.eparts_sale_items i on i.supplier_id=s.id and i.company_id=s.company_id
 left join public.eparts_sales o on o.id=i.sale_id and o.company_id=i.company_id
 where s.company_id=p_company_id
 group by s.id,s.name
 order by s.name;
end;
$$;

drop function if exists public.eparts_register_supplier_payout(uuid,uuid,numeric,text,text,text);
create function public.eparts_register_supplier_payout(
 p_company_id uuid,p_supplier_id uuid,p_amount numeric,p_payment_method text,
 p_sale_id uuid default null,p_reference text default null,p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_supplier public.eparts_suppliers%rowtype;
 v_eligible numeric(12,2);
 v_paid numeric(12,2);
 v_balance numeric(12,2);
 v_sale_eligible numeric(12,2);
 v_sale_paid numeric(12,2);
 v_payout_id uuid;
begin
 if auth.uid() is null or not exists(
  select 1 from public.company_members m
  where m.company_id=p_company_id and m.user_id=auth.uid()
   and m.is_active=true and m.role in('owner','admin','manager')
 ) then raise exception 'Sem permissão para registrar repasses.'; end if;
 if p_amount is null or p_amount<=0 or p_payment_method not in('pix','cash','transfer','bank_slip','card','other') then
  raise exception 'Valor ou forma de pagamento inválidos.';
 end if;

 select * into v_supplier from public.eparts_suppliers
  where id=p_supplier_id and company_id=p_company_id and is_active=true
  for update;
 if not found then raise exception 'Fornecedor não encontrado ou inativo.'; end if;

 select coalesce(sum(i.supplier_amount),0)::numeric(12,2)
 into v_eligible
 from public.eparts_sale_items i
 join public.eparts_sales o on o.id=i.sale_id and o.company_id=i.company_id
 where i.company_id=p_company_id and i.supplier_id=p_supplier_id
  and o.status<>'cancelled' and o.payment_status='paid';

 select coalesce(sum(amount),0)::numeric(12,2) into v_paid
 from public.eparts_supplier_payouts
 where company_id=p_company_id and supplier_id=p_supplier_id;

 v_balance:=v_eligible-v_paid;
 if p_amount>v_balance then
  raise exception 'Repasse maior que o saldo disponível. Saldo atual: R$ %.',to_char(greatest(v_balance,0),'FM999999990D00');
 end if;

 if p_sale_id is not null then
  select coalesce(sum(i.supplier_amount),0)::numeric(12,2)
   into v_sale_eligible
  from public.eparts_sale_items i
  join public.eparts_sales o on o.id=i.sale_id and o.company_id=i.company_id
  where i.company_id=p_company_id and i.supplier_id=p_supplier_id and i.sale_id=p_sale_id
   and o.status<>'cancelled' and o.payment_status='paid';

  if v_sale_eligible=0 then
   raise exception 'O pedido selecionado não possui valor liberado para este fornecedor.';
  end if;

  select coalesce(sum(amount),0)::numeric(12,2) into v_sale_paid
  from public.eparts_supplier_payouts
  where company_id=p_company_id and supplier_id=p_supplier_id and sale_id=p_sale_id;

  if p_amount>v_sale_eligible-v_sale_paid then
   raise exception 'O valor excede o saldo disponível deste pedido. Saldo do pedido: R$ %.',to_char(greatest(v_sale_eligible-v_sale_paid,0),'FM999999990D00');
  end if;
 end if;

 insert into public.eparts_supplier_payouts(
  company_id,supplier_id,sale_id,amount,payment_method,reference,notes,created_by
 ) values(
  p_company_id,p_supplier_id,p_sale_id,round(p_amount,2),p_payment_method,
  nullif(trim(coalesce(p_reference,'')),''),nullif(trim(coalesce(p_notes,'')),''),auth.uid()
 ) returning id into v_payout_id;

 return v_payout_id;
end;
$$;

revoke all on function public.eparts_supplier_balances(uuid) from public,anon;
grant execute on function public.eparts_supplier_balances(uuid) to authenticated;
revoke all on function public.eparts_register_supplier_payout(uuid,uuid,numeric,text,uuid,text,text) from public,anon;
grant execute on function public.eparts_register_supplier_payout(uuid,uuid,numeric,text,uuid,text,text) to authenticated;

-- Impede inserções diretas que contornariam a validação transacional do saldo.
revoke insert on table public.eparts_supplier_payouts from public,anon,authenticated;
