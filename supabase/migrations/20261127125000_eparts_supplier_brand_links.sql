-- Vínculo entre fornecedores e marcas autorizadas no workspace EPARTS.
-- Esta migration precisa existir no repositório para que ambientes limpos apliquem
-- a tabela antes das migrations de atribuição de vendas e leitura do catálogo.

create table if not exists public.eparts_supplier_brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  supplier_id uuid not null,
  brand_id uuid not null,
  created_at timestamptz not null default now(),
  constraint eparts_supplier_brands_supplier_company_fk
    foreign key (supplier_id, company_id)
    references public.eparts_suppliers(id, company_id) on delete cascade,
  constraint eparts_supplier_brands_brand_company_fk
    foreign key (brand_id, company_id)
    references public.eparts_brands(id, company_id) on delete cascade,
  constraint eparts_supplier_brands_supplier_brand_unique
    unique (supplier_id, brand_id)
);

create index if not exists eparts_supplier_brands_supplier_idx
  on public.eparts_supplier_brands(company_id, supplier_id);
create index if not exists eparts_supplier_brands_brand_idx
  on public.eparts_supplier_brands(company_id, brand_id);

alter table public.eparts_supplier_brands enable row level security;

drop policy if exists eparts_supplier_brands_admin_manage on public.eparts_supplier_brands;
create policy eparts_supplier_brands_admin_manage
on public.eparts_supplier_brands
for all to authenticated
using (
  exists (
    select 1 from public.company_members m
    where m.company_id=eparts_supplier_brands.company_id
      and m.user_id=auth.uid()
      and m.is_active=true
      and m.role in ('owner','admin','manager')
  )
)
with check (
  exists (
    select 1 from public.company_members m
    where m.company_id=eparts_supplier_brands.company_id
      and m.user_id=auth.uid()
      and m.is_active=true
      and m.role in ('owner','admin','manager')
  )
);

drop policy if exists eparts_supplier_brands_self_read on public.eparts_supplier_brands;
create policy eparts_supplier_brands_self_read
on public.eparts_supplier_brands
for select to authenticated
using (
  exists (
    select 1 from public.eparts_suppliers s
    where s.id=eparts_supplier_brands.supplier_id
      and s.company_id=eparts_supplier_brands.company_id
      and s.user_id=auth.uid()
      and s.is_active=true
  )
);

grant select, insert, update, delete on public.eparts_supplier_brands to authenticated;
