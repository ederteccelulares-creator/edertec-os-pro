-- Harden public token RPCs against object shadowing and enforce token/order tenant consistency.
-- Portal RPCs are introduced by separate migrations; harden only those
-- already present at this point in the migration sequence.
do $migration$
begin
  if to_regprocedure('public.get_company_customer_portal(text)') is not null then
    execute 'alter function public.get_company_customer_portal(text) set search_path = ''''';
  end if;
  if to_regprocedure('public.get_company_service_order_tracking(text)') is not null then
    execute 'alter function public.get_company_service_order_tracking(text) set search_path = ''''';
  end if;
  if to_regprocedure('public.respond_company_customer_portal_approval(text,uuid,text)') is not null then
    execute 'alter function public.respond_company_customer_portal_approval(text,uuid,text) set search_path = ''''';
  end if;
  if to_regprocedure('public.respond_company_service_order_approval(text,text,text)') is not null then
    execute 'alter function public.respond_company_service_order_approval(text,text,text) set search_path = ''''';
  end if;
end
$migration$;

create or replace function public.get_company_customer_portal(p_token text)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_result jsonb;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select jsonb_build_object(
    'company_name', co.name,
    'customer_name', cu.name,
    'customer_phone', cu.phone,
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',so.id,'order_number',so.order_number,'status',so.status,
        'device_type',so.device_type,'device_brand',so.device_brand,'device_model',so.device_model,
        'reported_issue',so.reported_issue,'diagnosis',so.diagnosis,
        'estimated_price',so.estimated_price,'final_price',so.final_price,
        'received_at',so.received_at,'updated_at',so.updated_at,'promised_at',so.promised_at,
        'delivered_at',so.delivered_at,'warranty_started_at',so.warranty_started_at,
        'warranty_expires_at',so.warranty_expires_at,'warranty_days',so.warranty_days,
        'customer_approval_decision',so.customer_approval_decision,'customer_approval_at',so.customer_approval_at
      ) order by so.received_at desc)
      from public.service_orders so
      where so.company_id=t.company_id and so.customer_id=t.customer_id
    ),'[]'::jsonb)
  ) into v_result
  from public.company_customer_portal_tokens t
  join public.companies co on co.id=t.company_id
  join public.customers cu on cu.id=t.customer_id and cu.company_id=t.company_id
  where t.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now();
  return v_result;
end
$function$;

create or replace function public.get_company_service_order_tracking(p_token text)
returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare v_result jsonb;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select jsonb_build_object(
   'company_name',c.name,'order_number',so.order_number,'status',so.status,
   'device_type',so.device_type,'device_brand',so.device_brand,'device_model',so.device_model,
   'reported_issue',so.reported_issue,'diagnosis',so.diagnosis,
   'estimated_price',so.estimated_price,'final_price',so.final_price,
   'received_at',so.received_at,'updated_at',so.updated_at,'promised_at',so.promised_at,
   'customer_approval_decision',so.customer_approval_decision,
   'customer_approval_at',so.customer_approval_at,'customer_approval_note',so.customer_approval_note
 ) into v_result
 from public.company_service_order_tracking_tokens t
 join public.service_orders so on so.id=t.service_order_id and so.company_id=t.company_id
 join public.companies c on c.id=so.company_id
 where t.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
   and t.revoked_at is null and t.expires_at>now();
 return v_result;
end
$function$;

create or replace function public.respond_company_customer_portal_approval(p_token text,p_order_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_order public.service_orders%rowtype; v_company uuid; v_customer uuid; v_status text;
begin
  if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou expirado.'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Resposta inválida.'; end if;
  select company_id,customer_id into v_company,v_customer
  from public.company_customer_portal_tokens
  where token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and revoked_at is null and expires_at>now();
  if not found then raise exception 'Link inválido ou expirado.'; end if;
  select * into v_order from public.service_orders
  where id=p_order_id and company_id=v_company and customer_id=v_customer
  for update;
  if not found then raise exception 'Ordem não encontrada.'; end if;
  if v_order.status<>'waiting_approval' or v_order.customer_approval_decision is not null then
    raise exception 'Esta solicitação não está mais aguardando aprovação.';
  end if;
  v_status:=case when p_decision='approved' then 'approved' else 'rejected' end;
  update public.service_orders
  set status=v_status,customer_approval_decision=p_decision,customer_approval_at=now(),updated_at=now()
  where id=v_order.id and company_id=v_company and customer_id=v_customer;
  return jsonb_build_object('decision',p_decision,'status',v_status);
end
$function$;

create or replace function public.respond_company_service_order_approval(p_token text,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_order public.service_orders%rowtype; v_status text;
begin
  if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido ou expirado.';
  end if;
  if p_decision not in ('approved','rejected') then raise exception 'Resposta inválida.'; end if;
  select so.* into v_order
  from public.company_service_order_tracking_tokens t
  join public.service_orders so on so.id=t.service_order_id and so.company_id=t.company_id
  where t.token_hash=encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now()
  for update of so;
  if not found then raise exception 'Link inválido ou expirado.'; end if;
  if v_order.status<>'waiting_approval' or v_order.customer_approval_decision is not null then
    raise exception 'Esta solicitação não está mais aguardando aprovação.';
  end if;
  v_status:=case when p_decision='approved' then 'approved' else 'rejected' end;
  update public.service_orders
  set status=v_status,customer_approval_decision=p_decision,customer_approval_at=now(),
      customer_approval_note=nullif(left(trim(coalesce(p_note,'')),500),''),
      updated_at=now()
  where id=v_order.id and company_id=v_order.company_id;
  return jsonb_build_object('decision',p_decision,'status',v_status,'approved_at',now());
end
$function$;

alter table public.company_service_order_tracking_tokens
  add constraint tracking_tokens_order_company_fkey
  foreign key (service_order_id,company_id)
  references public.service_orders(id,company_id) on delete cascade;
