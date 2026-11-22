# Auditoria de compatibilidade — Edertec OS Pro BR

Data da inspeção: 22/11/2026

## Identificação correta dos projetos

Foram encontrados dois projetos Supabase ativos:

- **Edertec OS Pro BR** — ref `btouoeftgatyrvuobicr`, região `sa-east-1`.
- **Edertec OS Pro** — ref `rxxchkqvkmophtovvisi`, região `us-east-1`.

> Correção de identificação: a primeira versão deste relatório trocou os nomes dos projetos. Esta versão corrige a associação. O projeto BR é o que contém o banco de dados operacional.

## Projeto Edertec OS Pro BR

O projeto BR possui 20 tabelas públicas, todas com RLS habilitado e contagem de zero registros de negócio no momento da inspeção:

`companies`, `company_members`, `branches`, `customers`, `employees`, `service_catalog`, `products`, `service_orders`, `service_order_items`, `stock_movements`, `payments`, `suppliers`, `purchases`, `purchase_items`, `cash_sessions`, `cash_transactions`, `platform_admins`, `subscription_plans`, `company_subscriptions`, `audit_logs`.

O histórico remoto contém cinco migrações:

- `initial_multitenant_os_schema`
- `lock_down_rls_auto_enable_rpc`
- `purchases_cash_subscriptions_admin`
- `restrict_platform_admin_registry`
- `secure_company_registration_rpc`

Não há Edge Functions implantadas no projeto BR.

### Modelo de dados do projeto BR

O modelo usa `companies` e `company_id`, não `organizations` e `organization_id`.

- `companies`: cadastro das assistências.
- `company_members`: associação de usuários às empresas e seus papéis.
- `branches`: filiais vinculadas a `company_id`.
- `customers`: clientes vinculados à empresa e opcionalmente à filial.
- `employees`: equipe e técnicos.
- `service_orders`: OS com marca/modelo/IMEI do aparelho armazenados diretamente no registro.
- `products` e `stock_movements`: produtos e estoque.
- `service_catalog` e `service_order_items`: catálogo e itens de serviço.
- `payments`, `cash_sessions`, `cash_transactions`: pagamentos e caixa.
- `suppliers`, `purchases`, `purchase_items`: fornecedores e compras.
- `subscription_plans` e `company_subscriptions`: planos e assinaturas.
- `platform_admins`: cadastro de Super Admin.
- `audit_logs`: auditoria.

As RPCs públicas identificadas são `is_company_member`, `register_company` e `rls_auto_enable`. As duas últimas foram identificadas como SECURITY DEFINER; não devem ser expostas ou alteradas sem revisão do corpo, permissões e verificações de autorização.

## Projeto Edertec OS Pro (EUA)

O projeto `rxxchkqvkmophtovvisi`, região `us-east-1`, está ativo, mas não possui tabelas públicas, migrações remotas ou Edge Functions no momento da inspeção.

## Incompatibilidade com o repositório GitHub

O repositório `ederteccelulares-creator/edertec-os-pro` contém um frontend e 23 migrações preparados para outro modelo multiempresa:

| Repositório atual | Projeto BR |
| --- | --- |
| `organizations` | `companies` |
| `organization_members` | `company_members` |
| `organization_id` | `company_id` |
| `devices` | campos do aparelho em `service_orders` |
| `plans` / `subscriptions` | `subscription_plans` / `company_subscriptions` |
| `service_order_events` | não identificada entre as 20 tabelas do BR |

O frontend atual consulta tabelas, colunas e RPCs do modelo `organization_id`. O banco BR já tem um modelo próprio e tabelas com nomes iguais, mas colunas diferentes. Aplicar diretamente as 23 migrações ao BR pode causar conflitos e não é uma migração compatível.

## Alertas de segurança e desempenho do projeto BR

Security Advisor:
- `platform_admins` tem RLS habilitado sem política. Pode ser intencional para bloquear acesso direto; confirmar que o fluxo administrativo privilegiado funciona.
- `register_company(company_name, company_tax_id, main_phone)` é SECURITY DEFINER e executável por usuários autenticados. Revisar o corpo, checagem de `auth.uid()`, validação, search_path e privilégios.
- `rls_auto_enable` também é SECURITY DEFINER; revisar se está inacessível aos papéis públicos e autenticados.

Performance Advisor:
- 25 chaves estrangeiras sem índices de cobertura.
- Uma ocorrência de múltiplas políticas permissivas de SELECT em `company_subscriptions`.
- 16 índices reportados como não utilizados. Como o banco ainda tem poucos dados/uso, não remover índices apenas por esse alerta.

## Plano seguro

