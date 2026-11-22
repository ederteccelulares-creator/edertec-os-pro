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
2. No SQL Editor do projeto, execute os arquivos em ordem: `supabase/migrations/0001_saas_core.sql`, `supabase/migrations/0002_order_workflow_security.sql` e `supabase/migrations/0003_role_access_atomic_order.sql` e `supabase/migrations/0004_inventory_module.sql` e `supabase/migrations/0005_financial_module.sql` e `supabase/migrations/0006_sales_module.sql` e `supabase/migrations/0007_team_management.sql` e `supabase/migrations/0008_service_catalog.sql` e `supabase/migrations/0009_platform_admin.sql`.
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

## Ativar o primeiro Super Admin\nApós executar a migração `0009_platform_admin.sql`, localize o usuário já cadastrado em Authentication > Users e execute no SQL Editor, substituindo pelo UUID real da conta administrativa:\n\n```sql\ninsert into public.platform_admins (user_id)\nvalues ('UUID-DO-USUARIO-AUTORIZADO');\n```\n\nA tabela não possui políticas de leitura ou gravação para o navegador. A autorização é verificada por funções SQL; não exponha a chave `service_role`.\n\n## Estado atual
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. Os módulos iniciais de clientes, aparelhos e ordens de serviço já estão conectados ao PostgreSQL no código, mas dependem da execução das migrações e da configuração do Supabase. A gestão inicial de equipe e o painel Super Admin estão implementados no código. O Super Admin pode cadastrar planos e controlar o status e os períodos de assinatura. Os limites de usuários e filiais são verificados no banco com bloqueio transacional; status suspenso, cancelado, vencido ou em atraso bloqueia operações protegidas por função, preservando a possibilidade de consultar o vínculo da empresa. Convites por e-mail, integração de cobrança automática, edição completa de cadastros e testes de isolamento ainda precisam ser concluídos. O painel de relatórios apresenta indicadores calculados sobre os registros carregados para a filial selecionada. As migrações 0004 a 0009 precisam ser aplicadas no Supabase antes de usar estoque, financeiro, vendas, gestão de equipe, catálogo de serviços e painel Super Admin. A migração 0003 também precisa ser aplicada no Supabase real antes de usar a nova abertura transacional de OS. Não comercialize o acesso nem use dados reais até executar as migrações e concluir os testes e a revisão de segurança.

## Próximas etapas
1. Finalizar testes e validação de clientes, aparelhos, ordens e histórico no Supabase real.
2. Implementar convites seguros de equipe e validar as permissões por papel.
3. Finalizar convites, relatórios e validação de permissões do Super Admin.
4. Implementar gestão de planos, cobrança recorrente e webhooks no backend.
5. Testes de isolamento entre empresas, backup, monitoramento, recuperação e publicação.
