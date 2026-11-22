create or replace function public.guard_service_order_financial_fields()
returns trigger language plpgsql set search_path to ''
as $$
declare v_role text;
begin
  if auth.uid() is null then
    if current_user in ('postgres','service_role') then return new; end if;
    raise exception 'Authentication required';
  end if;
  select cm.role into v_role from public.company_members cm
  where cm.company_id=new.company_id and cm.user_id=auth.uid() and cm.is_active=true;
  if v_role is null then raise exception 'Active company membership required'; end if;
  if v_role in ('owner','admin','manager') then return new; end if;
  if tg_op='INSERT' then
    if coalesce(new.estimated_price,0)<>0 or coalesce(new.final_price,0)<>0 then
      raise exception 'Only company management can set service order prices';
    end if;
    return new;
  end if;
  if new.estimated_price is distinct from old.estimated_price
    or new.final_price is distinct from old.final_price
    or new.warranty_started_at is distinct from old.warranty_started_at
    or new.warranty_expires_at is distinct from old.warranty_expires_at
    or new.warranty_days is distinct from old.warranty_days
    or new.customer_approval_decision is distinct from old.customer_approval_decision
    or new.customer_approval_at is distinct from old.customer_approval_at
    or new.customer_approval_note is distinct from old.customer_approval_note then
    raise exception 'Only company management or the customer approval portal can change financial and warranty fields';
  end if;
  if v_role='attendant' and (
    new.diagnosis is distinct from old.diagnosis or new.status is distinct from old.status
    or new.assigned_employee_id is distinct from old.assigned_employee_id
  ) then raise exception 'Attendants cannot change diagnosis, technical status or technician assignment'; end if;
  return new;
end;
$$;

drop trigger if exists guard_service_order_financial_fields on public.service_orders;
create trigger guard_service_order_financial_fields
before insert or update on public.service_orders
for each row execute function public.guard_service_order_financial_fields();
