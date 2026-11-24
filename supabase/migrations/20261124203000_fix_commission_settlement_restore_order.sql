-- Ensure commission settlement rows are restored before the sales that reference them.
do $$
declare
 d text;
 old_order text;
 new_order text;
begin
 select pg_get_functiondef('public.restore_company_backup(uuid,uuid,uuid,jsonb)'::regprocedure) into d;
 old_order:=quote_literal('company_financial_entries')||','||quote_literal('company_pos_sales')||','||quote_literal('company_pos_sale_items');
 new_order:=quote_literal('company_financial_entries')||','||quote_literal('company_pos_commission_settlements')||','||quote_literal('company_pos_sales')||','||quote_literal('company_pos_sale_items');
 if position(old_order in d)>0 then
  d:=replace(d,old_order,new_order);
 elsif position(new_order in d)=0 then
  raise exception 'Could not locate the POS restore order for a safe update';
 end if;
 execute d;
end $$;
