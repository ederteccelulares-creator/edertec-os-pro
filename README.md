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
2. No SQL Editor do projeto, execute os arquivos em ordem: `supabase/migrations/0001_saas_core.sql`, `supabase/migrations/0002_order_workflow_security.sql` e `supabase/migrations/0003_role_access_atomic_order.sql` e `supabase/migrations/0004_inventory_module.sql` e `supabase/migrations/0005_financial_module.sql` e `supabase/migrations/0006_sales_module.sql` e `supabase/migrations/0007_team_management.sql` e `supabase/migrations/0008_service_catalog.sql` e `supabase/migrations/0009_platform_admin.sql` e `supabase/migrations/0010_team_invitations.sql` e `supabase/migrations/0011_membership_write_hardening.sql` e `supabase/migrations/0012_sales_pricing_and_privacy.sql` e `supabase/migrations/0013_service_order_write_hardening.sql` e `supabase/migrations/0014_tenant_record_immutability.sql` e `supabase/migrations/0015_operational_tenant_key_hardening.sql` e `supabase/migrations/0016_service_history_integrity.sql` e `supabase/migrations/0017_service_order_technician_assignment.sql` e `supabase/migrations/0018_transactional_backup_restore.sql`.
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
Depois de aplicar as migrações até `0017_service_order_technician_assignment.sql`, vincule o projeto Supabase à CLI e publique a Edge Function:

```bash
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy invite-team
```

A função exige JWT válido, verifica se o solicitante é proprietário ou administrador ativo, impede que administradores convidem outros administradores e verifica o status da assinatura e a cota de usuários. O segredo `SUPABASE_SERVICE_ROLE_KEY` é usado somente no ambiente seguro da Edge Function e nunca no navegador. Configure a URL de redirecionamento do convite em Authentication > URL Configuration no painel Supabase. Opcionalmente, defina `APP_SITE_URL` como secret da função para direcionar o convite à URL publicada.

## Estado atual
A camada inicial de autenticação e criação de organizações foi implementada no frontend, mas depende da criação e configuração do projeto Supabase pelo proprietário. Os módulos iniciais de clientes, aparelhos e ordens de serviço já estão conectados ao PostgreSQL no código, mas dependem da execução das migrações e da configuração do Supabase. A gestão inicial de equipe e o painel Super Admin estão implementados no código. O Super Admin pode cadastrar planos e controlar o status e os períodos de assinatura. Os limites de usuários e filiais são verificados no banco com bloqueio transacional; status suspenso, cancelado, vencido ou em atraso bloqueia operações protegidas por função, preservando a possibilidade de consultar o vínculo da empresa. A tela de equipe permite convidar funcionários por e-mail com funções restritas. O convite é processado por uma Supabase Edge Function autenticada, e o vínculo à empresa é criado no banco quando o usuário convidado conclui o cadastro. Convites para contas que já existem no Supabase ainda não são suportados. Integração de cobrança automática e edição completa de cadastros ainda precisam ser concluídas. Os testes automatizados de isolamento entre duas empresas passaram em PostgreSQL descartável no GitHub Actions, mas ainda não substituem homologação em uma instância Supabase real. O painel de relatórios apresenta indicadores calculados sobre os registros carregados para a filial selecionada. As migrações 0004 a 0017 precisam ser aplicadas no Supabase antes de usar estoque, financeiro, vendas, gestão de equipe, catálogo de serviços, painel Super Admin e convites de equipe. A migração 0003 também precisa ser aplicada no Supabase real antes de usar a nova abertura transacional de OS. Não comercialize o acesso nem use dados reais até executar as migrações e concluir os testes e a revisão de segurança.

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

Depois de aplicar todas as migrações `0001` a `0017` em um projeto Supabase de teste, execute `supabase/tests/security_regression.sql` no SQL Editor. O script verifica se as tabelas operacionais mantêm RLS, se a gravação direta de OS foi removida, se os triggers de imutabilidade estão instalados e se as políticas de privacidade de vendas existem. Esse teste estrutural não substitui testes de integração com duas empresas e usuários autenticados com funções diferentes.


O roteiro `supabase/tests/tenant_isolation_manual.md` descreve os cenários de homologação com duas empresas e usuários proprietários, atendentes e técnicos. Execute-o em um projeto Supabase separado, com dados fictícios, e guarde as evidências antes de liberar o sistema.


## Backup por empresa (exportação JSON)

A Edge Function `export-organization` gera um arquivo JSON com os dados operacionais de uma única empresa. O acesso exige sessão JWT válida e associação ativa com papel `owner` ou `admin`; a função valida a permissão no banco antes de consultar os dados. A chave `SUPABASE_SERVICE_ROLE_KEY` é usada somente no ambiente da Edge Function e nunca no navegador.

