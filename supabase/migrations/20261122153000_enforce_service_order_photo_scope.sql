-- Enforce that OS photo objects belong to a real service order
-- inside the same company folder, in addition to membership checks.
drop policy if exists "Company members can upload OS photos" on storage.objects;
create policy "Company members can upload OS photos"
on storage.objects for insert to authenticated
with check (
  bucket_id='service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text=(storage.foldername(name))[1]
      and cm.user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text=(storage.foldername(name))[2]
      and so.company_id::text=(storage.foldername(name))[1]
  )
);

drop policy if exists "Company members read OS photos" on storage.objects;
create policy "Company members read OS photos"
on storage.objects for select to authenticated
using (
  bucket_id='service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text=(storage.foldername(name))[1]
      and cm.user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text=(storage.foldername(name))[2]
      and so.company_id::text=(storage.foldername(name))[1]
  )
);

drop policy if exists "Company members delete OS photos" on storage.objects;
create policy "Company members delete OS photos"
on storage.objects for delete to authenticated
using (
  bucket_id='service-order-photos'
  and exists (
    select 1 from public.company_members cm
    where cm.company_id::text=(storage.foldername(name))[1]
      and cm.user_id=(select auth.uid())
  )
  and exists (
    select 1 from public.service_orders so
    where so.id::text=(storage.foldername(name))[2]
      and so.company_id::text=(storage.foldername(name))[1]
  )
);
