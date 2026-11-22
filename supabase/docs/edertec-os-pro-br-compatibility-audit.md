# Auditoria de compatibilidade — Edertec OS Pro BR

Data da inspeção: 22/11/2026

## Resultado

O projeto Supabase **Edertec OS Pro BR** está ativo na região `sa-east-1`. A inspeção foi somente de leitura: nenhuma tabela, política, função, migração ou dado foi alterado.

O banco contém 20 tabelas públicas, todas com RLS habilitado e sem registros de negócio. O histórico remoto contém cinco migrações próprias:

- `initial_multitenant_os_schema`
- `lock_down_rls_auto_enable_rpc`
- `purchases_cash_subscriptions_admin`
- `restrict_platform_admin_registry`
- `secure_company_registration_rpc`

Não há Edge Functions implantadas no projeto BR.

## Incompatibilidade identificada

O código atual do repositório foi construído para um modelo multiempresa baseado em `organizations` e `organization_id`. O banco BR existente usa um modelo diferente baseado em `companies` e `company_id`.

Exemplos:

| Repositório atual | Banco BR |
| --- | --- |
| `organizations` | `companies` |
| `organization_members` | `company_members` |
| `branches.organization_id` | `branches.company_id` |
| `customers.organization_id` | `customers.company_id` |
| `devices` | dados do aparelho armazenados diretamente em `service_orders` |
| `create_organization(org_name, org_slug)` | `register_company(company_name, company_tax_id, main_phone)` |

O frontend atual também consulta tabelas e funções que não existem no banco BR, como `devices`, `service_order_events`, `organization_members` e RPCs do modelo `organization_id`.

Portanto, aplicar diretamente as 23 migrações do repositório ao banco BR não é seguro: há colisões de nomes e estruturas incompatíveis. O histórico remoto também não corresponde às versões locais.

## Outro projeto Supabase

Foi encontrado um segundo projeto chamado **Edertec OS Pro**, na região `us-east-1`. A inspeção retornou zero tabelas públicas, zero migrações e zero Edge Functions. Ele está vazio e não foi alterado.

## Alertas observados no projeto BR

O Security Advisor apontou:
- `platform_admins` tem RLS habilitado sem política; isso pode ser intencional para impedir acesso direto, mas precisa ser validado com o fluxo Super Admin.
- `register_company` é uma função `SECURITY DEFINER` executável por usuários autenticados; revisar autorização, validação e privilégios.

O Performance Advisor apontou 25 chaves estrangeiras sem índice de cobertura e uma situação de políticas permissivas duplicadas em `company_subscriptions`. Esses alertas devem ser priorizados após a definição do modelo definitivo.

## Plano seguro recomendado

1. Manter o banco BR intacto enquanto o contrato de dados é definido.
2. Escolher explicitamente um único modelo de tenancy: `company_id` ou `organization_id`.
3. Como o frontend e as 23 migrações atuais já usam `organization_id`, avaliar uma migração de compatibilidade reversível ou adaptar o frontend para o modelo BR. Não misturar os dois modelos parcialmente.
4. Validar a solução em ambiente de desenvolvimento isolado e executar os testes de RLS com duas empresas e usuários de papéis diferentes.
5. Só depois publicar as migrações e Edge Functions necessárias.
6. Corrigir os alertas de segurança e performance antes de liberar o SaaS para clientes.

## Limite desta auditoria

A ausência de registros nas 20 tabelas públicas foi confirmada pela inspeção do Supabase. Isso não prova, por si só, que não existam usuários no Supabase Auth, arquivos no Storage ou configurações externas. Não executar reset, exclusão ou renomeação de tabelas sem inspecionar também essas dependências e obter um plano de reversão.
