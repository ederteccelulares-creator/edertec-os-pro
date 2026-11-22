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
   'reported_issue',so.reported_issue,'diagnosis',so.diagnosis,
   'estimated_price',so.estimated_price,'final_price',so.final_price,
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
