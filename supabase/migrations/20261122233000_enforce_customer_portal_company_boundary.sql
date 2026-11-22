-- Enforce tenant ownership at the database level for customer portal tokens.
-- The RPC also checks membership and customer ownership; this composite FK
-- prevents a token row from ever pairing one company's ID with another company's customer.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'company_customer_portal_tokens_customer_company_fkey'
      and conrelid = 'public.company_customer_portal_tokens'::regclass
  ) then
    alter table public.company_customer_portal_tokens
      add constraint company_customer_portal_tokens_customer_company_fkey
      foreign key (customer_id, company_id)
      references public.customers(id, company_id)
      on delete cascade;
  end if;
end $$;

create index if not exists company_customer_portal_tokens_company_customer_idx
  on public.company_customer_portal_tokens(company_id, customer_id)
  where revoked_at is null;
