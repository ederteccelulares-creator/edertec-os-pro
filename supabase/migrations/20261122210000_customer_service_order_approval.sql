alter table public.service_orders
  add column if not exists customer_approval_decision text,
  add column if not exists customer_approval_at timestamptz,
  add column if not exists customer_approval_note text;

alter table public.service_orders
  drop constraint if exists service_orders_status_check;

alter table public.service_orders
  add constraint service_orders_status_check
  check (status = any (array['received','diagnosis','waiting_approval','approved','in_repair','waiting_parts','ready','delivered','cancelled','rejected']::text[]));

create or replace function public.respond_company_service_order_approval(
  p_token text,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_order public.service_orders%rowtype;
  v_status text;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Link inválido ou expirado.';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Resposta inválida.';
  end if;
  select so.* into v_order
  from public.company_service_order_tracking_tokens t
  join public.service_orders so on so.id=t.service_order_id and so.company_id=t.company_id
  where t.token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and t.revoked_at is null and t.expires_at>now()
  for update of so;
  if not found then raise exception 'Link inválido ou expirado.'; end if;
  if v_order.status <> 'waiting_approval' or v_order.customer_approval_decision is not null then
    raise exception 'Esta solicitação não está mais aguardando aprovação.';
  end if;
  v_status := case when p_decision='approved' then 'approved' else 'rejected' end;
  update public.service_orders
  set status=v_status, customer_approval_decision=p_decision,
      customer_approval_at=now(),
      customer_approval_note=nullif(left(trim(coalesce(p_note,'')),500),''),
      updated_at=now()
  where id=v_order.id and company_id=v_order.company_id;
  return jsonb_build_object('decision',p_decision,'status',v_status,'approved_at',now());
end
$function$;

revoke all on function public.respond_company_service_order_approval(text,text,text) from public;
grant execute on function public.respond_company_service_order_approval(text,text,text) to anon, authenticated;

create or replace function public.get_company_service_order_tracking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare v_result jsonb;
begin
 if p_token is null or length(p_token)<>64 or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select jsonb_build_object(
   'company_name',c.name,'order_number',so.order_number,'status',so.status,
   'device_type',so.device_type,'device_brand',so.device_brand,'device_model',so.device_model,
   'received_at',so.received_at,'updated_at',so.updated_at,'promised_at',so.promised_at,
   'customer_approval_decision',so.customer_approval_decision,
   'customer_approval_at',so.customer_approval_at,'customer_approval_note',so.customer_approval_note
 ) into v_result
 from public.company_service_order_tracking_tokens t
 join public.service_orders so on so.id=t.service_order_id and so.company_id=t.company_id
 join public.companies c on c.id=so.company_id
 where t.token_hash=encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
   and t.revoked_at is null and t.expires_at>now();
 return v_result;
end
$function$;
