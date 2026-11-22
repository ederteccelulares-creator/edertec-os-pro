create table if not exists public.company_customer_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists company_customer_portal_tokens_lookup_idx
  on public.company_customer_portal_tokens(token_hash) where revoked_at is null;
alter table public.company_customer_portal_tokens enable row level security;
revoke all on public.company_customer_portal_tokens from anon, authenticated;

create or replace function public.create_company_customer_portal_link(p_company_id uuid,p_customer_id uuid)
returns text language plpgsql security definer set search_path=public,extensions
as $$
declare v_token text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.company_members where company_id=p_company_id and user_id=auth.uid()) then
  raise exception 'Not authorized for this company';
 end if;
 if not exists(select 1 from public.customers where id=p_customer_id and company_id=p_company_id) then
  raise exception 'Customer not found';
 end if;
 update public.company_customer_portal_tokens set revoked_at=now()
 where company_id=p_company_id and customer_id=p_customer_id and revoked_at is null;
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.company_customer_portal_tokens(company_id,customer_id,token_hash,created_by)
 values(p_company_id,p_customer_id,encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),auth.uid());
 return v_token;
end $$;
revoke all on function public.create_company_customer_portal_link(uuid,uuid) from public;
grant execute on function public.create_company_customer_portal_link(uuid,uuid) to authenticated;

create or replace function public.get_company_customer_portal(p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions
as $$
declare v_result jsonb;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select jsonb_build_object(
  'company_name',co.name,'customer_name',cu.name,'customer_phone',cu.phone,
  'orders',coalesce((
   select jsonb_agg(jsonb_build_object(
    'id',so.id,'order_number',so.order_number,'status',so.status,
    'device_type',so.device_type,'device_brand',so.device_brand,'device_model',so.device_model,
    'reported_issue',so.reported_issue,'diagnosis',so.diagnosis,
    'estimated_price',so.estimated_price,'final_price',so.final_price,
    'received_at',so.received_at,'updated_at',so.updated_at,'promised_at',so.promised_at,
    'delivered_at',so.delivered_at,'warranty_started_at',so.warranty_started_at,
    'warranty_expires_at',so.warranty_expires_at,'warranty_days',so.warranty_days,
    'customer_approval_decision',so.customer_approval_decision,
    'customer_approval_at',so.customer_approval_at
   ) order by so.received_at desc)
   from public.service_orders so where so.company_id=t.company_id and so.customer_id=t.customer_id
  ),'[]'::jsonb)
 ) into v_result
 from public.company_customer_portal_tokens t
 join public.companies co on co.id=t.company_id
 join public.customers cu on cu.id=t.customer_id and cu.company_id=t.company_id
 where t.token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex') and t.revoked_at is null;
 return v_result;
end $$;
revoke all on function public.get_company_customer_portal(text) from public;
grant execute on function public.get_company_customer_portal(text) to anon,authenticated;

create or replace function public.respond_company_customer_portal_approval(
 p_token text,p_order_id uuid,p_decision text
) returns jsonb language plpgsql security definer set search_path=public,extensions
as $$
declare v_order public.service_orders%rowtype; v_company uuid; v_customer uuid; v_status text;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou expirado.'; end if;
 if p_decision not in ('approved','rejected') then raise exception 'Resposta inválida.'; end if;
 select company_id,customer_id into v_company,v_customer from public.company_customer_portal_tokens
 where token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex') and revoked_at is null;
 if not found then raise exception 'Link inválido ou expirado.'; end if;
 select * into v_order from public.service_orders
 where id=p_order_id and company_id=v_company and customer_id=v_customer for update;
 if not found then raise exception 'Ordem não encontrada.'; end if;
 if v_order.status<>'waiting_approval' or v_order.customer_approval_decision is not null then
  raise exception 'Esta solicitação não está mais aguardando aprovação.';
 end if;
 v_status:=case when p_decision='approved' then 'approved' else 'rejected' end;
 update public.service_orders set status=v_status,customer_approval_decision=p_decision,
  customer_approval_at=now(),updated_at=now() where id=v_order.id;
 return jsonb_build_object('decision',p_decision,'status',v_status);
end $$;
revoke all on function public.respond_company_customer_portal_approval(text,uuid,text) from public;
grant execute on function public.respond_company_customer_portal_approval(text,uuid,text) to anon,authenticated;
