-- Guarantee parent-to-child restore order for POS commission settlements.
-- This is idempotent and also repairs installations where earlier string replacements
-- did not match pg_get_functiondef whitespace formatting.
do $$
declare
 d text;
begin
 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into d;

 if position(quote_literal('company_pos_sales') in d)=0 then
  if position(quote_literal('company_financial_entries') in d)=0 then
   raise exception 'Could not locate company_financial_entries in backup restore function';
  end if;
  d:=regexp_replace(
   d,
   '''company_financial_entries''',
   quote_literal('company_financial_entries')||','||quote_literal('company_pos_commission_settlements')||','||quote_literal('company_pos_sales')||','||quote_literal('company_pos_sale_items'),
   'g'
  );
 elsif position(quote_literal('company_pos_commission_settlements') in d)=0 then
  d:=regexp_replace(
   d,
   '''company_pos_sales''',
   quote_literal('company_pos_commission_settlements')||','||quote_literal('company_pos_sales'),
   'g'
  );
 end if;

 if position(quote_literal('company_pos_commission_settlements') in d)=0
    or position(quote_literal('company_pos_sales') in d)=0
    or position(quote_literal('company_pos_sale_items') in d)=0 then
  raise exception 'Could not safely establish POS backup restore order';
 end if;
 execute d;
end $$;
