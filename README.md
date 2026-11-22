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
- Bloqueio do painel local antigo enquanto os módulos operacionais não estiverem conectados ao banco, evitando misturar dados entre empresas.
- Protótipo anterior de dashboard, OS, clientes e impressão A4 preservado no repositório para migração progressiva.

## Configurar o banco e autenticação
1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. No SQL Editor do projeto, execute o arquivo `supabase/migrations/0001_saas_core.sql`.
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
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. O painel operacional ainda não foi migrado para consultas ao PostgreSQL. Não use dados reais de clientes nem comercialize o acesso até completar a migração dos módulos, testes automatizados e revisão de segurança.

## Próximas etapas
1. Conectar clientes, aparelhos e ordens de serviço ao PostgreSQL, incluindo seleção de filial e histórico de status.
2. Implementar equipes, convites, permissões por papel e Super Admin separado.
3. Finalizar estoque, serviços, vendas, financeiro e relatórios.
4. Implementar gestão de planos, cobrança recorrente e webhooks no backend.
5. Testes de isolamento entre empresas, backup, monitoramento, recuperação e publicação.
