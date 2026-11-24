-- Global protection: the same normalized username cannot reuse the same PIN
-- in another company. PINs remain PBKDF2-hashed; only a keyed HMAC fingerprint
-- is stored for exact duplicate detection.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.employee_pin_fingerprint_key (
  singleton boolean primary key default true check (singleton),
  secret bytea not null
);
revoke all on private.employee_pin_fingerprint_key from public, anon, authenticated, service_role;

insert into private.employee_pin_fingerprint_key(singleton, secret)
values (true, extensions.gen_random_bytes(32))
on conflict (singleton) do nothing;

alter table public.employees
  add column if not exists pin_fingerprint text;

alter table public.employees
  drop constraint if exists employees_pin_hash_fingerprint_pair_check;

alter table public.employees
  add constraint employees_pin_hash_fingerprint_pair_check
  check ((pin_hash is null) = (pin_fingerprint is null));

create unique index if not exists employees_global_username_pin_uidx
  on public.employees (lower(username), pin_fingerprint)
  where username is not null and pin_fingerprint is not null;

create or replace function public.set_employee_pin_secure(
  p_company_id uuid,
  p_user_id uuid,
  p_pin text,
  p_pin_hash text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_secret bytea;
  v_username text;
  v_fingerprint text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN_INVALID' using errcode = '22023';
  end if;
  if p_pin_hash is null or length(p_pin_hash) < 40 or length(p_pin_hash) > 200 then
    raise exception 'PIN_HASH_INVALID' using errcode = '22023';
  end if;

  select e.username
    into v_username
  from public.employees e
  where e.company_id = p_company_id
    and e.user_id = p_user_id
  for update;

  if v_username is null then
    raise exception 'EMPLOYEE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select k.secret into v_secret
  from private.employee_pin_fingerprint_key k
  where k.singleton = true;

  if v_secret is null then
    raise exception 'PIN_SECURITY_KEY_UNAVAILABLE' using errcode = '55000';
  end if;

  v_fingerprint := encode(
    extensions.hmac(convert_to(lower(v_username) || ':' || p_pin, 'UTF8'), v_secret, 'sha256'),
    'hex'
  );

  update public.employees
     set pin_hash = p_pin_hash,
         pin_fingerprint = v_fingerprint
   where company_id = p_company_id
     and user_id = p_user_id;

exception
  when unique_violation then
    raise exception 'USERNAME_PIN_ALREADY_USED_BY_ANOTHER_COMPANY'
      using errcode = '23505';
end;
$$;

revoke all on function public.set_employee_pin_secure(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_employee_pin_secure(uuid, uuid, text, text) to service_role;