1. Preservar o banco BR como fonte de verdade e não executar reset, renomeação ou reaplicação das migrações antigas.
2. Adaptar o frontend e a camada de dados para o esquema `company_id` existente, ou criar uma migração nova, isolada e cuidadosamente versionada para uma arquitetura diferente. Não misturar os modelos.
3. Fazer o desenvolvimento em branch/projeto de teste, com testes de isolamento entre duas empresas e papéis owner/admin/manager/attendant/technician.
4. Implementar as tabelas e fluxos ausentes somente depois de confirmar a necessidade funcional (por exemplo, histórico de OS e portal público).
5. Revisar RLS, SECURITY DEFINER, grants de Data API e Storage.
6. Publicar no projeto BR somente após build, testes de autorização e plano de rollback.

## Limites

A contagem zero foi observada nas 20 tabelas públicas. Isso não comprova ausência de usuários no Supabase Auth, arquivos no Storage ou configurações externas. Essas áreas precisam de inspeção própria antes de qualquer operação destrutiva.

Nenhuma alteração de schema, política, função, usuário, Storage ou dado foi realizada durante esta auditoria.


## Inventário da camada de dados do frontend (verificação adicional)

A camada `src/lib/tenant-data.ts` consulta estas tabelas:

`branch_inventory`, `branches`, `customers`, `devices`, `financial_entries`, `sales`, `service_catalog`, `service_order_events`, `service_order_notifications`, `service_orders`.

Também chama estas RPCs:

`add_service_to_order`, `adjust_branch_stock`, `assign_service_order_technician`, `create_financial_entry`, `create_inventory_item_for_branch`, `create_sale`, `create_service_order_portal_link`, `create_service_order_with_device`, `get_service_order_whatsapp_settings`, `is_platform_admin`, `list_organization_team`, `mark_service_order_notification_read`, `platform_dashboard_summary`, `platform_list_organizations`, `platform_list_plans`, `platform_save_plan`, `platform_update_subscription`, `save_service_catalog_item`, `save_service_order_whatsapp_settings`, `set_financial_entry_status`, `set_organization_member_active`, `set_organization_member_role`, `update_service_order_status`.

O projeto BR, na inspeção de `information_schema.routines`, expõe apenas três funções no schema public: `is_company_member`, `register_company` e `rls_auto_enable`. Portanto, as RPCs usadas pelo frontend ainda não estão implantadas no projeto BR. O frontend não deve ser considerado integrado/operacional contra esse banco até que essas chamadas sejam substituídas ou implementadas com autorização equivalente.

A camada também usa o bucket Storage `service-order-intake`; a existência e as políticas desse bucket ainda precisam ser verificadas separadamente.

### Ordem recomendada para compatibilidade

1. Autenticação, perfil, registro da empresa via RPC existente `register_company`, associação em `company_members` e leitura da empresa ativa.
2. Filiais e clientes: alinhar colunas `company_id`, `is_active` e campos opcionais ao esquema real.
3. Ordens de serviço: mapear aparelho para colunas `device_type`, `device_brand`, `device_model`, `device_color`, `serial_number` da própria `service_orders`; validar estados e permissões.
4. Estoque, catálogo, compras, vendas, caixa e pagamentos: alinhar os módulos atuais com `products`, `stock_movements`, `service_catalog`, `purchases`, `purchase_items`, `payments`, `cash_sessions` e `cash_transactions`.
5. Super Admin e assinaturas: implementar RPCs de plataforma com autorização server-side; nunca confiar em papel enviado pelo navegador.
6. Portal do cliente, eventos de OS, notificações, upload e WhatsApp: criar apenas após desenho de segurança e revisão de Storage/RLS.

Nenhuma chamada RPC ausente foi criada nesta etapa.


## Hardening de integridade entre empresas — 22/11/2026

Aplicado diretamente ao projeto Supabase BR `btouoeftgatyrvuobicr` e verificado após execução.

- Criadas chaves únicas compostas `(id, company_id)` em `branches`, `customers`, `employees` e `service_orders`.
- Criadas chaves estrangeiras compostas para exigir que filial, cliente e técnico associados a uma OS pertençam à mesma empresa.
- Criada chave estrangeira composta para exigir que cada item de OS pertença à mesma empresa da OS referenciada.
- Corrigida a política RLS de `service_order_items`: a condição anterior comparava `so.company_id = so.company_id`, que era sempre verdadeira. Agora compara `so.company_id = service_order_items.company_id`.
- Antes da alteração, as tabelas verificadas estavam vazias e não havia referências cruzadas existentes.
- Verificação posterior confirmou a presença das quatro chaves únicas e das quatro chaves estrangeiras compostas.

