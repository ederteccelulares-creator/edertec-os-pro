alter table public.service_orders
  add column if not exists warranty_started_at timestamptz,
  add column if not exists warranty_expires_at timestamptz,
  add column if not exists warranty_days integer;

create or replace function public.set_service_order_warranty_on_delivery()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    new.delivered_at := coalesce(new.delivered_at, now());
    new.warranty_days := 90;
    new.warranty_started_at := now();
    new.warranty_expires_at := now() + interval '90 days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_service_order_warranty_on_delivery on public.service_orders;
create trigger trg_service_order_warranty_on_delivery
before update of status on public.service_orders
for each row
execute function public.set_service_order_warranty_on_delivery();
