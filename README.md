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
- Políticas de leitura e gravação por papel para clientes e aparelhos; escrita de histórico e auditoria restrita às funções do banco.
- Políticas de função para limitar quem abre, atualiza e exclui ordens.
- Impressão de ordem de serviço em formato A4 no novo painel, com dados do cliente, aparelho, atendimento e campos de assinatura.
- Interface que respeita o perfil do membro ao habilitar atualização de status da OS.

## Configurar o banco e autenticação
1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No SQL Editor do projeto, execute os arquivos em ordem: `supabase/migrations/0001_saas_core.sql`, `supabase/migrations/0002_order_workflow_security.sql` e `supabase/migrations/0003_role_access_atomic_order.sql` e `supabase/migrations/0004_inventory_module.sql` e `supabase/migrations/0005_financial_module.sql` e `supabase/migrations/0006_sales_module.sql` e `supabase/migrations/0007_team_management.sql` e `supabase/migrations/0008_service_catalog.sql`.
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

## Estado atual
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. Os módulos iniciais de clientes, aparelhos e ordens de serviço já estão conectados ao PostgreSQL no código, mas dependem da execução das migrações e da configuração do Supabase. Convites de equipe, edição completa de cadastros, cobrança, equipe/convites, painel Super Admin e testes de isolamento ainda precisam ser concluídos. As migrações 0004 a 0008 precisam ser aplicadas no Supabase antes de usar estoque, financeiro, vendas, gestão de equipe e catálogo de serviços. A migração 0003 também precisa ser aplicada no Supabase real antes de usar a nova abertura transacional de OS. Não comercialize o acesso nem use dados reais até executar as migrações e concluir os testes e a revisão de segurança.

## Próximas etapas
1. Finalizar testes e validação de clientes, aparelhos, ordens e histórico no Supabase real.
2. Implementar convites seguros de equipe e validar as permissões por papel.
3. Finalizar serviços, equipe, painel Super Admin e relatórios.
4. Implementar gestão de planos, cobrança recorrente e webhooks no backend.
5. Testes de isolamento entre empresas, backup, monitoramento, recuperação e publicação.
