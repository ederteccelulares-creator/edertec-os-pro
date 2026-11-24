alter table public.cash_transactions add column transfer_group_id uuid;
create unique index cash_transactions_transfer_direction_uidx on public.cash_transactions(transfer_group_id,direction) where transfer_group_id is not null;
create index cash_transactions_account_balance_idx on public.cash_transactions(company_id,financial_account_id,occurred_at) where financial_account_id is not null;
create or replace function public.transfer_company_financial_accounts(p_company_id uuid,p_from_account_id uuid,p_to_account_id uuid,p_amount numeric,p_description text default null)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare v_from public.company_financial_accounts%rowtype;v_to public.company_financial_accounts%rowtype;v_group uuid;v_desc text;
begin
 if auth.uid() is null or not public.has_company_role(p_company_id,array['owner','admin','manager']) then raise exception 'Acesso negado para transferir entre contas.';end if;
 if p_amount is null or p_amount<=0 or p_amount>999999999 then raise exception 'Informe um valor de transferência válido.';end if;
 if p_from_account_id=p_to_account_id then raise exception 'A conta de origem e destino devem ser diferentes.';end if;
 select * into v_from from public.company_financial_accounts where id=p_from_account_id and company_id=p_company_id and is_active for update;
 if not found then raise exception 'Conta de origem não encontrada ou inativa.';end if;
 select * into v_to from public.company_financial_accounts where id=p_to_account_id and company_id=p_company_id and is_active for update;
 if not found then raise exception 'Conta de destino não encontrada ou inativa.';end if;
 v_group:=gen_random_uuid();v_desc:=coalesce(nullif(trim(p_description),''),'Transferência entre contas');
 insert into public.cash_transactions(company_id,branch_id,financial_account_id,transfer_group_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_from.branch_id,v_from.id,v_group,'out','Transferência entre contas',v_desc||' · para '||v_to.account_name,p_amount,'bank_transfer',now());
 insert into public.cash_transactions(company_id,branch_id,financial_account_id,transfer_group_id,direction,category,description,amount,payment_method,occurred_at)
 values(p_company_id,v_to.branch_id,v_to.id,v_group,'in','Transferência entre contas',v_desc||' · de '||v_from.account_name,p_amount,'bank_transfer',now());
 return v_group;
end $function$;
revoke all on function public.transfer_company_financial_accounts(uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.transfer_company_financial_accounts(uuid,uuid,uuid,numeric,text) to authenticated;
create or replace function public.list_company_financial_account_balances(p_company_id uuid)
returns table(account_id uuid,current_balance numeric,total_in numeric,total_out numeric)
language sql stable security invoker set search_path to ''
as $function$
 select a.id,
  (a.opening_balance+coalesce(sum(case when t.direction='in' then t.amount when t.direction='out' then -t.amount else 0 end),0))::numeric(14,2),
  coalesce(sum(case when t.direction='in' then t.amount else 0 end),0)::numeric(14,2),
  coalesce(sum(case when t.direction='out' then t.amount else 0 end),0)::numeric(14,2)
 from public.company_financial_accounts a
 left join public.cash_transactions t on t.company_id=a.company_id and t.financial_account_id=a.id
 where a.company_id=p_company_id and public.is_company_member(p_company_id)
 group by a.id,a.opening_balance;
$function$;
revoke all on function public.list_company_financial_account_balances(uuid) from public,anon;
grant execute on function public.list_company_financial_account_balances(uuid) to authenticated;