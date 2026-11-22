-- Private storage for service-order intake photos and customer signatures.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'service-order-intake',
  'service-order-intake',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read service order intake files" on storage.objects;
create policy "Members read service order intake files"
on storage.objects for select to authenticated
using (
  bucket_id = 'service-order-intake'
  and cardinality(storage.foldername(name)) = 3
  and exists (
    select 1
    from public.service_orders so
    join public.branches b on b.id = so.branch_id and b.organization_id = so.organization_id
    where so.id::text = (storage.foldername(name))[3]
      and so.branch_id::text = (storage.foldername(name))[2]
      and so.organization_id::text = (storage.foldername(name))[1]
      and public.is_org_member(so.organization_id)
  )
);

drop policy if exists "Staff upload service order intake files" on storage.objects;
create policy "Staff upload service order intake files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'service-order-intake'
  and cardinality(storage.foldername(name)) = 3
  and exists (
    select 1
    from public.service_orders so
    where so.id::text = (storage.foldername(name))[3]
      and so.branch_id::text = (storage.foldername(name))[2]
      and so.organization_id::text = (storage.foldername(name))[1]
      and public.has_org_role(so.organization_id, array['owner','admin','manager','attendant','technician']::public.member_role[])
  )
);

drop policy if exists "Staff delete service order intake files" on storage.objects;
create policy "Staff delete service order intake files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'service-order-intake'
  and cardinality(storage.foldername(name)) = 3
  and exists (
    select 1
    from public.service_orders so
    where so.id::text = (storage.foldername(name))[3]
      and so.branch_id::text = (storage.foldername(name))[2]
      and so.organization_id::text = (storage.foldername(name))[1]
      and public.has_org_role(so.organization_id, array['owner','admin','manager']::public.member_role[])
  )
);
