create or replace function public.register_company(company_name text, company_tax_id text default null, main_phone text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_user_id uuid;
  new_company_id uuid;
  trial_plan_id uuid;
  normalized_name text;
  normalized_tax_id text;
  existing_company_id uuid;
  trial_deadline timestamptz := now() + interval '3 days';
  owner_email text;
  owner_name text;
  owner_username text;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  normalized_name := lower(regexp_replace(trim(coalesce(company_name,'')), '[[:space:]]+', ' ', 'g'));
  normalized_tax_id := nullif(regexp_replace(coalesce(company_tax_id,''), '[^0-9]', '', 'g'), '');
  if length(normalized_name) < 2 then
    raise exception 'Company name must contain at least 2 characters';
  end if;

  select u.email,
         coalesce(nullif(u.raw_user_meta_data->>'full_name',''),
                  nullif(split_part(coalesce(u.email,''),'@',1),''),
                  'Usuário')
    into owner_email, owner_name
  from auth.users u
  where u.id = current_user_id;

  owner_username :=
    left(coalesce(nullif(regexp_replace(lower(split_part(coalesce(owner_email,''),'@',1)), '[^a-z0-9._-]', '', 'g'), ''), 'usuario'), 23)
    || left(replace(current_user_id::text, '-', ''), 6);

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));
  if normalized_tax_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('company-tax-id:' || normalized_tax_id, 0));
  end if;

  select c.id into existing_company_id
  from public.companies c
  join public.company_members cm on cm.company_id = c.id
  where cm.user_id = current_user_id
    and cm.is_active = true
    and cm.role = 'owner'
    and (
      lower(regexp_replace(trim(c.name), '[[:space:]]+', ' ', 'g')) = normalized_name
      or (normalized_tax_id is not null
          and nullif(regexp_replace(coalesce(c.tax_id,''), '[^0-9]', '', 'g'), '') = normalized_tax_id)
    )
  order by c.created_at asc
  limit 1;

  if existing_company_id is not null then
    insert into public.employees(company_id, user_id, name, email, username, is_active)
    select existing_company_id, current_user_id, owner_name, owner_email, owner_username, true
    where not exists (
      select 1 from public.employees e
      where e.company_id = existing_company_id and e.user_id = current_user_id
    );
    return existing_company_id;
  end if;

  if normalized_tax_id is not null and exists (
    select 1 from public.companies c
    where nullif(regexp_replace(coalesce(c.tax_id,''), '[^0-9]', '', 'g'), '') = normalized_tax_id
  ) then
    raise exception 'Este CPF/CNPJ já está cadastrado em outra assistência. Entre na conta vinculada ou fale com o suporte.';
  end if;

  select sp.id into trial_plan_id
  from public.subscription_plans sp
  where sp.is_active = true
  order by sp.price asc, sp.created_at asc
  limit 1;

  if trial_plan_id is null then
    raise exception 'No active subscription plan is available for the trial';
  end if;

  insert into public.companies(name, tax_id, phone, status)
  values(trim(company_name), normalized_tax_id, nullif(trim(main_phone), ''), 'active')
  returning id into new_company_id;

  insert into public.company_members(company_id, user_id, role)
  values(new_company_id, current_user_id, 'owner');

  insert into public.branches(company_id, name, phone)
  values(new_company_id, 'Matriz', nullif(trim(main_phone), ''));

  insert into public.company_subscriptions(company_id, plan_id, status, starts_at, ends_at, trial_ends_at)
  values(new_company_id, trial_plan_id, 'trial', now(), trial_deadline, trial_deadline);

  insert into public.employees(company_id, user_id, name, email, username, is_active)
  values(new_company_id, current_user_id, owner_name, owner_email, owner_username, true);

  return new_company_id;
end;
$function$;