# Checklist de publicação — Edertec OS Pro

Este roteiro separa a preparação do repositório da ativação de um projeto Supabase real. O CI usa PostgreSQL descartável; ele não configura nem valida um projeto de produção.

## 1. Antes de criar ou alterar o projeto

- [ ] Confirmar que o projeto Supabase de destino é o correto e está no ambiente esperado (homologação ou produção).
- [ ] Registrar o Project URL e o Project Reference ID.
- [ ] Fazer backup do banco de destino antes de qualquer migração.
- [ ] Confirmar que não há dados reais no projeto de homologação ou que existe um plano de migração aprovado.
- [ ] Não usar o teste de isolamento nem o teste transacional de restauração do CI contra produção: eles criam e removem dados sintéticos.

## 2. Configuração do frontend

No painel Supabase, em **Project Settings → API**, obter:
- Project URL → `VITE_SUPABASE_URL`
- Publishable key (ou anon key legada) → `VITE_SUPABASE_ANON_KEY`

Configurar essas duas variáveis no ambiente de build da hospedagem (por exemplo, GitHub Actions/Secrets ou painel do host). Para desenvolvimento local, copiar `.env.example` para `.env.local`.

**Nunca** colocar `service_role`, secret key ou qualquer segredo privilegiado em variável `VITE_*`, arquivo versionado, navegador ou mensagem pública.

## 3. Aplicar o banco

Aplicar uma única vez, em ordem crescente, todos os arquivos `supabase/migrations/0001_*.sql` até `0018_*.sql` no SQL Editor do projeto Supabase.

- [ ] Conferir o nome do arquivo antes de executar cada migração.
- [ ] Aguardar a conclusão sem erro antes de seguir para a próxima.
- [ ] Não pular migrações intermediárias.
- [ ] Em caso de erro, parar; não executar migrações seguintes por tentativa.
- [ ] Guardar o resultado de cada execução no registro de implantação.

As migrações criam tabelas, funções, triggers, índices e políticas RLS. O arquivo `0018_transactional_backup_restore.sql` também cria os bloqueios por organização usados para evitar gravações concorrentes durante a restauração.

## 4. Autenticação

Em **Authentication → URL Configuration**:
- [ ] Definir o Site URL como o domínio final do app.
- [ ] Adicionar as URLs de redirecionamento de produção e homologação.
- [ ] Adicionar a URL local de desenvolvimento apenas se necessária.

Em **Authentication → Providers**:
- [ ] Habilitar Email.
- [ ] Definir se a confirmação de e-mail será obrigatória.
- [ ] Configurar SMTP próprio antes de convidar usuários em produção, para evitar dependência de limites de e-mail de teste.
- [ ] Testar cadastro, confirmação, login, logout e recuperação de senha.

## 5. Edge Functions

Publicar no projeto vinculado:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy invite-team
supabase functions deploy export-organization
supabase functions deploy validate-organization-backup
supabase functions deploy restore-organization-backup
```

A configuração `supabase/config.toml` mantém `verify_jwt = true` nas quatro funções. O Supabase fornece as variáveis internas `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY) ao ambiente da Edge Function. A chave privilegiada deve permanecer exclusivamente no ambiente seguro do Supabase.

Opcional para convites:
```bash
supabase secrets set APP_SITE_URL=https://SEU-DOMINIO
```

## 6. Primeiro administrador da plataforma

Depois de criar e confirmar a conta administrativa em **Authentication → Users**, executar no SQL Editor, substituindo pelo UUID exato da conta autorizada:

```sql
insert into public.platform_admins (user_id)
values ('UUID-DO-USUARIO-AUTORIZADO');
```

Não inserir usuários comuns nessa allowlist. Conferir que o usuário consegue abrir o painel Super Admin e que uma conta comum não consegue acessá-lo.

## 7. Smoke tests em homologação

Usar contas e dados fictícios. Não reutilizar dados de clientes reais.

- [ ] Criar empresa e confirmar filial Matriz e período de teste.
- [ ] Criar duas empresas separadas e usuários distintos.
- [ ] Confirmar que clientes, aparelhos, OS, estoque, vendas e financeiro de uma empresa não aparecem na outra.
- [ ] Testar papéis owner, admin, manager, attendant e technician.
- [ ] Criar OS, atribuir técnico, atualizar status, imprimir A4 e consultar histórico.
- [ ] Testar estoque por filial, venda, baixa de estoque e lançamento financeiro.
- [ ] Testar convite por e-mail com conta nova.
- [ ] Testar exportação e validação de backup.
- [ ] Só testar restauração com uma empresa de homologação descartável e backup sintético, respeitando o requisito de destino vazio e mesmo UUID de organização.
- [ ] Confirmar que falhas de restauração não deixam registros parciais.
- [ ] Conferir logs de Auth e Edge Functions; remover dados sintéticos ao final.

Os testes automatizados em `.github/workflows/build.yml` são executados em PostgreSQL descartável. Eles não substituem estes testes de integração em Supabase real.

## 8. Publicação e monitoramento

- [ ] Configurar as duas variáveis públicas do frontend no host.
- [ ] Fazer build de produção e publicar o frontend.
- [ ] Testar login e fluxo principal em navegador desktop e celular.
- [ ] Configurar domínio, HTTPS e política de redirecionamento.
- [ ] Confirmar backups automáticos e retenção do banco conforme o plano Supabase.
- [ ] Definir responsáveis por suporte, incidentes, restauração e revisão de acesso.
- [ ] Revisar custos, cotas e limites antes de abrir cadastro público.

## Critério de liberação

Não liberar para clientes nem inserir dados reais até que as migrações estejam aplicadas sem erro, as quatro Edge Functions estejam publicadas, as variáveis e URLs estejam corretas, os testes de duas empresas tenham passado em Supabase real e a revisão de segurança tenha sido concluída.