### Alertas de segurança ainda pendentes

O Supabase Security Advisor ainda sinaliza:
1. `platform_admins` está com RLS habilitado e sem política. Isso pode ser intencional para impedir acesso direto; revisar o fluxo Super Admin antes de criar políticas.
2. `register_company(text,text,text)` é SECURITY DEFINER e executável por usuários autenticados. A chamada autenticada é necessária ao cadastro de empresa; revisar e restringir explicitamente grants a PUBLIC/anon, mantendo apenas o acesso intencional a authenticated, após confirmar o fluxo.

Esta seção registra alterações já aplicadas no banco BR; não é um arquivo de migração executável.

- O módulo de consulta de OS usa nomes explícitos das relações antigas (`service_orders_customer_id_fkey` e `service_orders_assigned_employee_id_fkey`) para evitar ambiguidade no PostgREST após a adição das chaves estrangeiras compostas.
- Grants da função `register_company(text,text,text)` verificados: `anon` não pode executar; `authenticated` pode executar; o privilégio herdado de `PUBLIC` está ausente. A permissão autenticada é intencional para permitir o cadastro da empresa. O Advisor continua alertando por ser SECURITY DEFINER, então o corpo e o escopo devem permanecer sob revisão.


## Estoque e produtos — 22/11/2026

### Código no GitHub
- Criado `src/lib/company-inventory.ts` com listagem de produtos, cadastro de produto, ativação/desativação e consulta de movimentações.
- Criado `src/components/CompanyInventoryPanel.tsx` e integrado à navegação principal do workspace.
- A consulta usa `company_id` e RLS. Os dados exibidos incluem custo, venda, saldo e estoque mínimo.
- Cadastro inicial cria o produto com saldo zero. Não há ainda formulário de entrada/saída: o saldo só deve mudar por movimentação auditável.
- Corrigido o tipo de movimentação para usar a coluna real `reason` (não existe coluna `notes` em `stock_movements`).

### Banco BR
- Confirmado RLS habilitado e política de membros para `products` e `stock_movements`.
- Criada chave única composta `products(id, company_id)`.
- Criadas FKs compostas para que cada movimentação só possa apontar para produto e filial da mesma empresa.
- Constraints verificadas após aplicação; tabelas estavam vazias no momento da mudança.

### Verificação
- Adicionado workflow GitHub Actions `.github/workflows/ci.yml` para executar `npm ci` e `npm run build` em push/PR para main.
- A criação do workflow foi confirmada no GitHub; ainda não foi possível confirmar uma execução concluída.


## Movimentações transacionais de estoque — 22/11/2026

- Criada a função `public.record_stock_movement` no projeto BR como `SECURITY INVOKER`, com `search_path` vazio e acesso EXECUTE somente para `authenticated` (verificado: anon=false, authenticated=true).
- A função valida autenticação, empresa, produto, filial opcional, tipo e quantidade; bloqueia o registro de saída acima do saldo disponível.
- A linha de movimentação e a atualização do saldo são executadas na mesma transação. Tipos aceitos pelo banco: `in`, `out` e `adjustment`; ajuste define o saldo contado informado.
- O painel React passou a oferecer entrada, saída e ajuste, além de mostrar as 100 movimentações mais recentes.
- O saldo continua consolidado por empresa. O campo filial é opcional para rastreabilidade; ainda não existe saldo independente por filial.

### CI
- O primeiro workflow CI falhou antes do build porque o repositório não tem lockfile npm e o setup-node com cache npm exige um lockfile.
- Workflow ajustado para não usar cache e executar `npm install`; uma nova execução foi iniciada. O resultado final ainda precisa ser confirmado.


## Fornecedores e integridade de compras — 22/11/2026

- Criados `src/lib/company-suppliers.ts` e `src/components/CompanySuppliersPanel.tsx`; seção Fornecedores integrada ao workspace.
- Cadastro e pesquisa de fornecedores por nome, documento e telefone, sempre filtrados por `company_id`.
- Inspecionada a política de `purchase_items`: havia uma comparação tautológica `p.company_id = p.company_id`, que não garantia que o item pertencia à mesma empresa da compra.
- Corrigida a política para validar `purchases.id = purchase_items.purchase_id` e `purchases.company_id = purchase_items.company_id`, além de validar o produto opcional contra a mesma empresa.
- Criadas constraints compostas:
  - `suppliers(id, company_id)`
  - `purchases(id, company_id)`
  - `purchases(branch_id, company_id)` -> branches
  - `purchases(supplier_id, company_id)` -> suppliers
  - `purchase_items(purchase_id, company_id)` -> purchases
  - `purchase_items(product_id, company_id)` -> products
