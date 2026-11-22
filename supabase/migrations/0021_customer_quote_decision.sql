-- Customer quote approval/decline through a valid, expiring portal token.
alter table public.service_orders
  add column if not exists customer_quote_decision text not null default 'pending'
    check (customer_quote_decision in ('pending','approved','declined')),
  add column if not exists customer_quote_decided_at timestamptz;

create or replace function public.respond_service_order_quote(
  p_token text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token public.service_order_portal_tokens;
  v_order public.service_orders;
  v_next_status public.service_order_status;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid or expired customer link';
  end if;
  if p_decision is null or p_decision not in ('approved','declined') then
    raise exception 'Invalid customer decision';
  end if;

  select * into v_token
  from public.service_order_portal_tokens
  where token_hash = encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Invalid or expired customer link';
  end if;

  select * into v_order
  from public.service_orders
  where id = v_token.service_order_id
    and organization_id = v_token.organization_id
    and branch_id = v_token.branch_id
    and customer_id = v_token.customer_id
  for update;

  if not found then
    raise exception 'Service order not found';
  end if;
  if v_order.status <> 'waiting_approval' or v_order.customer_quote_decision <> 'pending' then
    raise exception 'This quote is no longer awaiting a response';
  end if;

  v_next_status := case when p_decision = 'approved' then 'repairing'::public.service_order_status
                        else 'cancelled'::public.service_order_status end;

  update public.service_orders
  set customer_quote_decision = p_decision,
      customer_quote_decided_at = now(),
      approved_amount = case when p_decision = 'approved' then estimated_amount else approved_amount end,
      status = v_next_status,
      updated_at = now()
  where id = v_order.id
    and organization_id = v_order.organization_id;

  insert into public.service_order_events(
    organization_id, service_order_id, from_status, to_status, description, changed_by
  ) values (
    v_order.organization_id, v_order.id, v_order.status, v_next_status,
    case when p_decision = 'approved'
      then 'Orçamento aprovado pelo cliente pelo portal.'
      else 'Orçamento recusado pelo cliente pelo portal.' end,
    v_token.created_by
  );

  insert into public.audit_logs(organization_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_order.organization_id, v_token.created_by, 'service_order.customer_quote_' || p_decision,
    'service_order', v_order.id::text,
    jsonb_build_object('branch_id', v_order.branch_id, 'decision', p_decision)
  );

  return jsonb_build_object(
    'decision', p_decision,
    'status', v_next_status,
    'approved_amount', case when p_decision = 'approved' then v_order.estimated_amount else v_order.approved_amount end,
    'decided_at', now()
  );
end;
$$;

revoke all on function public.respond_service_order_quote(text,text) from public;
grant execute on function public.respond_service_order_quote(text,text) to anon, authenticated;


-- Older backup files predate the customer decision columns. The generic
-- restore importer supplies NULL for absent JSON keys, so normalize that
-- value before NOT NULL/check constraints are evaluated.
create or replace function public.default_service_order_quote_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_quote_decision is null then
    new.customer_quote_decision := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists service_orders_quote_decision_default on public.service_orders;
create trigger service_orders_quote_decision_default
before insert on public.service_orders
for each row execute function public.default_service_order_quote_decision();
