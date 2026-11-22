-- Secure, expiring bearer links for customer-facing service-order tracking.
create table public.service_order_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  service_order_id uuid not null,
  customer_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint portal_token_order_fk foreign key (service_order_id, organization_id)
    references public.service_orders(id, organization_id) on delete cascade,
  constraint portal_token_branch_fk foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  constraint portal_token_customer_fk foreign key (customer_id, organization_id)
    references public.customers(id, organization_id) on delete cascade
);

create index service_order_portal_tokens_lookup_idx
  on public.service_order_portal_tokens(token_hash)
  where revoked_at is null;

alter table public.service_order_portal_tokens enable row level security;
revoke all on public.service_order_portal_tokens from anon, authenticated;

create or replace function public.create_service_order_portal_link(
  p_organization_id uuid,
  p_branch_id uuid,
  p_order_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_customer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.has_org_role(
    p_organization_id,
    array['owner','admin','manager','attendant']::public.member_role[]
  ) then
    raise exception 'You do not have permission to create customer portal links';
  end if;

  select customer_id into v_customer_id
  from public.service_orders
  where id = p_order_id
    and organization_id = p_organization_id
    and branch_id = p_branch_id;

  if not found then
    raise exception 'Service order not found in this branch';
  end if;

  update public.service_order_portal_tokens
  set revoked_at = now()
  where service_order_id = p_order_id
    and organization_id = p_organization_id
    and revoked_at is null;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.service_order_portal_tokens(
    organization_id, branch_id, service_order_id, customer_id,
    token_hash, expires_at, created_by
  ) values (
    p_organization_id, p_branch_id, p_order_id, v_customer_id,
    encode(digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    now() + interval '90 days',
    auth.uid()
  );

  return v_token;
end;
$$;

create or replace function public.get_service_order_portal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select jsonb_build_object(
    'organization_name', org.name,
    'order_number', so.order_number,
    'status', so.status,
    'reported_issue', so.reported_issue,
    'diagnosis', so.diagnosis,
    'estimated_amount', so.estimated_amount,
    'approved_amount', so.approved_amount,
    'received_at', so.received_at,
    'updated_at', so.updated_at,
    'customer_name', customer.name,
    'device', case when device.id is null then null
      else jsonb_build_object('brand', device.brand, 'model', device.model) end,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'status', ev.to_status,
        'description', ev.description,
        'created_at', ev.created_at
      ) order by ev.created_at asc)
      from public.service_order_events ev
      where ev.service_order_id = so.id
        and ev.organization_id = so.organization_id
    ), '[]'::jsonb)
  ) into v_result
  from public.service_order_portal_tokens token
  join public.service_orders so
    on so.id = token.service_order_id
   and so.organization_id = token.organization_id
   and so.branch_id = token.branch_id
  join public.organizations org on org.id = so.organization_id
  join public.customers customer
    on customer.id = token.customer_id
   and customer.organization_id = token.organization_id
  left join public.devices device
    on device.id = so.device_id
   and device.organization_id = so.organization_id
  where token.token_hash = encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and token.revoked_at is null
    and token.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.create_service_order_portal_link(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_service_order_portal_link(uuid, uuid, uuid) to authenticated;

revoke all on function public.get_service_order_portal(text) from public;
grant execute on function public.get_service_order_portal(text) to anon, authenticated;
