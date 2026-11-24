-- Idempotent production-safe correction for commission settlement backup restore order.
do $$
declare
 d text;
 pattern text;
 replacement text;
begin
 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into d;
 pattern:='''company_financial_entries''[[:space:]]*,[[:space:]]*''company_pos_sales''[[:space:]]*,[[:space:]]*''company_pos_sale_items''';
 replacement:=quote_literal('company_financial_entries')||','||quote_literal('company_pos_commission_settlements')||','||quote_literal('company_pos_sales')||','||quote_literal('company_pos_sale_items');
 if d ~ pattern then
  d:=regexp_replace(d,pattern,replacement,'g');
 elsif position(replacement in d)=0 then
  raise exception 'Could not locate the POS restore order for a safe update';
 end if;
 execute d;
end $$;
