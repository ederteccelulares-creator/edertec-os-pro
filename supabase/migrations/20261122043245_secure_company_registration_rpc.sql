-- Company creation is an authenticated onboarding operation only.
revoke all on function public.register_company(text,text,text) from public,anon;
grant execute on function public.register_company(text,text,text) to authenticated;
