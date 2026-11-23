-- Harden public token-gated portal RPCs after all portal functions have been created.
alter function public.get_company_customer_portal(text) set search_path = '';
alter function public.get_company_service_order_tracking(text) set search_path = '';
alter function public.respond_company_customer_portal_approval(text,uuid,text) set search_path = '';
alter function public.respond_company_service_order_approval(text,text,text) set search_path = '';
