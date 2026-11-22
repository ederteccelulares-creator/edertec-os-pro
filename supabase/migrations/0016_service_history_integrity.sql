-- EDERTEC OS PRO - preserve tenant boundaries and historical relationships
-- Apply after 0015_operational_tenant_key_hardening.sql.
-- Existing records are not modified.

create or replace function public.prevent_service_history_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'Service history identity and organization are immutable';
  end if;

  if tg_table_name = 'service_order_events' then
    if new.service_order_id is distinct from old.service_order_id
       or new.changed_by is distinct from old.changed_by then
      raise exception 'Service order events cannot be reassigned';
    end if;
  elsif tg_table_name = 'service_order_lines' then
    if new.service_order_id is distinct from old.service_order_id
       or new.branch_id is distinct from old.branch_id
       or new.service_id is distinct from old.service_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Service order lines cannot be reassigned';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists service_order_events_prevent_reassignment on public.service_order_events;
create trigger service_order_events_prevent_reassignment
before update on public.service_order_events
for each row execute function public.prevent_service_history_reassignment();

drop trigger if exists service_order_lines_prevent_reassignment on public.service_order_lines;
create trigger service_order_lines_prevent_reassignment
before update on public.service_order_lines
for each row execute function public.prevent_service_history_reassignment();

drop trigger if exists service_catalog_prevent_tenant_key_changes on public.service_catalog;
create trigger service_catalog_prevent_tenant_key_changes
before update on public.service_catalog
for each row execute function public.prevent_tenant_key_changes();

revoke all on function public.prevent_service_history_reassignment() from public, anon, authenticated;
