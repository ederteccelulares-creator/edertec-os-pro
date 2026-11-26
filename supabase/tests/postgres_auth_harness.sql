-- Minimal Supabase Auth compatibility layer for isolated PostgreSQL CI.
-- This is NOT a production Supabase schema and contains no real user data.
-- Supabase normally installs pgcrypto in the extensions schema; mirror that
-- prerequisite so migrations using extensions.gen_random_bytes/hmac also run in CI.
create schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;


-- Minimal private Storage compatibility layer for migration/security tests.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id),
  name text not null,
  owner_id uuid,
  created_at timestamptz not null default now(),
  unique(bucket_id, name)
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select case
    when position('/' in name) = 0 then array[]::text[]
    else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
  end;
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, service_role;


-- Minimal Vault compatibility layer for isolated CI only.
-- Production uses the real Supabase Vault extension and encrypted storage.
create schema vault;
create table vault.decrypted_secrets (
  id uuid primary key,
  decrypted_secret text not null
);
create or replace function vault.create_secret(
  new_secret text,
  new_name text default null,
  new_description text default null
) returns uuid
language plpgsql
as $$
declare
  secret_id uuid := gen_random_uuid();
begin
  insert into vault.decrypted_secrets(id,decrypted_secret)
  values(secret_id,new_secret);
  return secret_id;
end;
$$;
create or replace function vault.update_secret(
  secret_id uuid,
  new_secret text,
  new_name text default null,
  new_description text default null
) returns void
language plpgsql
as $$
begin
  update vault.decrypted_secrets
  set decrypted_secret=new_secret
  where id=secret_id;
end;
$$;
grant usage on schema vault to anon, authenticated, service_role;
grant select on vault.decrypted_secrets to service_role;
grant execute on function vault.create_secret(text,text,text) to service_role;
grant execute on function vault.update_secret(uuid,text,text,text) to service_role;
