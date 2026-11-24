-- Auditable employee commission settlement batches.
alter table public.company_pos_sales
 add column if not exists commission_settlement_id uuid;

create table if not exists public.company_pos_commission_settlements (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 employee_id uuid not null,
 branch_id uuid,
 period_start date not null,
 period_end date not null,
 sale_count integer not null check(sale_count > 0),
 total_amount numeric(12,2) not null check(total_amount > 0),
 status text not null default 'pending' check(status in ('pending','paid')),
 idempotency_key uuid not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 paid_at timestamptz,
 paid_by uuid references auth.users(id) on delete set null,
 payment_method text,
 payment_reference text,
 unique(id,company_id),
 unique(company_id,idempotency_key),
 constraint company_pos_commission_settlements_employee_company_fk
  foreign key(employee_id,company_id) references public.employees(id,company_id),
 constraint company_pos_commission_settlements_branch_company_fk
  foreign key(branch_id,company_id) references public.branches(id,company_id),
 constraint company_pos_commission_settlements_period_check
  check(period_end >= period_start),
 constraint company_pos_commission_settlements_paid_check
  check((status='pending' and paid_at is null and paid_by is null) or (status='paid' and paid_at is not null and paid_by is not null))
);

do $$
begin
 if not exists(select 1 from pg_constraint where conname='company_pos_sales_commission_settlement_fk') then
  alter table public.company_pos_sales add constraint company_pos_sales_commission_settlement_fk
   foreign key(commission_settlement_id,company_id)
   references public.company_pos_commission_settlements(id,company_id);
 end if;
end $$;

create index if not exists company_pos_commission_settlements_company_period_idx
 on public.company_pos_commission_settlements(company_id,period_start desc,status);
create index if not exists company_pos_sales_commission_settlement_idx
 on public.company_pos_sales(company_id,commission_settlement_id)
 where commission_settlement_id is not null;

alter table public.company_pos_commission_settlements enable row level security;
drop policy if exists company_pos_commission_settlements_read on public.company_pos_commission_settlements;
create policy company_pos_commission_settlements_read
 on public.company_pos_commission_settlements for select to authenticated
 using(public.is_company_member(company_id));
revoke all on public.company_pos_commission_settlements from anon,authenticated;
grant select on public.company_pos_commission_settlements to authenticated;
grant all on public.company_pos_commission_settlements to service_role;

create or replace function public.create_company_pos_commission_settlement(
 p_company_id uuid,p_employee_id uuid,p_branch_id uuid,p_period_start date,p_period_end date,p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_settlement_id uuid; v_count integer; v_total numeric(12,2);
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then
  raise exception 'Somente a administração pode fechar comissões.';
 end if;
 if p_employee_id is null or p_period_start is null or p_period_end is null or p_period_end<p_period_start or p_idempotency_key is null then
  raise exception 'Funcionário, período e chave de segurança são obrigatórios.';
 end if;
 if not exists(select 1 from public.employees e where e.id=p_employee_id and e.company_id=p_company_id and e.is_active
   and (e.branch_id is null or e.branch_id is not distinct from p_branch_id)) then
  raise exception 'Funcionário não encontrado, inativo ou fora da filial selecionada.';
 end if;
 select id into v_settlement_id from public.company_pos_commission_settlements
  where company_id=p_company_id and idempotency_key=p_idempotency_key;
 if v_settlement_id is not null then return v_settlement_id; end if;

 with eligible as (
  select s.id,s.commission_amount
  from public.company_pos_sales s
  where s.company_id=p_company_id and s.seller_employee_id=p_employee_id
   and s.status='completed' and s.commission_amount>0
   and s.commission_settlement_id is null
   and s.created_at >= p_period_start::timestamp at time zone 'America/Sao_Paulo'
   and s.created_at < (p_period_end+1)::timestamp at time zone 'America/Sao_Paulo'
   and s.branch_id is not distinct from p_branch_id
  for update
 ), totals as (
  select count(*)::integer as n,round(coalesce(sum(commission_amount),0),2) as amount from eligible
 )
 select n,amount into v_count,v_total from totals;
 if coalesce(v_count,0)=0 or coalesce(v_total,0)<=0 then
  raise exception 'Não existem comissões pendentes para esse funcionário, filial e período.';
 end if;

 insert into public.company_pos_commission_settlements(company_id,employee_id,branch_id,period_start,period_end,sale_count,total_amount,idempotency_key,created_by)
 values(p_company_id,p_employee_id,p_branch_id,p_period_start,p_period_end,v_count,v_total,p_idempotency_key,auth.uid())
 returning id into v_settlement_id;

 update public.company_pos_sales s set commission_settlement_id=v_settlement_id
 where s.company_id=p_company_id and s.seller_employee_id=p_employee_id
  and s.status='completed' and s.commission_amount>0 and s.commission_settlement_id is null
  and s.created_at >= p_period_start::timestamp at time zone 'America/Sao_Paulo'
  and s.created_at < (p_period_end+1)::timestamp at time zone 'America/Sao_Paulo'
  and s.branch_id is not distinct from p_branch_id;
 return v_settlement_id;
end;
$$;

create or replace function public.pay_company_pos_commission_settlement(
 p_company_id uuid,p_settlement_id uuid,p_payment_method text,p_payment_reference text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_row public.company_pos_commission_settlements%rowtype;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then
  raise exception 'Somente a administração pode confirmar o pagamento.';
 end if;
 if p_payment_method is null or length(trim(p_payment_method))<2 then
  raise exception 'Informe a forma de pagamento.';
 end if;
 select * into v_row from public.company_pos_commission_settlements
  where id=p_settlement_id and company_id=p_company_id for update;
 if not found then raise exception 'Fechamento de comissão não encontrado.'; end if;
 if v_row.status='paid' then return v_row.id; end if;
 update public.company_pos_commission_settlements
 set status='paid',paid_at=now(),paid_by=auth.uid(),
  payment_method=trim(p_payment_method),
  payment_reference=nullif(trim(coalesce(p_payment_reference,'')),'')
 where id=p_settlement_id and company_id=p_company_id;
 return p_settlement_id;
end;
$$;

revoke all on function public.create_company_pos_commission_settlement(uuid,uuid,uuid,date,date,uuid) from public,anon;
grant execute on function public.create_company_pos_commission_settlement(uuid,uuid,uuid,date,date,uuid) to authenticated;
revoke all on function public.pay_company_pos_commission_settlement(uuid,uuid,text,text) from public,anon;
grant execute on function public.pay_company_pos_commission_settlement(uuid,uuid,text,text) to authenticated;

-- Include commission settlements in company backups and restore parents before sales.
do $$
declare d text; old_allowed text; new_allowed text; old_order text; new_order text;
begin
 old_allowed:=quote_literal('company_pos_sale_items')||E'\n ];';
 new_allowed:=quote_literal('company_pos_sale_items')||','||quote_literal('company_pos_commission_settlements')||E'\n ];';
 select pg_get_functiondef('public.export_company_backup(uuid)'::regprocedure) into d;
 d:=replace(d,old_allowed,new_allowed);
 execute d;

 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into d;
 d:=replace(d,old_allowed,new_allowed);
 old_order:=quote_literal('cash_transactions')||','||quote_literal('company_pos_sales');
 new_order:=quote_literal('cash_transactions')||','||quote_literal('company_pos_commission_settlements')||','||quote_literal('company_pos_sales');
 d:=replace(d,old_order,new_order);
 execute d;
end $$;

notify pgrst,'reload schema';
