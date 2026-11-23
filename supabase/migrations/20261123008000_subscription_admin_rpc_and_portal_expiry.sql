-- Apply customer portal expiry after the portal token table exists.
alter table public.company_customer_portal_tokens
  add column if not exists expires_at timestamptz not null default (now() + interval '365 days');

create index if not exists company_customer_portal_tokens_active_expiry_idx
  on public.company_customer_portal_tokens(company_id,customer_id,expires_at)
  where revoked_at is null;

-- Centralize Super Admin subscription changes behind a checked SECURITY DEFINER RPC.
create or replace function public.admin_set_company_subscription(
  p_company_id uuid,
  p_plan_id uuid,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso negado: somente Super Admin pode alterar assinaturas.';
  end if;
  if p_status not in ('trial','active','past_due','cancelled','expired') then
    raise exception 'Status de assinatura inválido.';
  end if;
  if p_company_id is null or p_plan_id is null or p_starts_at is null then
    raise exception 'Empresa, plano e início da assinatura são obrigatórios.';
  end if;
  if not exists(select 1 from public.companies where id=p_company_id) then
    raise exception 'Empresa não encontrada.';
  end if;
  if not exists(select 1 from public.subscription_plans where id=p_plan_id) then
    raise exception 'Plano não encontrado.';
  end if;
  select id into v_id from public.company_subscriptions
   where company_id=p_company_id order by created_at desc,id desc limit 1;
  if v_id is null then
    insert into public.company_subscriptions(company_id,plan_id,status,starts_at,ends_at,trial_ends_at)
    values(p_company_id,p_plan_id,p_status,p_starts_at,p_ends_at,
      case when p_status='trial' then p_ends_at else null end)
    returning id into v_id;
  else
    update public.company_subscriptions
       set plan_id=p_plan_id,status=p_status,starts_at=p_starts_at,ends_at=p_ends_at,
           trial_ends_at=case when p_status='trial' then p_ends_at else null end
     where id=v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_set_company_subscription(uuid,uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_set_company_subscription(uuid,uuid,text,timestamptz,timestamptz) to authenticated;
