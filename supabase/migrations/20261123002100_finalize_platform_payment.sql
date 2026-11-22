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
  select * into v_payment
    from public.platform_payments
    where id = p_payment_id
    for update;
  if not found then return false; end if;

  if v_payment.status = 'approved' then
    return true;
  end if;

  update public.platform_payments
    set provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
        status = p_status,
        raw_status = p_raw_status,
        paid_at = case when p_status = 'approved' then v_now else paid_at end,
        updated_at = v_now
    where id = p_payment_id;

  if p_status <> 'approved' then return true; end if;

  select * into v_plan from public.subscription_plans where id = v_payment.plan_id and is_active = true;
  if not found then raise exception 'Plan is unavailable'; end if;

  v_end := case v_plan.billing_interval
    when 'monthly' then v_now + interval '1 month'
    when 'six_months' then v_now + interval '6 months'
    when 'yearly' then v_now + interval '1 year'
    when 'lifetime' then null
    else null
  end;

  insert into public.company_subscriptions
    (company_id, plan_id, status, starts_at, ends_at, trial_ends_at, external_reference)
  values
    (v_payment.company_id, v_payment.plan_id, 'active', v_now, v_end, null, v_payment.external_reference);

  return true;
end;
$$;

revoke all on function public.finalize_platform_payment(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finalize_platform_payment(uuid,text,text,text) to service_role;
