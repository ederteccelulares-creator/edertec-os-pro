create table if not exists public.company_welcome_emails (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 recipient_email text not null,
 status text not null default 'sending' check (status in ('sending','sent')),
 provider_message_id text,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 unique(company_id,user_id)
);
alter table public.company_welcome_emails enable row level security;
revoke all on public.company_welcome_emails from anon, authenticated, public;
grant select,insert,update,delete on public.company_welcome_emails to service_role;
