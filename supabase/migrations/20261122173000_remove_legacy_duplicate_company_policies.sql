-- Remove obsolete policies left by earlier iterations; retain the current role-aware policies.
drop policy if exists "active members read branches" on public.branches;
drop policy if exists "management roles manage branches" on public.branches;
drop policy if exists "active members read customers" on public.customers;
drop policy if exists "customer desk roles insert customers" on public.customers;
drop policy if exists "customer desk roles update customers" on public.customers;
drop policy if exists "management roles delete customers" on public.customers;
drop policy if exists "active members read service catalog" on public.service_catalog;
drop policy if exists "management roles manage service catalog" on public.service_catalog;
drop policy if exists "active members read order items" on public.service_order_items;
drop policy if exists "technical roles insert order items" on public.service_order_items;
drop policy if exists "technical roles update order items" on public.service_order_items;
drop policy if exists "management roles delete order items" on public.service_order_items;
drop policy if exists "active members read service orders" on public.service_orders;
drop policy if exists "active operational roles create service orders" on public.service_orders;
drop policy if exists "active operational roles update service orders" on public.service_orders;
drop policy if exists "management roles delete service orders" on public.service_orders;
