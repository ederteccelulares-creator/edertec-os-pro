revoke all on public.company_financial_accounts from anon;
grant select,insert,update on public.company_financial_accounts to authenticated;
grant all on public.company_financial_accounts to service_role;