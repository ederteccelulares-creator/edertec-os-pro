drop policy if exists "Company members can delete product images" on storage.objects;
drop policy if exists "Company members can update product images" on storage.objects;
drop policy if exists "Company members can upload product images" on storage.objects;
drop policy if exists "Company members can upload OS photos" on storage.objects;
drop policy if exists "Company members upload OS photos" on storage.objects;
drop policy if exists "Company members read OS photos" on storage.objects;
drop policy if exists "Company members delete OS photos" on storage.objects;

create policy "Active managers upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
      and cm.role in ('owner','admin','manager')
  )
);

create policy "Active managers update product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
      and cm.role in ('owner','admin','manager')
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
      and cm.role in ('owner','admin','manager')
  )
);

create policy "Active managers delete product images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
      and cm.role in ('owner','admin','manager')
  )
);

create policy "Active members upload OS photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text = (storage.foldername(name))[2]
      and so.company_id::text = (storage.foldername(name))[1]
  )
);

create policy "Active members read OS photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text = (storage.foldername(name))[2]
      and so.company_id::text = (storage.foldername(name))[1]
  )
);

create policy "Active members delete OS photos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text = (storage.foldername(name))[1]
      and cm.user_id = (select auth.uid())
      and cm.is_active = true
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text = (storage.foldername(name))[2]
      and so.company_id::text = (storage.foldername(name))[1]
  )
);
