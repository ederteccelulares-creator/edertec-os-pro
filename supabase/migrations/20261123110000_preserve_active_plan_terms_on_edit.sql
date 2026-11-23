-- Preserve commercial terms for customers who already paid for an active plan.
-- Editing a plan creates a new version; the referenced historical plan remains unchanged.
create or replace function public.admin_create_plan_version(
  p_plan_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_price numeric,
  p_billing_interval text,
  p_max_branches integer,
  p_max_users integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.subscription_plans%rowtype;
  v_new_id uuid;
  v_code text;
  v_suffix integer := 2;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Somente Super Admin pode editar planos.';
  end if;
  if p_plan_id is null or nullif(pg_catalog.btrim(coalesce(p_code,'')),'') is null
     or nullif(pg_catalog.btrim(coalesce(p_name,'')),'') is null
     or p_price is null or p_price < 0
     or p_billing_interval not in ('monthly','six_months','yearly','lifetime')
     or (p_max_branches is not null and p_max_branches < 1)
     or (p_max_users is not null and p_max_users < 1) then
    raise exception 'Confira os dados e limites do plano.';
  end if;

  select * into v_old
    from public.subscription_plans
    where id = p_plan_id
    for update;
  if not found then raise exception 'Plano não encontrado.'; end if;

  v_code := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_code),'[^a-zA-Z0-9_-]','-','g'));
  if v_code = v_old.code or exists(select 1 from public.subscription_plans where code=v_code) then
    v_code := pg_catalog.left(v_code, 80) || '-v' || v_suffix::text;
    while exists(select 1 from public.subscription_plans where code=v_code) loop
      v_suffix := v_suffix + 1;
      v_code := pg_catalog.left(pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(p_code),'[^a-zA-Z0-9_-]','-','g')),80) || '-v' || v_suffix::text;
    end loop;
  end if;

  insert into public.subscription_plans
    (code,name,description,price,billing_interval,max_branches,max_users,features,is_active)
  values
    (v_code,pg_catalog.btrim(p_name),nullif(pg_catalog.btrim(coalesce(p_description,'')),''),
     p_price,p_billing_interval,p_max_branches,p_max_users,v_old.features,true)
  returning id into v_new_id;

  -- Only stop new purchases on the old version. Do not change its price, limits,
  -- billing interval, or any existing company_subscriptions rows.
  update public.subscription_plans set is_active=false where id=v_old.id;
  return v_new_id;
end;
$$;

revoke all on function public.admin_create_plan_version(uuid,text,text,text,numeric,text,integer,integer) from public, anon;
grant execute on function public.admin_create_plan_version(uuid,text,text,text,numeric,text,integer,integer) to authenticated;

-- A checkout created before a plan edit must still honor the terms captured by its payment record.
create or replace function public.finalize_platform_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_status text,
  p_raw_status text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.platform_payments%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_end timestamptz;
begin
  if p_status not in ('approved','rejected','cancelled','refunded','charged_back','pending') then
    raise exception 'Invalid payment status';
  end if;
  select * into v_payment from public.platform_payments where id=p_payment_id for update;
  if not found then return false; end if;
  if v_payment.status='approved' then return true; end if;

  update public.platform_payments
     set provider_payment_id=coalesce(p_provider_payment_id,provider_payment_id),
         status=p_status,raw_status=p_raw_status,
         paid_at=case when p_status='approved' then v_now else paid_at end,
         updated_at=v_now
   where id=p_payment_id;
  if p_status<>'approved' then return true; end if;

  -- Do not require is_active here: this payment references the exact plan version
  -- selected when checkout was created, which may since have been archived.
  select * into v_plan from public.subscription_plans where id=v_payment.plan_id;
  if not found then raise exception 'Plan version for this payment was not found'; end if;

  v_end := case v_plan.billing_interval
    when 'monthly' then v_now + interval '1 month'
    when 'six_months' then v_now + interval '6 months'
    when 'yearly' then v_now + interval '1 year'
    when 'lifetime' then null
    else null
  end;

  insert into public.company_subscriptions
    (company_id,plan_id,status,starts_at,ends_at,trial_ends_at,external_reference)
  values
    (v_payment.company_id,v_payment.plan_id,'active',v_now,v_end,null,v_payment.external_reference);
  return true;
end;
$$;
revoke all on function public.finalize_platform_payment(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finalize_platform_payment(uuid,text,text,text) to service_role;
