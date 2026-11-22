-- Edertec OS Pro - branch-scoped cash flow with audited transactions
-- Apply after migrations 0001 through 0004.

create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  entry_type text not null check (entry_type in ('income','expense')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name, entry_type)
);

create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  category_id uuid,
  entry_type text not null check (entry_type in ('income','expense')),
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  payment_method text not null default 'other' check (payment_method in ('cash','pix','debit_card','credit_card','bank_transfer','boleto','other')),
  status text not null default 'paid' check (status in ('pending','paid','cancelled')),
  due_date date,
  paid_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_entries_branch_fk foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  constraint financial_entries_category_fk foreign key (category_id, organization_id)
    references public.financial_categories(id, organization_id)
);

create index financial_entries_org_branch_date_idx
  on public.financial_entries(organization_id, branch_id, created_at desc);
create index financial_entries_org_branch_status_idx
  on public.financial_entries(organization_id, branch_id, status);

create trigger financial_entries_touch before update on public.financial_entries
for each row execute function public.touch_updated_at();

alter table public.financial_categories enable row level security;
alter table public.financial_entries enable row level security;

create policy "Members read financial categories" on public.financial_categories
  for select to authenticated using (public.is_org_member(organization_id));
create policy "Managers manage financial categories" on public.financial_categories
  for all to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[]));

create policy "Managers read financial entries" on public.financial_entries
  for select to authenticated using (
    public.has_org_role(organization_id, array['owner','admin','manager']::public.member_role[])
  );

create or replace function public.create_financial_entry(
  p_organization_id uuid,
  p_branch_id uuid,
  p_entry_type text,
  p_description text,
  p_amount numeric,
  p_payment_method text default 'other',
  p_status text default 'paid',
  p_due_date date default null,
  p_category_id uuid default null,
  p_notes text default null
)
returns public.financial_entries
language plpgsql security definer set search_path = public
as $$
declare new_entry public.financial_entries;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'You do not have permission to manage finances';
  end if;
  if not exists(select 1 from public.branches where id=p_branch_id and organization_id=p_organization_id and active) then
    raise exception 'Branch not found or inactive';
  end if;
  if p_entry_type not in ('income','expense') then raise exception 'Invalid entry type'; end if;
  if nullif(trim(coalesce(p_description,'')), '') is null then raise exception 'Description is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_payment_method not in ('cash','pix','debit_card','credit_card','bank_transfer','boleto','other') then
    raise exception 'Invalid payment method';
  end if;
  if p_status not in ('pending','paid') then raise exception 'Invalid initial status'; end if;
  if p_category_id is not null and not exists(
    select 1 from public.financial_categories
    where id=p_category_id and organization_id=p_organization_id and entry_type=p_entry_type and active
  ) then raise exception 'Category not found'; end if;

  insert into public.financial_entries(
    organization_id,branch_id,category_id,entry_type,description,amount,payment_method,status,due_date,paid_at,notes,created_by
  ) values (
    p_organization_id,p_branch_id,p_category_id,p_entry_type,trim(p_description),p_amount,p_payment_method,p_status,p_due_date,
    case when p_status='paid' then now() else null end,nullif(trim(coalesce(p_notes,'')),''),auth.uid()
  ) returning * into new_entry;

  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'finance.entry_created','financial_entry',new_entry.id::text,
    jsonb_build_object('branch_id',p_branch_id,'type',p_entry_type,'amount',p_amount,'status',p_status));
  return new_entry;
end;
$$;

create or replace function public.set_financial_entry_status(
  p_organization_id uuid,
  p_branch_id uuid,
  p_entry_id uuid,
  p_status text
)
returns public.financial_entries
language plpgsql security definer set search_path = public
as $$
declare updated_entry public.financial_entries; previous_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.has_org_role(p_organization_id, array['owner','admin','manager']::public.member_role[]) then
    raise exception 'You do not have permission to manage finances';
  end if;
  if p_status not in ('pending','paid','cancelled') then raise exception 'Invalid status'; end if;
  select status into previous_status from public.financial_entries
  where id=p_entry_id and organization_id=p_organization_id and branch_id=p_branch_id for update;
  if not found then raise exception 'Financial entry not found'; end if;
  if previous_status='cancelled' then raise exception 'Cancelled entries cannot be changed'; end if;
  update public.financial_entries set status=p_status,
    paid_at=case when p_status='paid' then coalesce(paid_at,now()) else null end
  where id=p_entry_id returning * into updated_entry;
  insert into public.audit_logs(organization_id,actor_id,action,entity,entity_id,metadata)
  values(p_organization_id,auth.uid(),'finance.entry_status_changed','financial_entry',p_entry_id::text,
    jsonb_build_object('branch_id',p_branch_id,'from',previous_status,'to',p_status));
  return updated_entry;
end;
$$;

revoke all on function public.create_financial_entry(uuid,uuid,text,text,numeric,text,text,date,uuid,text) from public;
revoke all on function public.set_financial_entry_status(uuid,uuid,uuid,text) from public;
grant execute on function public.create_financial_entry(uuid,uuid,text,text,numeric,text,text,date,uuid,text) to authenticated;
grant execute on function public.set_financial_entry_status(uuid,uuid,uuid,text) to authenticated;
