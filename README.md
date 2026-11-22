# Edertec OS Pro

Sistema SaaS de gestão para assistências técnicas de celulares, planejado para atender várias empresas com isolamento de dados por organização.

## Stack
- React + TypeScript + Vite
- Supabase Auth + PostgreSQL + Row Level Security
- Lucide icons
- CSS responsivo (desktop e celular)

## Base SaaS adicionada
- Organizações independentes (tenants)
- Membros e papéis: owner, admin, manager, attendant e technician
- Filiais por organização (cria automaticamente a Matriz)
- Clientes, aparelhos e ordens de serviço vinculados à organização
- Histórico de alterações de status das OS
- Planos e assinaturas com período de teste inicial de 14 dias
- Registros de auditoria
- Políticas RLS para impedir leitura e alteração cruzada entre organizações
- Cliente Supabase tipado e variáveis de ambiente de exemplo

## Configuração do Supabase
1. Crie um projeto no Supabase.
2. No SQL Editor, execute o conteúdo de `supabase/migrations/0001_saas_core.sql`.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com os dados do projeto.
5. Instale as dependências e inicie o projeto:
   ```bash
   npm install
   npm run dev
   ```

**Nunca coloque a chave `service_role` no navegador ou em variáveis `VITE_*`.** O frontend deve usar somente a chave pública anon; operações administrativas e integrações de cobrança devem passar por backend seguro.

## Funcionalidades da interface em evolução
- Dashboard e ordens de serviço em protótipo
- Cadastro de clientes e histórico de atendimentos
- Impressão de OS em A4 / salvar PDF
- Layout adaptado para desktop e celular

## Próximas entregas
1. Tela de autenticação e criação de assistência com onboarding.
2. Conectar clientes, aparelhos e OS ao PostgreSQL (remover persistência local).
3. Gestão de equipe, convites e permissões.
4. Cadastro de aparelhos e estoque.
5. Financeiro, vendas, relatórios e notificações.
6. Painel Super Admin para empresas, planos e assinaturas.
7. Integração de cobrança recorrente e webhooks via backend.
8. Testes automatizados, backups, monitoramento e publicação.

## Estado e segurança
O painel atual ainda contém módulos em prototipagem com armazenamento local. A camada de banco multiempresa foi preparada, mas a interface ainda não está conectada ao Supabase. Portanto, não disponibilize o sistema para clientes nem armazene dados reais até concluir autenticação, conexão de dados, testes de isolamento e revisão de segurança.
