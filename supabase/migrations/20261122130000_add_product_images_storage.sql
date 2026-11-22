alter table public.products add column if not exists image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Company members can upload product images" on storage.objects;
create policy "Company members can upload product images"
on storage.objects for insert to authenticated
with check (bucket_id = 'product-images' and exists (
 select 1 from public.company_members cm
 where cm.company_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
));

drop policy if exists "Company members can update product images" on storage.objects;
create policy "Company members can update product images"
on storage.objects for update to authenticated
using (bucket_id = 'product-images' and exists (
 select 1 from public.company_members cm
 where cm.company_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
))
with check (bucket_id = 'product-images' and exists (
 select 1 from public.company_members cm
 where cm.company_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
));

drop policy if exists "Company members can delete product images" on storage.objects;
create policy "Company members can delete product images"
on storage.objects for delete to authenticated
using (bucket_id = 'product-images' and exists (
 select 1 from public.company_members cm
 where cm.company_id::text = (storage.foldername(name))[1] and cm.user_id = (select auth.uid())
));
