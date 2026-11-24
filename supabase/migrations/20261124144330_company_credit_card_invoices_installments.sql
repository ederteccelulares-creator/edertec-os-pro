alter table public.company_credit_cards add constraint company_credit_cards_id_company_unique unique(id,company_id);
create table public.company_credit_card_purchases(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 card_id uuid not null,branch_id uuid,description text not null,merchant text,purchase_date date not null,
 total_amount numeric(12,2) not null check(total_amount>0),installment_count smallint not null check(installment_count between 1 and 48),
 notes text,created_at timestamptz not null default now(),
 constraint card_purchase_card_company_fk foreign key(card_id,company_id) references public.company_credit_cards(id,company_id),
 constraint card_purchase_branch_company_fk foreign key(branch_id,company_id) references public.branches(id,company_id),
 constraint card_purchase_id_company_unique unique(id,company_id)
);
create table public.company_credit_card_invoices(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 card_id uuid not null,billing_month date not null check(extract(day from billing_month)=1),
 closing_date date not null,due_date date not null,status text not null default 'open' check(status in ('open','paid','cancelled')),
 paid_at timestamptz,payment_method text,notes text,created_at timestamptz not null default now(),
 constraint card_invoice_card_company_fk foreign key(card_id,company_id) references public.company_credit_cards(id,company_id),
 constraint card_invoice_unique_month unique(card_id,billing_month),constraint card_invoice_id_company_unique unique(id,company_id)
);
create table public.company_credit_card_installments(
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 purchase_id uuid not null,invoice_id uuid not null,installment_number smallint not null check(installment_number between 1 and 48),
 amount numeric(12,2) not null check(amount>0),created_at timestamptz not null default now(),
 constraint card_installment_purchase_company_fk foreign key(purchase_id,company_id) references public.company_credit_card_purchases(id,company_id),
 constraint card_installment_invoice_company_fk foreign key(invoice_id,company_id) references public.company_credit_card_invoices(id,company_id),
 constraint card_installment_unique_number unique(purchase_id,installment_number)
);
create index card_purchases_company_date_idx on public.company_credit_card_purchases(company_id,purchase_date desc);
create index card_invoices_company_due_idx on public.company_credit_card_invoices(company_id,due_date,status);
create index card_installments_company_invoice_idx on public.company_credit_card_installments(company_id,invoice_id);
do $$ declare t text; begin foreach t in array array['company_credit_card_purchases','company_credit_card_invoices','company_credit_card_installments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy %I on public.%I for select to authenticated using (public.is_company_member(company_id))',t||'_select_member',t);
 execute format('create policy %I on public.%I for all to authenticated using (public.has_company_role(company_id,array[''owner'',''admin'',''manager''])) with check (public.has_company_role(company_id,array[''owner'',''admin'',''manager'']))',t||'_manage_finance',t);
 execute format('revoke all on public.%I from anon',t);execute format('grant select,insert,update on public.%I to authenticated',t);execute format('grant all on public.%I to service_role',t);
end loop;end $$;
CREATE OR REPLACE FUNCTION public.create_company_card_purchase(p_company_id uuid,p_card_id uuid,p_branch_id uuid,p_description text,p_merchant text,p_purchase_date date,p_total_amount numeric,p_installment_count integer,p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_card public.company_credit_cards%rowtype;v_purchase_id uuid;v_invoice_id uuid;v_month date;v_closing date;v_due date;v_amount numeric(12,2);v_i integer;v_base numeric(12,2);v_due_day integer;v_close_day integer;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Acesso negado';end if;
 if p_description is null or char_length(trim(p_description))=0 or p_total_amount<=0 or p_installment_count<1 or p_installment_count>48 then raise exception 'Dados da compra inválidos';end if;
 select * into v_card from public.company_credit_cards where id=p_card_id and company_id=p_company_id and is_active for update;
 if not found then raise exception 'Cartão não encontrado ou inativo';end if;
 if p_branch_id is not null and not exists(select 1 from public.branches where id=p_branch_id and company_id=p_company_id) then raise exception 'Filial inválida para esta empresa';end if;
 insert into public.company_credit_card_purchases(company_id,card_id,branch_id,description,merchant,purchase_date,total_amount,installment_count,notes)
 values(p_company_id,p_card_id,p_branch_id,trim(p_description),nullif(trim(p_merchant),''),p_purchase_date,p_total_amount,p_installment_count,nullif(trim(p_notes),'')) returning id into v_purchase_id;
 v_base:=round(p_total_amount/p_installment_count,2);
 for v_i in 1..p_installment_count loop
  v_month:=date_trunc('month',p_purchase_date)::date;
  if extract(day from p_purchase_date)>v_card.billing_day then v_month:=(v_month+interval '1 month')::date;end if;
  v_month:=(v_month+make_interval(months=>v_i-1))::date;
  v_close_day:=least(v_card.billing_day,extract(day from (v_month+interval '1 month - 1 day'))::integer);
  v_closing:=v_month+(v_close_day-1);
  v_month:=(v_month+interval '1 month')::date;
  v_due_day:=least(v_card.due_day,extract(day from (v_month+interval '1 month - 1 day'))::integer);
  v_due:=v_month+(v_due_day-1);
  insert into public.company_credit_card_invoices(company_id,card_id,billing_month,closing_date,due_date)
  values(p_company_id,p_card_id,date_trunc('month',v_closing)::date,v_closing,v_due)
  on conflict(card_id,billing_month) do update set due_date=least(public.company_credit_card_invoices.due_date,excluded.due_date)
  returning id into v_invoice_id;
  v_amount:=case when v_i=p_installment_count then p_total_amount-(v_base*(p_installment_count-1)) else v_base end;
  insert into public.company_credit_card_installments(company_id,purchase_id,invoice_id,installment_number,amount)
  values(p_company_id,v_purchase_id,v_invoice_id,v_i,v_amount);
 end loop;return v_purchase_id;
end $function$;
do $$ declare def text; begin
 select pg_get_functiondef('public.export_company_backup(uuid)'::regprocedure) into def;
 def:=replace(def,'''company_credit_cards''','''company_credit_cards'',''company_credit_card_purchases'',''company_credit_card_invoices'',''company_credit_card_installments''');execute def;
 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into def;
 def:=replace(def,'''company_credit_cards''','''company_credit_cards'',''company_credit_card_purchases'',''company_credit_card_invoices'',''company_credit_card_installments''');
 def:=replace(def,'''company_credit_cards'',''company_credit_card_purchases'',''company_credit_card_invoices'',''company_credit_card_installments'',''service_orders''','''company_credit_cards'',''company_credit_card_purchases'',''company_credit_card_invoices'',''company_credit_card_installments'',''service_orders''');execute def;
end $$;