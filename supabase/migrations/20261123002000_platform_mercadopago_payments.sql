create table if not exists public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  provider_preference_id text,
  provider_payment_id text,
  external_reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','refunded','charged_back')),
  checkout_url text,
  paid_at timestamptz,
  raw_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists platform_payments_provider_payment_uidx
  on public.platform_payments(provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists platform_payments_company_created_idx
  on public.platform_payments(company_id, created_at desc);
alter table public.platform_payments enable row level security;
revoke all on public.platform_payments from anon, authenticated;
grant all on public.platform_payments to service_role;
comment on table public.platform_payments is 'Registros privados de cobrança da plataforma Edertec OS Pro; acessíveis somente pelo backend.';
