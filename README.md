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
- Políticas de função para limitar quem abre, atualiza e exclui ordens.
- Impressão de ordem de serviço em formato A4 no novo painel, com dados do cliente, aparelho, atendimento e campos de assinatura.
- Interface que respeita o perfil do membro ao habilitar atualização de status da OS.

## Configurar o banco e autenticação
1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No SQL Editor do projeto, execute os arquivos em ordem: `supabase/migrations/0001_saas_core.sql` e depois `supabase/migrations/0002_order_workflow_security.sql`.
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
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. Os módulos iniciais de clientes, aparelhos e ordens de serviço já estão conectados ao PostgreSQL no código, mas dependem da execução das duas migrações e da configuração do Supabase. Convites de equipe, edição completa de cadastros, estoque, financeiro, cobrança e testes de isolamento ainda precisam ser concluídos. Não comercialize o acesso nem use dados reais até executar as migrações e concluir os testes e a revisão de segurança.

## Próximas etapas
1. Finalizar testes e validação de clientes, aparelhos, ordens e histórico no Supabase real.
2. Implementar equipes, convites, permissões por papel e Super Admin separado.
3. Finalizar estoque, serviços, vendas, financeiro e relatórios.
4. Implementar gestão de planos, cobrança recorrente e webhooks no backend.
5. Testes de isolamento entre empresas, backup, monitoramento, recuperação e publicação.
