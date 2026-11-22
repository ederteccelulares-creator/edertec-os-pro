# Edertec OS Pro

Plataforma SaaS de gestão para assistências técnicas de celulares, preparada para múltiplas empresas em um único produto, com isolamento de dados por organização.

## Tecnologia
- React + TypeScript + Vite
- Supabase Auth
- PostgreSQL com Row Level Security (RLS)
- Lucide icons e CSS responsivo

## Entregas já versionadas
- Base de dados multiempresa: organizações, membros, papéis, filiais, clientes, aparelhos, ordens de serviço, eventos, planos, assinaturas e auditoria.
- Políticas RLS iniciais para restringir os registros à organização do usuário autenticado.
- Criação de empresa por função transacional `create_organization`, que cadastra proprietário, filial Matriz e período de teste inicial.
- Tela de login e criação de conta com Supabase Auth.
- Onboarding para cadastrar a assistência e seleção de empresa quando o usuário pertence a mais de uma.
- Área de trabalho conectada ao Supabase para clientes, aparelhos e ordens de serviço, com seleção de filial.
- Histórico cronológico de alterações de status das ordens.
- Atualização de status por função SQL transacional, com gravação do evento e log de auditoria.
- Abertura de OS e cadastro do aparelho em uma única transação SQL, evitando aparelhos órfãos em caso de falha.
- Módulo inicial de estoque por filial, cadastro de produtos, custo, preço, estoque mínimo e movimentações auditadas de entrada, saída e ajuste.
- Módulo inicial de fluxo de caixa por filial, com entradas, saídas, vencimentos, formas de pagamento, pendências e auditoria.
- Módulo de vendas com carrinho, desconto, cliente opcional, baixa atômica de estoque, histórico de itens e integração automática com o fluxo de caixa.
- Catálogo de serviços por empresa, com categorias, preço, tempo estimado, ativação e inclusão de serviços nas ordens com atualização transacional do valor estimado.
- Painel Super Admin separado das contas das assistências, com resumo global, lista de empresas, status de assinatura, planos, preços e limites.
- Relatórios gerenciais por filial com indicadores de OS, vendas, fluxo de caixa (conforme permissão) e alertas de estoque.
- Políticas de leitura e gravação por papel para clientes e aparelhos; escrita de histórico e auditoria restrita às funções do banco.
- Políticas de função para limitar quem abre, atualiza e exclui ordens.
- Impressão de ordem de serviço em formato A4 no novo painel, com dados do cliente, aparelho, atendimento e campos de assinatura.
- Interface que respeita o perfil do membro ao habilitar atualização de status da OS.

## Configurar o banco e autenticação
1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No SQL Editor do projeto, execute os arquivos em ordem: `supabase/migrations/0001_saas_core.sql`, `supabase/migrations/0002_order_workflow_security.sql` e `supabase/migrations/0003_role_access_atomic_order.sql` e `supabase/migrations/0004_inventory_module.sql` e `supabase/migrations/0005_financial_module.sql` e `supabase/migrations/0006_sales_module.sql` e `supabase/migrations/0007_team_management.sql` e `supabase/migrations/0008_service_catalog.sql` e `supabase/migrations/0009_platform_admin.sql` e `supabase/migrations/0010_team_invitations.sql` e `supabase/migrations/0011_membership_write_hardening.sql` e `supabase/migrations/0012_sales_pricing_and_privacy.sql` e `supabase/migrations/0013_service_order_write_hardening.sql` e `supabase/migrations/0014_tenant_record_immutability.sql` e `supabase/migrations/0015_operational_tenant_key_hardening.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha:
   - `VITE_SUPABASE_URL`: Project URL.
   - `VITE_SUPABASE_ANON_KEY`: chave pública anon/publishable do projeto.
5. Em Authentication > URL Configuration, configure a URL do ambiente publicado e a URL local de desenvolvimento.
6. Em Authentication > Providers, mantenha Email habilitado. Se a confirmação de e-mail estiver ativa, o usuário deverá confirmar o endereço antes do primeiro login.
7. Instale e execute:
   ```bash
   npm install
   npm run dev
   ```

**Segurança:** nunca coloque a chave `service_role` ou segredo de backend em variáveis `VITE_*` ou no navegador. O frontend usa somente a chave pública; operações privilegiadas, cobrança e webhooks deverão rodar em backend seguro.

## Ativar o primeiro Super Admin

Após executar a migração `0009_platform_admin.sql`, localize o usuário já cadastrado em Authentication > Users e execute no SQL Editor, substituindo pelo UUID real da conta administrativa:

```sql
insert into public.platform_admins (user_id)
values ('UUID-DO-USUARIO-AUTORIZADO');
```

A tabela não possui políticas de leitura ou gravação para o navegador. A autorização é verificada por funções SQL; não exponha a chave `service_role`.

## Publicar a função de convites
Depois de aplicar as migrações até `0015_operational_tenant_key_hardening.sql`, vincule o projeto Supabase à CLI e publique a Edge Function:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy invite-team
```

