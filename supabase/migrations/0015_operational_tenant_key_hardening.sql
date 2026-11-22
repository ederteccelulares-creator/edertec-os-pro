-- Edertec OS Pro - immutable tenant keys across operational tables
-- Apply after 0014_tenant_record_immutability.sql.

create or replace function public.prevent_tenant_key_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'Record identifiers are immutable';
  end if;

  if to_jsonb(new) ? 'organization_id'
     and to_jsonb(new)->>'organization_id' is distinct from to_jsonb(old)->>'organization_id' then
    raise exception 'A record cannot be moved between organizations';
  end if;

  if tg_table_name = 'branch_inventory' and (
    new.branch_id is distinct from old.branch_id or new.item_id is distinct from old.item_id
  ) then
    raise exception 'Stock records cannot be reassigned to another branch or product';
  end if;

  return new;
end;
$$;

drop trigger if exists branches_prevent_tenant_key_changes on public.branches;
create trigger branches_prevent_tenant_key_changes
before update on public.branches
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists inventory_items_prevent_tenant_key_changes on public.inventory_items;
create trigger inventory_items_prevent_tenant_key_changes
before update on public.inventory_items
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists financial_categories_prevent_tenant_key_changes on public.financial_categories;
create trigger financial_categories_prevent_tenant_key_changes
before update on public.financial_categories
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists financial_entries_prevent_tenant_key_changes on public.financial_entries;
create trigger financial_entries_prevent_tenant_key_changes
before update on public.financial_entries
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists branch_inventory_prevent_tenant_key_changes on public.branch_inventory;
create trigger branch_inventory_prevent_tenant_key_changes
before update on public.branch_inventory
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists sales_prevent_tenant_key_changes on public.sales;
create trigger sales_prevent_tenant_key_changes
before update on public.sales
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists sale_items_prevent_tenant_key_changes on public.sale_items;
create trigger sale_items_prevent_tenant_key_changes
before update on public.sale_items
for each row execute function public.prevent_tenant_key_changes();

drop trigger if exists stock_movements_prevent_tenant_key_changes on public.stock_movements;
create trigger stock_movements_prevent_tenant_key_changes
before update on public.stock_movements
for each row execute function public.prevent_tenant_key_changes();

revoke all on function public.prevent_tenant_key_changes() from public, anon, authenticated;
