create table if not exists public.platform_billing_config (
  id boolean primary key default true check (id = true),
  access_token_secret_id uuid,
  webhook_secret_id uuid,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.platform_billing_config enable row level security;
revoke all on public.platform_billing_config from anon, authenticated;
grant all on public.platform_billing_config to service_role;

create or replace function public.save_platform_billing_secrets(
  p_user_id uuid,
  p_access_token text,
  p_webhook_secret text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_config public.platform_billing_config%rowtype;
  v_access_id uuid;
  v_webhook_id uuid;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_user_id) then
    raise exception 'Platform administrator required';
  end if;
  if coalesce(length(trim(p_access_token)),0)<20 or coalesce(length(trim(p_webhook_secret)),0)<12 then
    raise exception 'Invalid Mercado Pago credentials';
  end if;
  select * into v_config from public.platform_billing_config where id=true for update;
  if not found then
    v_access_id := vault.create_secret(trim(p_access_token),'mercadopago_access_token','Mercado Pago access token for Edertec OS Pro');
    v_webhook_id := vault.create_secret(trim(p_webhook_secret),'mercadopago_webhook_secret','Mercado Pago webhook signature secret');
    insert into public.platform_billing_config(id,access_token_secret_id,webhook_secret_id,updated_by)
    values(true,v_access_id,v_webhook_id,p_user_id);
  else
    v_access_id := v_config.access_token_secret_id;
    v_webhook_id := v_config.webhook_secret_id;
    perform vault.update_secret(v_access_id,trim(p_access_token),'mercadopago_access_token','Mercado Pago access token for Edertec OS Pro');
    perform vault.update_secret(v_webhook_id,trim(p_webhook_secret),'mercadopago_webhook_secret','Mercado Pago webhook signature secret');
    update public.platform_billing_config set updated_by=p_user_id,updated_at=now() where id=true;
  end if;
  return jsonb_build_object('configured',true);
end;
$$;

create or replace function public.get_platform_billing_secrets()
returns jsonb
language sql security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'access_token',(select ds.decrypted_secret from vault.decrypted_secrets ds join public.platform_billing_config c on c.access_token_secret_id=ds.id where c.id=true),
    'webhook_secret',(select ds.decrypted_secret from vault.decrypted_secrets ds join public.platform_billing_config c on c.webhook_secret_id=ds.id where c.id=true)
  );
$$;

create or replace function public.get_platform_billing_config_status()
returns jsonb
language sql security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'access_token_configured',access_token_secret_id is not null,
    'webhook_secret_configured',webhook_secret_id is not null,
    'updated_at',updated_at
  ) from public.platform_billing_config where id=true;
$$;

revoke all on function public.save_platform_billing_secrets(uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_platform_billing_secrets() from public,anon,authenticated;
revoke all on function public.get_platform_billing_config_status() from public,anon,authenticated;
grant execute on function public.save_platform_billing_secrets(uuid,text,text) to service_role;
grant execute on function public.get_platform_billing_secrets() to service_role;
grant execute on function public.get_platform_billing_config_status() to service_role;