- As tabelas suppliers, purchases e purchase_items estavam vazias antes da alteração. As constraints foram verificadas depois.
- Security Advisor permanece com os dois apontamentos já conhecidos: `platform_admins` sem política RLS (intencionalmente fechado até desenhar o acesso Super Admin) e `register_company` SECURITY DEFINER executável por authenticated (necessário ao fluxo de cadastro, com grants restritos e verificados).


## Pedidos de compra e recebimento — 22/11/2026

- Criados `src/lib/company-purchases.ts` e `src/components/CompanyPurchasesPanel.tsx`; seção Compras integrada ao workspace.
- Cadastro de pedido com fornecedor, filial opcional, itens, quantidade, custo unitário, desconto, frete, observações e total calculado.
- Compra é criada como `draft`; o número é obtido de `purchases_purchase_number_seq`. Concedido USAGE/SELECT da sequência somente a authenticated (verificado: authenticated=true, anon=false).
- Criada RPC `create_company_purchase` como SECURITY INVOKER, com validação de membro, fornecedor, filial e produtos da mesma empresa; insere cabeçalho e itens na mesma transação.
- Criada RPC `receive_company_purchase` como SECURITY INVOKER. Bloqueia compra já recebida/cancelada; registra movimento de entrada para cada item vinculado a produto, atualiza o custo do produto e marca a compra como recebida na mesma transação.
- Itens sem produto vinculado permanecem apenas como despesa/linha informativa e não alteram estoque.
- EXECUTE das duas RPCs concedido a authenticated e revogado de PUBLIC/anon.
- A confirmação do recebimento no painel informa que itens vinculados serão adicionados ao estoque.
- Ainda não existe baixa financeira/contas a pagar vinculada à compra. O módulo atual controla pedido, recebimento e estoque; integração financeira fica para etapa posterior.


## Financeiro / fluxo de caixa — 22/11/2026

- Corrigida a policy RLS de `cash_transactions`: removida a condição tautológica `cs.company_id = cs.company_id`; agora exige `cs.company_id = cash_transactions.company_id`. Também valida que eventual `payment_id` pertença à mesma empresa.
- Verificada a policy no catálogo `pg_policies` após a alteração.
- Adicionadas chaves compostas de integridade para `cash_sessions`, `cash_transactions` e `payments`, incluindo filial, sessão de caixa, pagamento, OS e cliente vinculados à mesma empresa.
- Criados `src/lib/company-cash.ts` e `src/components/CompanyCashPanel.tsx`, integrados como seção Financeiro.
- Painel permite registrar entradas e saídas manuais com categoria, descrição, valor, forma de pagamento e filial; exibe as últimas 300 movimentações e totais calculados sobre esse conjunto.
- Limitação atual explícita na interface: o fluxo de caixa ainda não integra automaticamente pagamentos de OS nem contas a pagar/receber; o saldo apresentado é o saldo líquido dos lançamentos carregados, não saldo bancário conciliado.
- Security Advisor após a mudança não apontou novos problemas; permanecem os dois achados já documentados: `platform_admins` com RLS sem policy (INFO, intencional enquanto o acesso Super Admin não estiver desenhado) e `register_company` SECURITY DEFINER executável por authenticated (fluxo de cadastro intencional, com grants restritos).


## Recebimento de pagamentos de OS — 22/11/2026

- Criada RPC `record_company_service_order_payment(company_id, service_order_id, amount, method, notes)`, SECURITY INVOKER e `search_path='' `.
- A função valida usuário autenticado, associação à empresa, OS pertencente à empresa, OS não cancelada, valor positivo e método dentro da lista permitida.
- Em uma única transação, cria um registro em `payments` com status `paid` e um lançamento de entrada em `cash_transactions` associado ao pagamento. A filial e cliente são herdados da OS.
- EXECUTE concedido a authenticated e revogado de PUBLIC/anon; grants conferidos no catálogo (authenticated=true, anon=false).
- Criado índice único parcial em `cash_transactions(payment_id)` para impedir mais de um lançamento de caixa vinculado ao mesmo pagamento.
- Criados `src/lib/company-service-order-payments.ts` e formulário de recebimento na listagem de OS. O usuário informa valor, forma de pagamento e observação; após sucesso o fluxo de caixa é atualizado automaticamente.
- O fluxo permite recebimentos parciais e múltiplos pagamentos para uma mesma OS; cada pagamento individual gera exatamente um lançamento de caixa.
- Não foi criado limite automático baseado no preço estimado/final da OS, pois o modelo atual não mantém saldo devedor calculado. A conciliação de saldo e estornos permanece como etapa futura.
