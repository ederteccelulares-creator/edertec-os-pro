insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('service-order-photos','service-order-photos',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=8388608,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Company members upload OS photos" on storage.objects;
create policy "Company members upload OS photos" on storage.objects for insert to authenticated
with check (bucket_id='service-order-photos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1] and cm.user_id=(select auth.uid())
));

drop policy if exists "Company members read OS photos" on storage.objects;
create policy "Company members read OS photos" on storage.objects for select to authenticated
using (bucket_id='service-order-photos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1] and cm.user_id=(select auth.uid())
));

drop policy if exists "Company members delete OS photos" on storage.objects;
create policy "Company members delete OS photos" on storage.objects for delete to authenticated
using (bucket_id='service-order-photos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1] and cm.user_id=(select auth.uid())
));
