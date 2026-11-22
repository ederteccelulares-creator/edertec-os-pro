-- Edertec OS Pro - prevent cross-tenant record reassignment
-- Apply after 0013_service_order_write_hardening.sql.

-- Organization ownership is immutable for customer and device records.
-- Device ownership is also immutable to preserve the historical customer/device
-- relationship referenced by service orders.
create or replace function public.prevent_tenant_record_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Record identifiers are immutable';
  end if;

  if new.organization_id is distinct from old.organization_id then
    raise exception 'A record cannot be moved between organizations';
  end if;

  if tg_table_name = 'devices'
     and new.customer_id is distinct from old.customer_id then
    raise exception 'A device cannot be reassigned to another customer';
  end if;

  return new;
end;
$$;

drop trigger if exists customers_prevent_tenant_reassignment on public.customers;
create trigger customers_prevent_tenant_reassignment
before update on public.customers
for each row execute function public.prevent_tenant_record_reassignment();

drop trigger if exists devices_prevent_tenant_reassignment on public.devices;
create trigger devices_prevent_tenant_reassignment
before update on public.devices
for each row execute function public.prevent_tenant_record_reassignment();

-- Service orders must be created through create_service_order_with_device(),
-- which validates organization, branch and customer and writes the audit trail.
drop policy if exists "Staff create orders" on public.service_orders;

revoke all on function public.prevent_tenant_record_reassignment() from public, anon, authenticated;
