-- Per-organization WhatsApp destination settings and delivery audit.
create table public.organization_whatsapp_alert_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  recipient_phone text not null,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint organization_whatsapp_phone_digits check (recipient_phone ~ '^[0-9]{10,15}$')
);

alter table public.organization_whatsapp_alert_settings enable row level security;
revoke all on public.organization_whatsapp_alert_settings from public, anon, authenticated;

create table public.whatsapp_notification_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  service_order_id uuid not null,
  recipient_phone text not null,
  notification_type text not null check (notification_type in ('quote_approved','quote_declined')),
  delivery_status text not null check (delivery_status in ('sent','failed','skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  foreign key (service_order_id, organization_id)
    references public.service_orders(id, organization_id) on delete cascade
);
alter table public.whatsapp_notification_logs enable row level security;
revoke all on public.whatsapp_notification_logs from public, anon, authenticated;

create or replace function public.get_service_order_whatsapp_settings(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_settings public.organization_whatsapp_alert_settings;
begin
  if auth.uid() is null or not public.has_org_role(
    p_organization_id, array['owner','admin']::public.member_role[]
  ) then
    raise exception 'Only organization owners or admins can view WhatsApp settings';
  end if;
  select * into v_settings
  from public.organization_whatsapp_alert_settings
  where organization_id = p_organization_id;
  if not found then
    return jsonb_build_object('recipient_phone','','enabled',false);
  end if;
  return jsonb_build_object('recipient_phone',v_settings.recipient_phone,'enabled',v_settings.enabled);
end;
$$;

create or replace function public.save_service_order_whatsapp_settings(
  p_organization_id uuid,
  p_recipient_phone text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_phone text;
begin
  if auth.uid() is null or not public.has_org_role(
    p_organization_id, array['owner','admin']::public.member_role[]
  ) then
    raise exception 'Only organization owners or admins can change WhatsApp settings';
  end if;
  v_phone := regexp_replace(coalesce(p_recipient_phone,''), '[^0-9]', '', 'g');
  if length(v_phone) < 10 or length(v_phone) > 15 then
    raise exception 'Informe um telefone com código do país e DDD, entre 10 e 15 dígitos';
  end if;
  insert into public.organization_whatsapp_alert_settings(
    organization_id, recipient_phone, enabled, updated_by, updated_at
  ) values (
    p_organization_id, v_phone, coalesce(p_enabled,false), auth.uid(), now()
  )
  on conflict (organization_id) do update
    set recipient_phone = excluded.recipient_phone,
        enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.audit_logs(organization_id, actor_id, action, entity, metadata)
  values (
    p_organization_id, auth.uid(), 'whatsapp_alert_settings.updated',
    'organization_whatsapp_alert_settings',
    jsonb_build_object('enabled',coalesce(p_enabled,false),'phone_last_four',right(v_phone,4))
  );
  return jsonb_build_object('recipient_phone',v_phone,'enabled',coalesce(p_enabled,false));
end;
$$;

revoke all on function public.get_service_order_whatsapp_settings(uuid) from public, anon;
grant execute on function public.get_service_order_whatsapp_settings(uuid) to authenticated;
revoke all on function public.save_service_order_whatsapp_settings(uuid,text,boolean) from public, anon;
grant execute on function public.save_service_order_whatsapp_settings(uuid,text,boolean) to authenticated;

-- This narrowly scoped lookup is callable only by the Edge Function service role.
create or replace function public.get_service_order_whatsapp_target(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_result jsonb;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select jsonb_build_object(
    'organization_id', so.organization_id,
    'branch_id', so.branch_id,
    'service_order_id', so.id,
    'organization_name', org.name,
    'order_number', so.order_number,
    'customer_name', customer.name,
    'recipient_phone', settings.recipient_phone,
    'enabled', settings.enabled
  ) into v_result
  from public.service_order_portal_tokens token
  join public.service_orders so
    on so.id = token.service_order_id
   and so.organization_id = token.organization_id
   and so.branch_id = token.branch_id
   and so.customer_id = token.customer_id
  join public.organizations org on org.id = so.organization_id
  join public.customers customer
    on customer.id = token.customer_id and customer.organization_id = token.organization_id
  left join public.organization_whatsapp_alert_settings settings
    on settings.organization_id = so.organization_id
  where token.token_hash = encode(digest(convert_to(p_token,'UTF8'),'sha256'),'hex')
    and token.revoked_at is null
    and token.expires_at > now();
  return v_result;
end;
$$;
revoke all on function public.get_service_order_whatsapp_target(text) from public, anon, authenticated;
grant execute on function public.get_service_order_whatsapp_target(text) to service_role;


grant insert on public.whatsapp_notification_logs to service_role;
