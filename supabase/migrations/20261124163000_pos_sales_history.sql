-- PDV sales history and atomic sale detail persistence.
-- This migration is applied to the production Edertec OS Pro project.
create table if not exists public.company_pos_sales (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 branch_id uuid, sale_number bigint generated always as identity, idempotency_key uuid not null,
 cash_session_id uuid not null, cash_transaction_id uuid, created_by uuid references auth.users(id) on delete set null,
 subtotal numeric(12,2) not null check(subtotal>=0), discount numeric(12,2) not null default 0 check(discount>=0),
 total numeric(12,2) not null check(total>0), amount_received numeric(12,2) not null default 0 check(amount_received>=0),
 change_amount numeric(12,2) not null default 0 check(change_amount>=0),
 payment_method text not null check(payment_method in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other')),
 financial_account_id uuid, description text, status text not null default 'completed' check(status in ('completed','cancelled')),
 created_at timestamptz not null default now(), cancelled_at timestamptz,
 unique(id,company_id),unique(company_id,idempotency_key),unique(company_id,sale_number),
 constraint company_pos_sales_branch_company_fkey foreign key(branch_id,company_id) references public.branches(id,company_id),
 constraint company_pos_sales_session_company_fkey foreign key(cash_session_id,company_id) references public.cash_sessions(id,company_id),
 constraint company_pos_sales_cash_tx_company_fkey foreign key(cash_transaction_id,company_id) references public.cash_transactions(id,company_id),
 constraint company_pos_sales_account_company_fkey foreign key(financial_account_id,company_id) references public.company_financial_accounts(id,company_id)
);
create table if not exists public.company_pos_sale_items (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 sale_id uuid not null, product_id uuid, product_name text not null, sku text,
 quantity numeric(12,3) not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0),
 unit_cost numeric(12,2) not null check(unit_cost>=0), line_total numeric(12,2) not null check(line_total>=0),
 created_at timestamptz not null default now(),
 constraint company_pos_sale_items_sale_company_fkey foreign key(sale_id,company_id) references public.company_pos_sales(id,company_id) on delete cascade,
 constraint company_pos_sale_items_product_company_fkey foreign key(product_id,company_id) references public.products(id,company_id)
);
create index if not exists company_pos_sales_company_created_idx on public.company_pos_sales(company_id,created_at desc);
create index if not exists company_pos_sale_items_sale_idx on public.company_pos_sale_items(company_id,sale_id);
alter table public.company_pos_sales enable row level security;
alter table public.company_pos_sale_items enable row level security;
drop policy if exists company_pos_sales_read on public.company_pos_sales;
create policy company_pos_sales_read on public.company_pos_sales for select to authenticated using(public.is_company_member(company_id));
drop policy if exists company_pos_sale_items_read on public.company_pos_sale_items;
create policy company_pos_sale_items_read on public.company_pos_sale_items for select to authenticated using(public.is_company_member(company_id));
revoke all on public.company_pos_sales,public.company_pos_sale_items from anon,authenticated;
grant select on public.company_pos_sales,public.company_pos_sale_items to authenticated;
grant all on public.company_pos_sales,public.company_pos_sale_items to service_role;