Depois de aplicar as migrações e publicar a função:

```bash
supabase functions deploy export-organization
```

A chamada deve ser feita com método POST, token Bearer do usuário autenticado e corpo JSON:

```json
{ "organization_id": "UUID-DA-EMPRESA" }
```

A resposta é o arquivo JSON de backup. Guarde-o em local privado e criptografado, pois contém dados pessoais e comerciais. Não compartilhe o arquivo publicamente.

**Limitações desta versão:** exporta até 10.000 registros por tabela e não inclui credenciais, contas de autenticação, convites pendentes, assinaturas ou dados globais da plataforma. Ainda não há restauração automática pelo painel. Para restaurar, use procedimento assistido em ambiente separado, validando relações, IDs e usuários antes de qualquer importação. Não importe o arquivo diretamente em produção.


## Validação de arquivo de backup

A função `validate-organization-backup` permite que proprietário ou administrador valide um JSON antes de iniciar uma restauração assistida. Ela confere formato, versão, empresa de origem, tabelas esperadas e `organization_id` de cada registro. A validação é somente leitura: não insere, atualiza nem exclui dados.

Publique com:

```bash
supabase functions deploy validate-organization-backup
supabase functions deploy restore-organization-backup
```

No painel da empresa, use **Backup e restauração → Validar arquivo JSON**. O arquivo deve ter até 10 MB e pertencer à mesma empresa selecionada. Um resultado válido significa apenas que a estrutura e a separação por empresa passaram nas verificações básicas; não comprova integridade de todas as relações nem executa uma restauração. A restauração automática continua desabilitada até a implementação de importação transacional e testes em homologação.
A validação também confere referências internas entre clientes, aparelhos, OS, filiais, estoque, vendas, serviços e lançamentos financeiros. O relatório sinaliza quando há referências a usuários do Supabase Auth: essas contas não são exportadas e precisarão ser mapeadas para usuários já existentes no destino antes de qualquer restauração. A checagem é estrutural e não substitui constraints/testes de banco.


## Integridade do histórico de serviços

A migração `0016_service_history_integrity.sql` impede reatribuir eventos e linhas de serviços a outra ordem, filial, empresa ou usuário responsável. Também protege as chaves do catálogo de serviços. Ela preserva os dados existentes e deve ser aplicada após a migração 0015.
A validação consulta também, em modo somente leitura, a quantidade atual de registros de cada tabela operacional da empresa de destino. O painel informa se o destino está vazio ou já contém dados e lista as tabelas ocupadas. Se houver dados no destino, uma futura restauração não deverá sobrescrevê-los automaticamente; será necessário um procedimento de mesclagem com regras explícitas. Essa prévia não executa importação e não libera a restauração.


### Plano de restauração segura (prévia)
A validação do backup agora discrimina, por tabela e campo, quantos registros dependem de referências a usuários do Supabase Auth (por exemplo, responsável pela OS, autor de eventos, vendedor e autor de movimentações). Também apresenta os IDs de origem encontrados, suas quantidades de referências, se o mesmo ID já pertence à equipe de destino e a lista de membros do destino com nome, papel e situação. Essas contas não fazem parte do arquivo JSON e precisarão ser mapeadas para usuários já existentes e membros ativos da empresa de destino antes de qualquer importação. A consulta é somente leitura e não grava associações. A interface permite selecionar um membro ativo para cada usuário de origem e pré-preenche automaticamente apenas quando o mesmo ID já corresponde a um membro ativo. Essas escolhas permanecem somente no estado da tela: não são persistidas, não alteram contas e ainda não habilitam a importação.

A prévia de ocupação do destino continua sendo somente leitura. A existência de registros, inclusive a filial Matriz criada no cadastro da empresa, não autoriza mesclagem automática. Ainda não existe rotina de restauração: não importar, sobrescrever nem excluir dados com base apenas no relatório. A próxima implementação deverá definir mapeamento explícito de IDs de filiais e usuários, ordem de dependências, validação de vínculos e execução transacional com rollback; até isso ser implementado e testado em ambiente separado, a restauração permanece indisponível.

A etapa de pré-validação de identidade também aceita o rascunho de associações e confere no servidor se todos os IDs de origem foram cobertos, se cada destino é membro ativo da empresa e se não há associações duplicadas ou IDs de origem desconhecidos. O resultado é informativo e não persiste o mapeamento nem executa a restauração.

A prévia também identifica as filiais do backup, seus códigos e nomes, e contabiliza referências em OS, estoque, movimentações, financeiro, vendas e linhas de serviços. O administrador pode associar cada filial de origem a uma filial ativa do destino; o servidor verifica cobertura completa, existência, situação ativa, IDs desconhecidos e associações duplicadas. Essa validação é somente leitura e não reescreve os IDs nas tabelas relacionadas. O relatório retorna `restore_ready: false` e `restore_blockers`; a importação transacional e a substituição dos IDs relacionados ainda não existem.