A função exige JWT válido, verifica se o solicitante é proprietário ou administrador ativo, impede que administradores convidem outros administradores e verifica o status da assinatura e a cota de usuários. O segredo `SUPABASE_SERVICE_ROLE_KEY` é usado somente no ambiente seguro da Edge Function e nunca no navegador. Configure a URL de redirecionamento do convite em Authentication > URL Configuration no painel Supabase. Opcionalmente, defina `APP_SITE_URL` como secret da função para direcionar o convite à URL publicada.

## Estado atual
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. Os módulos iniciais de clientes, aparelhos e ordens de serviço já estão conectados ao PostgreSQL no código, mas dependem da execução das migrações e da configuração do Supabase. A gestão inicial de equipe e o painel Super Admin estão implementados no código. O Super Admin pode cadastrar planos e controlar o status e os períodos de assinatura. Os limites de usuários e filiais são verificados no banco com bloqueio transacional; status suspenso, cancelado, vencido ou em atraso bloqueia operações protegidas por função, preservando a possibilidade de consultar o vínculo da empresa. A tela de equipe permite convidar funcionários por e-mail com funções restritas. O convite é processado por uma Supabase Edge Function autenticada, e o vínculo à empresa é criado no banco quando o usuário convidado conclui o cadastro. Convites para contas que já existem no Supabase ainda não são suportados. Integração de cobrança automática, edição completa de cadastros e testes de isolamento ainda precisam ser concluídos. O painel de relatórios apresenta indicadores calculados sobre os registros carregados para a filial selecionada. As migrações 0004 a 0012 precisam ser aplicadas no Supabase antes de usar estoque, financeiro, vendas, gestão de equipe, catálogo de serviços, painel Super Admin e convites de equipe. A migração 0003 também precisa ser aplicada no Supabase real antes de usar a nova abertura transacional de OS. Não comercialize o acesso nem use dados reais até executar as migrações e concluir os testes e a revisão de segurança.

## Próximas etapas
1. Finalizar testes e validação de clientes, aparelhos, ordens e histórico no Supabase real.
2. Implantar a função `invite-team` e validar o fluxo de convite por e-mail em ambiente Supabase real.
3. Finalizar convites, relatórios e validação de permissões do Super Admin.
4. Implementar gestão de planos, cobrança recorrente e webhooks no backend.
5. Testes de isolamento entre empresas, backup, monitoramento, recuperação e publicação.


## Endurecimento de segurança de equipe

A migração `0011_membership_write_hardening.sql` remove a gravação direta de vínculos de equipe pelo navegador. Alterações de função e ativação/desativação passam exclusivamente pelas funções SQL auditadas, que aplicam as regras de proprietário e administrador. A função interna de aceite de convite também não pode ser chamada diretamente por usuários autenticados.


## Proteção de vendas e custos

A migração `0012_sales_pricing_and_privacy.sql` faz o PostgreSQL usar o preço cadastrado no produto, ignorando preços unitários enviados pelo navegador. O desconto permanece como campo separado. A leitura do histórico completo de vendas e dos custos fica limitada a proprietário, administrador e gerente; atendentes podem consultar apenas as próprias vendas. Isso protege os custos e as margens comerciais de outros usuários da empresa.


## Proteção adicional das ordens de serviço

A migração `0013_service_order_write_hardening.sql` remove a atualização direta de ordens pelo navegador. A alteração de status passa pela função SQL transacional que grava histórico e auditoria. Técnicos só podem alterar o status de ordens atribuídas ao próprio usuário; proprietário, administrador e gerente mantêm o fluxo de gestão. Isso impede alterações diretas de campos sensíveis, como empresa, filial, cliente, aparelho, responsável pela abertura e atribuição técnica.


## Isolamento de clientes e aparelhos

A migração `0014_tenant_record_immutability.sql` impede mover clientes entre empresas e impede transferir aparelhos para outro cliente após o cadastro. Também remove a inserção direta de ordens pelo navegador: a abertura deve usar a função transacional `create_service_order_with_device`, que valida empresa, filial e cliente e registra o histórico.


## Proteção das chaves operacionais multiempresa

A migração `0015_operational_tenant_key_hardening.sql` torna imutáveis os IDs e vínculos de organização das filiais, produtos, categorias e lançamentos financeiros, estoque, vendas e itens vendidos. Também impede reatribuir um registro de estoque a outra filial ou produto. Campos operacionais editáveis continuam sujeitos às permissões existentes.


## Verificação de segurança do banco

Depois de aplicar todas as migrações `0001` a `0015` em um projeto Supabase de teste, execute `supabase/tests/security_regression.sql` no SQL Editor. O script verifica se as tabelas operacionais mantêm RLS, se a gravação direta de OS foi removida, se os triggers de imutabilidade estão instalados e se as políticas de privacidade de vendas existem. Esse teste estrutural não substitui testes de integração com duas empresas e usuários autenticados com funções diferentes.
