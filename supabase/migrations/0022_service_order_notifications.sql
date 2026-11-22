-- In-app notifications for customer decisions on service-order quotes.
create table public.service_order_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  branch_id uuid not null,
  service_order_id uuid not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('quote_approved','quote_declined')),
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint service_order_notifications_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches(id, organization_id) on delete cascade,
  constraint service_order_notifications_order_fk
    foreign key (service_order_id, organization_id)
    references public.service_orders(id, organization_id) on delete cascade,
  unique (recipient_user_id, service_order_id, notification_type)
);

create index service_order_notifications_inbox_idx
  on public.service_order_notifications(recipient_user_id, branch_id, created_at desc)
  where read_at is null;

alter table public.service_order_notifications enable row level security;
revoke all on public.service_order_notifications from public, anon;
revoke insert, update, delete on public.service_order_notifications from authenticated;
grant select on public.service_order_notifications to authenticated;

create policy "Members read their own service order notifications"
on public.service_order_notifications
for select to authenticated
using (
  recipient_user_id = auth.uid()
  and public.is_org_member(organization_id)
);

create or replace function public.mark_service_order_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.service_order_notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = auth.uid()
    and public.is_org_member(organization_id);

  return found;
end;
$$;

revoke all on function public.mark_service_order_notification_read(uuid) from public, anon;
grant execute on function public.mark_service_order_notification_read(uuid) to authenticated;

-- Recreate the token-gated decision RPC and write an inbox item for each
-- active organization member in the same transaction as the status change.
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
  v_notification_type text;
  v_title text;
  v_message text;
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
  v_notification_type := case when p_decision = 'approved' then 'quote_approved' else 'quote_declined' end;
  v_title := case when p_decision = 'approved' then 'Orçamento aprovado pelo cliente' else 'Orçamento recusado pelo cliente' end;
  v_message := format('A OS #%s recebeu uma resposta do cliente ao orçamento.', v_order.order_number);

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

  insert into public.service_order_notifications(
    organization_id, branch_id, service_order_id, recipient_user_id,
    notification_type, title, message
  )
  select v_order.organization_id, v_order.branch_id, v_order.id, m.user_id,
         v_notification_type, v_title, v_message
  from public.organization_members m
  where m.organization_id = v_order.organization_id
    and m.active = true
  on conflict (recipient_user_id, service_order_id, notification_type) do nothing;

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
