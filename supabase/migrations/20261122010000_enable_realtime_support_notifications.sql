do $$
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    execute 'create publication supabase_realtime';
  end if;

  if to_regclass('public.support_tickets') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='support_tickets'
     ) then
    alter publication supabase_realtime add table public.support_tickets;
  end if;

  if to_regclass('public.support_ticket_messages') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='support_ticket_messages'
     ) then
    alter publication supabase_realtime add table public.support_ticket_messages;
  end if;
end $$;