-- The RPC validates role, company/branch/account, cash session, item uniqueness,
-- current stock and amounts; sale, items, stock movements and cash receipt commit atomically.
drop function if exists public.finalize_company_pos_sale(uuid,uuid,jsonb,numeric,text,uuid,uuid,text);
create or replace function public.finalize_company_pos_sale(
 p_company_id uuid,p_branch_id uuid,p_items jsonb,p_subtotal numeric,p_discount numeric,p_amount numeric,p_payment_method text,
 p_financial_account_id uuid default null,p_idempotency_key uuid default null,p_description text default null,p_amount_received numeric default 0
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_session_id uuid;v_account public.company_financial_accounts%rowtype;v_item record;v_stock numeric;v_tx uuid;v_sale uuid;v_existing uuid;v_lines integer;v_distinct integer;v_change numeric;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager','attendant']) then raise exception 'Acesso não autorizado para finalizar venda.';end if;
 if p_idempotency_key is null then raise exception 'Chave de segurança da venda ausente.';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>100 then raise exception 'Carrinho vazio ou com quantidade inválida de itens.';end if;
 if p_subtotal is null or p_subtotal<=0 or p_discount is null or p_discount<0 or p_discount>p_subtotal or p_amount is null or p_amount<=0 or round(p_subtotal-p_discount,2)<>round(p_amount,2) then raise exception 'Valores da venda inválidos.';end if;
 if p_payment_method not in ('pix','cash','debit_card','credit_card','bank_transfer','boleto','other') then raise exception 'Forma de pagamento inválida.';end if;
 if p_amount_received is null or p_amount_received<0 or (p_payment_method='cash' and p_amount_received<p_amount) then raise exception 'Valor recebido inválido ou insuficiente.';end if;
 v_change:=case when p_payment_method='cash' then greatest(0,p_amount_received-p_amount) else 0 end;
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
  select id into v_existing from public.company_pos_sales where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if v_existing is not null then return v_existing;end if;
  for v_item in select x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric) order by x.product_id loop
   if v_item.product_id is null or v_item.quantity is null or v_item.quantity<=0 or v_item.quantity>999999 then raise exception 'Produto ou quantidade inválida.';end if;
   select stock_quantity into v_stock from public.products where id=v_item.product_id and company_id=p_company_id and is_active for update;
   if not found then raise exception 'Produto não encontrado ou inativo.';end if;
   if v_stock<v_item.quantity then raise exception 'Estoque insuficiente para um ou mais produtos.';end if;
  end loop;
  insert into public.company_pos_sales(company_id,branch_id,idempotency_key,cash_session_id,created_by,subtotal,discount,total,amount_received,change_amount,payment_method,financial_account_id,description)
  values(p_company_id,p_branch_id,p_idempotency_key,v_session_id,auth.uid(),p_subtotal,p_discount,p_amount,case when p_payment_method='cash' then p_amount_received else p_amount end,v_change,p_payment_method,p_financial_account_id,nullif(trim(p_description),'')) returning id into v_sale;
  for v_item in select x.product_id,x.quantity from jsonb_to_recordset(p_items) as x(product_id uuid,quantity numeric) order by x.product_id loop
   insert into public.company_pos_sale_items(company_id,sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total)
   select p_company_id,v_sale,p.id,p.name,p.sku,v_item.quantity,p.sale_price,p.cost_price,round(v_item.quantity*p.sale_price,2) from public.products p where p.id=v_item.product_id and p.company_id=p_company_id;
   insert into public.stock_movements(company_id,branch_id,product_id,movement_type,quantity,unit_cost,reason)
   select p_company_id,p_branch_id,p.id,'out',v_item.quantity,p.cost_price,'Venda PDV · '||coalesce(nullif(trim(p_description),''),'Venda registrada no PDV') from public.products p where p.id=v_item.product_id and p.company_id=p_company_id;
   update public.products set stock_quantity=stock_quantity-v_item.quantity,updated_at=now() where id=v_item.product_id and company_id=p_company_id;
  end loop;
  insert into public.cash_transactions(company_id,branch_id,cash_session_id,financial_account_id,pos_sale_key,direction,category,description,amount,payment_method,occurred_at)
  values(p_company_id,p_branch_id,v_session_id,p_financial_account_id,p_idempotency_key,'in','Venda PDV',coalesce(nullif(trim(p_description),''),'Venda PDV'),p_amount,p_payment_method,now()) returning id into v_tx;
  update public.company_pos_sales set cash_transaction_id=v_tx where id=v_sale and company_id=p_company_id;
  return v_sale;
 exception when unique_violation then
  select id into v_existing from public.company_pos_sales where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if v_existing is not null then return v_existing;end if;raise;
 end;
end;
$$;
revoke all on function public.finalize_company_pos_sale(uuid,uuid,jsonb,numeric,numeric,numeric,text,uuid,uuid,text,numeric) from public,anon;
grant execute on function public.finalize_company_pos_sale(uuid,uuid,jsonb,numeric,numeric,numeric,text,uuid,uuid,text,numeric) to authenticated;

-- Keep POS sales and their line items in company backups and restore dependency order.
do $$
declare d text;
begin
 select pg_get_functiondef('public.export_company_backup(uuid)'::regprocedure) into d;
 d:=replace(d,'''company_credit_card_installments''','''company_credit_card_installments'',''company_pos_sales'',''company_pos_sale_items''');
 execute d;
 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,'''company_credit_card_installments''','''company_credit_card_installments'',''company_pos_sales'',''company_pos_sale_items''');
 d:=replace(d,$a
 d:=replace(d,'''closed_by'','''')::uuid] loop''','''closed_by'','''')::uuid,nullif(row_value->>''created_by'','''')::uuid] loop''');
 execute d;
end $$;
notify pgrst,'reload schema';company_credit_card_installments','company_pos_sales','company_pos_sale_items','service_orders'$a$,$b
 d:=replace(d,'''closed_by'','''')::uuid] loop''','''closed_by'','''')::uuid,nullif(row_value->>''created_by'','''')::uuid] loop''');
 execute d;
end $$;
notify pgrst,'reload schema';company_credit_card_installments','service_orders'$b$);
 d:=replace(d,$c
 d:=replace(d,'''closed_by'','''')::uuid] loop''','''closed_by'','''')::uuid,nullif(row_value->>''created_by'','''')::uuid] loop''');
 execute d;
end $$;
notify pgrst,'reload schema';cash_transactions','company_financial_entries'$c$,$d
 d:=replace(d,'''closed_by'','''')::uuid] loop''','''closed_by'','''')::uuid,nullif(row_value->>''created_by'','''')::uuid] loop''');
 execute d;
end $$;
notify pgrst,'reload schema';cash_transactions','company_financial_entries','company_pos_sales','company_pos_sale_items'$d$);
 d:=replace(d,'''closed_by'','''')::uuid] loop''','''closed_by'','''')::uuid,nullif(row_value->>''created_by'','''')::uuid] loop''');
 execute d;
end $$;
notify pgrst,'reload schema';