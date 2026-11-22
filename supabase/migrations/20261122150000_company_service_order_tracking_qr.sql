create table if not exists public.company_service_order_tracking_tokens (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 service_order_id uuid not null references public.service_orders(id) on delete cascade,
 token_hash text not null unique,
 expires_at timestamptz not null default (now()+interval '180 days'),
 revoked_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists company_service_order_tracking_token_hash_idx
 on public.company_service_order_tracking_tokens(token_hash) where revoked_at is null;
alter table public.company_service_order_tracking_tokens enable row level security;
revoke all on public.company_service_order_tracking_tokens from anon, authenticated;

create or replace function public.create_company_service_order_tracking_link(p_company_id uuid,p_order_id uuid)
returns text language plpgsql security definer set search_path=public,extensions as $$
declare v_token text;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.company_members cm where cm.company_id=p_company_id and cm.user_id=auth.uid()) then raise exception 'Not authorized for this company'; end if;
 if not exists(select 1 from public.service_orders so where so.id=p_order_id and so.company_id=p_company_id) then raise exception 'Service order not found'; end if;
 update public.company_service_order_tracking_tokens set revoked_at=now() where company_id=p_company_id and service_order_id=p_order_id and revoked_at is null;
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.company_service_order_tracking_tokens(company_id,service_order_id,token_hash,created_by)
 values(p_company_id,p_order_id,encode(digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),auth.uid());
 return v_token;
end $$;

create or replace function public.get_company_service_order_tracking(p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare v_result jsonb;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select jsonb_build_object('company_name',c.name,'order_number',so.order_number,'status',so.status,'device_type',so.device_type,'device_brand',so.device_brand,'device_model',so.device_model,'received_at',so.received_at,'updated_at',so.updated_at,'promised_at',so.promised_at)
 into v_result
 from public.company_service_order_tracking_tokens t
 join public.service_orders so on so.id=t.service_order_id and so.company_id=t.company_id
 join public.companies c on c.id=so.company_id
 where t.token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex') and t.revoked_at is null and t.expires_at>now();
 return v_result;
end $$;
revoke all on function public.create_company_service_order_tracking_link(uuid,uuid) from public,anon;
grant execute on function public.create_company_service_order_tracking_link(uuid,uuid) to authenticated;
revoke all on function public.get_company_service_order_tracking(text) from public;
grant execute on function public.get_company_service_order_tracking(text) to anon,authenticated;
