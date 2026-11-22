alter table public.companies add column if not exists logo_url text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('company-logos','company-logos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view company logos" on storage.objects;
create policy "Public can view company logos" on storage.objects for select to public
using (bucket_id='company-logos');

drop policy if exists "Company members upload company logos" on storage.objects;
create policy "Company members upload company logos" on storage.objects for insert to authenticated
with check (bucket_id='company-logos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1]
 and cm.user_id=(select auth.uid()) and cm.is_active=true
));

drop policy if exists "Company admins update company logos" on storage.objects;
create policy "Company admins update company logos" on storage.objects for update to authenticated
using (bucket_id='company-logos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1]
 and cm.user_id=(select auth.uid()) and cm.is_active=true and cm.role in ('owner','admin')
))
with check (bucket_id='company-logos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1]
 and cm.user_id=(select auth.uid()) and cm.is_active=true and cm.role in ('owner','admin')
));

drop policy if exists "Company admins delete company logos" on storage.objects;
create policy "Company admins delete company logos" on storage.objects for delete to authenticated
using (bucket_id='company-logos' and exists (
 select 1 from public.company_members cm where cm.company_id::text=(storage.foldername(name))[1]
 and cm.user_id=(select auth.uid()) and cm.is_active=true and cm.role in ('owner','admin')
));
