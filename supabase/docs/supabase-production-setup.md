# Preparação para publicar no Supabase

Este procedimento prepara o projeto para uma instância Supabase real. Não execute em produção antes de conferir o projeto de destino e fazer um backup. O CI do GitHub valida as migrações em PostgreSQL descartável; isso não significa que elas já foram aplicadas no Supabase.

## 1. Criar ou selecionar o projeto

1. Entre em https://supabase.com/dashboard e crie um projeto para o Edertec OS Pro (ou selecione um projeto vazio dedicado).
2. Guarde o Project Reference, a senha do banco e a região em local seguro.
3. Em **Project Settings → API**, copie a Project URL e a chave pública (publishable/anon).
4. Configure `.env.local` com base em `.env.example`. Nunca coloque a chave `service_role` ou uma secret key em variáveis `VITE_*`.

## 2. Configurar o frontend

Defina no ambiente de hospedagem:
- `VITE_SUPABASE_URL`: URL do projeto.
- `VITE_SUPABASE_ANON_KEY`: chave pública publishable/anon compatível com o client atual.

Depois gere o frontend com `npm ci` e `npm run build`. Configure o domínio publicado em **Authentication → URL Configuration** (Site URL e Redirect URLs).

## 3. Aplicar as migrações

Instale a Supabase CLI, autentique-se e confira o projeto antes de vincular:

```bash
supabase --version
supabase login
supabase projects list
supabase link --project-ref SEU_PROJECT_REF
supabase migration list
```

Para um projeto novo e vazio, aplique as migrações versionadas:

```bash
supabase db push
supabase migration list
```

As migrações devem ser aplicadas na ordem do diretório `supabase/migrations` (atualmente 0001–0018). Se o projeto já tiver alterações feitas pelo Dashboard ou migrações registradas fora deste repositório, pare e reconcilie o histórico antes de executar `db push`. Não use `db reset` em produção: ele pode apagar dados.

## 4. Configurar Auth e convites

- Habilite o provedor Email em **Authentication → Providers**.
- Configure SMTP próprio em **Authentication → SMTP Settings** para entrega confiável dos convites; revise templates e remetente.
- Configure Site URL e Redirect URLs para o domínio real.
- A função `invite-team` usa as variáveis padrão do Supabase no runtime e, opcionalmente, `APP_SITE_URL` como secret para o redirecionamento do convite.
- A inclusão de contas que já existem no Auth ainda não é suportada pela lógica atual.

## 5. Publicar as Edge Functions

As quatro funções usam autenticação JWT; a configuração correspondente está em `supabase/config.toml`. Após aplicar as migrações, publique:

```bash
supabase functions deploy invite-team
supabase functions deploy export-organization
supabase functions deploy validate-organization-backup
supabase functions deploy restore-organization-backup
```

O Supabase fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` ao runtime das Edge Functions. A chave privilegiada deve permanecer exclusivamente no servidor. Opcionalmente, defina o endereço publicado para os convites:

```bash
supabase secrets set APP_SITE_URL=https://SEU-DOMINIO
```

## 6. Primeiro Super Admin

Depois que a primeira conta administrativa estiver criada e confirmada em **Authentication → Users**, use o SQL Editor para inserir o UUID real na allowlist, conforme o bloco da seção “Ativar o primeiro Super Admin” do README. Não cadastre UUID fictício nem exponha a chave de serviço.

## 7. Validação pós-publicação

1. Confirme `supabase migration list` e verifique que todas as migrações esperadas foram aplicadas.
2. Confirme as quatro funções em **Edge Functions**.
3. Execute os Security Advisors no Dashboard.
4. Teste em uma empresa de homologação: cadastro, login, criação de organização, abertura e atualização de OS, estoque, venda, financeiro, convite, exportação e validação/restauração de backup.
5. Teste isolamento com dois usuários de organizações diferentes.
6. Só depois de revisar os resultados e os logs considere inserir dados reais.

## 8. Publicação manual pelo GitHub Actions

O workflow `.github/workflows/deploy-supabase.yml` é manual e exige o GitHub Environment `production`. Cadastre nesse Environment os secrets:
- `SUPABASE_ACCESS_TOKEN`: Personal Access Token do Supabase.
- `SUPABASE_PROJECT_REF`: Project Reference do projeto correto.
- `SUPABASE_DB_PASSWORD`: senha do banco desse projeto.

O workflow aplica migrações e publica as quatro Edge Functions. Proteja o Environment com revisores obrigatórios antes de habilitar a publicação. Não configure o deploy para rodar automaticamente em todo push.

## Situação conhecida

O repositório passou nos testes automatizados de build, migrações, segurança, RLS multiempresa e restauração transacional no PostgreSQL de CI. Nenhum projeto Supabase remoto está associado atualmente à integração desta conversa; portanto, nenhuma migração ou função foi publicada em banco real. A homologação remota continua pendente.
