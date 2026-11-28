-- Código de barras próprio por produto, exclusivo do catálogo EPARTS.
alter table public.eparts_products add column if not exists barcode text;
create unique index if not exists eparts_products_company_barcode_uidx
 on public.eparts_products(company_id,barcode) where barcode is not null and btrim(barcode)<>'';
