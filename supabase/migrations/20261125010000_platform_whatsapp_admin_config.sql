create table if not exists public.platform_whatsapp_config (
  id boolean primary key default true check (id = true),
  app_id text,
  phone_number_id text,
  waba_id text,
  app_secret_secret_id uuid,
  access_token_secret_id uuid,
  verify_token_secret_id uuid,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.platform_whatsapp_config enable row level security;
revoke all on public.platform_whatsapp_config from public, anon, authenticated;
grant all on public.platform_whatsapp_config to service_role;

create or replace function public.save_platform_whatsapp_config(
  p_user_id uuid,p_app_id text,p_phone_number_id text,p_waba_id text,
  p_app_secret text,p_access_token text,p_verify_token text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_config public.platform_whatsapp_config%rowtype;
  v_app_secret_id uuid; v_access_id uuid; v_verify_id uuid;
begin
  if not exists(select 1 from public.platform_admins where user_id=p_user_id) then raise exception 'Platform administrator required'; end if;
  select * into v_config from public.platform_whatsapp_config where id=true for update;
  v_app_secret_id:=v_config.app_secret_secret_id; v_access_id:=v_config.access_token_secret_id; v_verify_id:=v_config.verify_token_secret_id;
  if coalesce(trim(p_app_secret),'')<>'' then
    if length(trim(p_app_secret))<20 then raise exception 'Invalid Meta App Secret'; end if;
    if v_app_secret_id is null then v_app_secret_id:=vault.create_secret(trim(p_app_secret),'meta_app_secret','Meta App Secret for Edertec OS Pro');
    else perform vault.update_secret(v_app_secret_id,trim(p_app_secret),'meta_app_secret','Meta App Secret for Edertec OS Pro'); end if;
  end if;
  if coalesce(trim(p_access_token),'')<>'' then
    if length(trim(p_access_token))<20 then raise exception 'Invalid WhatsApp access token'; end if;
    if v_access_id is null then v_access_id:=vault.create_secret(trim(p_access_token),'meta_whatsapp_access_token','WhatsApp Cloud API access token');
    else perform vault.update_secret(v_access_id,trim(p_access_token),'meta_whatsapp_access_token','WhatsApp Cloud API access token'); end if;
  end if;
  if coalesce(trim(p_verify_token),'')<>'' then
    if length(trim(p_verify_token))<24 then raise exception 'Verify token must contain at least 24 characters'; end if;
    if v_verify_id is null then v_verify_id:=vault.create_secret(trim(p_verify_token),'meta_whatsapp_verify_token','WhatsApp webhook verification token');
    else perform vault.update_secret(v_verify_id,trim(p_verify_token),'meta_whatsapp_verify_token','WhatsApp webhook verification token'); end if;
  end if;
  insert into public.platform_whatsapp_config(id,app_id,phone_number_id,waba_id,app_secret_secret_id,access_token_secret_id,verify_token_secret_id,updated_by,updated_at)
  values(true,nullif(trim(p_app_id),''),nullif(trim(p_phone_number_id),''),nullif(trim(p_waba_id),''),v_app_secret_id,v_access_id,v_verify_id,p_user_id,now())
  on conflict(id) do update set app_id=coalesce(nullif(trim(excluded.app_id),''),platform_whatsapp_config.app_id),
    phone_number_id=coalesce(nullif(trim(excluded.phone_number_id),''),platform_whatsapp_config.phone_number_id),
    waba_id=coalesce(nullif(trim(excluded.waba_id),''),platform_whatsapp_config.waba_id),
    app_secret_secret_id=coalesce(excluded.app_secret_secret_id,platform_whatsapp_config.app_secret_secret_id),
    access_token_secret_id=coalesce(excluded.access_token_secret_id,platform_whatsapp_config.access_token_secret_id),
    verify_token_secret_id=coalesce(excluded.verify_token_secret_id,platform_whatsapp_config.verify_token_secret_id),
    updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('saved',true);
end; $$;

create or replace function public.get_platform_whatsapp_config_status()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('app_id',app_id,'phone_number_id',phone_number_id,'waba_id',waba_id,
    'app_secret_configured',app_secret_secret_id is not null,'access_token_configured',access_token_secret_id is not null,
    'verify_token_configured',verify_token_secret_id is not null,'updated_at',updated_at,
    'callback_url','https://btouoeftgatyrvuobicr.supabase.co/functions/v1/whatsapp-webhook')
  from public.platform_whatsapp_config where id=true
  union all select jsonb_build_object('app_secret_configured',false,'access_token_configured',false,
    'verify_token_configured',false,'callback_url','https://btouoeftgatyrvuobicr.supabase.co/functions/v1/whatsapp-webhook')
  where not exists(select 1 from public.platform_whatsapp_config where id=true) limit 1;
$$;

create or replace function public.get_platform_whatsapp_secrets()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('app_secret',(select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id=c.app_secret_secret_id),
    'access_token',(select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id=c.access_token_secret_id),
    'verify_token',(select ds.decrypted_secret from vault.decrypted_secrets ds where ds.id=c.verify_token_secret_id),
    'app_id',c.app_id,'phone_number_id',c.phone_number_id,'waba_id',c.waba_id)
  from public.platform_whatsapp_config c where c.id=true;
$$;

revoke all on function public.save_platform_whatsapp_config(uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.get_platform_whatsapp_config_status() from public,anon,authenticated;
revoke all on function public.get_platform_whatsapp_secrets() from public,anon,authenticated;
grant execute on function public.save_platform_whatsapp_config(uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.get_platform_whatsapp_config_status() to service_role;
grant execute on function public.get_platform_whatsapp_secrets() to service_role;
