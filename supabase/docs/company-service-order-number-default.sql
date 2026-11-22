-- PROPOSTA DE MIGRACAO — NAO EXECUTADA
-- Projeto alvo: Edertec OS Pro BR (btouoeftgatyrvuobicr)
-- Objetivo: preencher order_number automaticamente sem MAX()+1 no navegador.
-- Revisar e converter em migration formal com Supabase CLI antes de aplicar.

begin;

-- Alinha a sequência ao maior número já existente.
select setval(
  'public.service_orders_order_number_seq'::regclass,
  greatest(coalesce((select max(order_number) from public.service_orders), 1), 1),
  exists(select 1 from public.service_orders)
);

-- A sequência já existe e a chave (company_id, order_number) já é UNIQUE.
alter table public.service_orders
  alter column order_number
  set default nextval('public.service_orders_order_number_seq'::regclass);

-- O DEFAULT executa nextval no contexto do usuário autenticado.
grant usage, select on sequence public.service_orders_order_number_seq to authenticated;

commit;

-- Testes pós-aplicação (executar com uma conta de teste autenticada):
-- 1) INSERT de OS sem informar order_number deve retornar um número.
-- 2) Dois INSERTs simultâneos devem retornar números distintos.
-- 3) Usuário de outra empresa não deve conseguir consultar/alterar a OS (RLS).
-- 4) Confirmar que nenhuma chave service_role está no frontend.