## Projeto técnico de restauração segura

O plano `supabase/docs/backup-restore-implementation-plan.md` documenta a ordem de dependências, os campos que exigem remapeamento de filiais e usuários, colisões de chaves únicas, colunas identity e os requisitos de transação/rollback. É documentação de implementação, não uma rotina de restauração. A função de validação permanece somente leitura e `restore_ready` permanece `false`.



## Contrato do schema para futura restauração

O script `supabase/tests/backup_restore_schema_contract.sql` faz uma verificação somente de leitura das chaves de organização, das relações entre as tabelas exportadas e das colunas identity de OS e vendas. Também confirma que cada relacionamento operacional entre empresas está protegido por uma chave estrangeira composta que inclui `organization_id` no mesmo vínculo, que as restrições de unicidade de filiais/categorias/estoque e o índice parcial de SKU estão presentes para detectar colisões, e que `service_order_lines.line_total` continua sendo uma coluna gerada. Execute-o em um projeto Supabase descartável depois das migrações 0001 a 0018. Ele não testa nem executa a restauração; serve para detectar divergências entre o schema instalado e o plano documentado em `supabase/docs/backup-restore-implementation-plan.md`.


## Verificação automatizada de banco no GitHub Actions

O workflow executa as migrações 0001–0018 em um PostgreSQL 16 descartável, usando `supabase/tests/postgres_auth_harness.sql` para simular somente os objetos mínimos do Supabase Auth necessários às migrações. Em seguida, executa `security_regression.sql` e `backup_restore_schema_contract.sql`.

Esse job verifica a compatibilidade SQL das migrações e as asserções estruturais em PostgreSQL isolado. Ele **não** equivale a uma homologação completa no Supabase: não testa PostgREST, Auth real, Edge Functions, políticas com sessões reais de usuários, e-mail, nem restauração transacional. Nenhum banco de produção é acessado ou alterado.

O workflow também cria duas empresas e três usuários sintéticos (proprietários das duas empresas e um técnico da primeira) e verifica, sob o papel `authenticated`, que cada empresa só enxerga seus próprios clientes; tenta bloquear gravação cruzada, vínculo de aparelho com cliente de outra empresa, alteração direta de função de membro e inserção direta de OS. Também cria OS de teste para verificar atribuição por proprietário, atualização de status pelo técnico responsável, bloqueio de atualização de OS não atribuída, bloqueio de atribuição pelo próprio técnico e bloqueio de tentativa de atribuição entre empresas. Esse smoke test valida RLS, privilégios e regras da RPC no PostgreSQL isolado, mas não simula todas as camadas de uma instância Supabase real.


## Atribuição de técnico nas ordens de serviço

A migração `0017_service_order_technician_assignment.sql` adiciona a atribuição e remoção de técnico responsável diretamente na lista de OS. Proprietários, administradores e gerentes podem selecionar apenas membros ativos com função de técnico na mesma empresa. A alteração é feita por RPC transacional, registra auditoria e bloqueia reatribuição em ordens entregues ou canceladas. Técnicos continuam podendo atualizar o status somente das ordens atribuídas a eles. A interface mostra o controle para perfis autorizados.


## Restauração transacional de backup (primeira versão)

A migração `0018_transactional_backup_restore.sql` adiciona uma rotina de restauração em uma única transação PostgreSQL e a Edge Function autenticada `restore-organization-backup`. A função exige proprietário ou administrador ativo, revalida o vínculo e os mapeamentos no banco, trava a organização durante a operação, remapeia referências de filiais e usuários, preserva snapshots e números identity, atualiza sequências e grava auditoria. Uma falha em qualquer inserção desfaz toda a operação. A chave de idempotência impede repetir acidentalmente a mesma restauração.

**Limite deliberado da primeira versão:** só restaura para a mesma organização lógica (mesmo UUID), com todas as tabelas operacionais vazias. As filiais de origem devem ser associadas individualmente a filiais ativas já existentes no destino; os usuários de origem devem ser associados a membros ativos diferentes. Não há mesclagem, criação automática de filiais nem sobrescrita. A tabela `branches` existente no onboarding é reutilizada, não importada. Os registros de auditoria operacionais precisam estar vazios para evitar colisões de identidade.

Publique a função após aplicar as migrações:

```bash
supabase functions deploy restore-organization-backup
```

A interface apresenta confirmação explícita, permite revisar os mapeamentos e mostra o resultado da operação. A restauração passou a ter testes automatizados de importação, remapeamento, idempotência e rollback em PostgreSQL descartável; ainda exige homologação em projeto Supabase real antes do uso com dados reais.
