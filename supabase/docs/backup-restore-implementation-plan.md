# Plano técnico de restauração segura

## Estado

Este documento descreve a implementação necessária. **Não existe restauração automática neste momento.** A função `validate-organization-backup` continua sendo somente leitura e retorna `applied: false` e `restore_ready: false`. Não criar uma função de importação até que todos os critérios abaixo tenham implementação e testes em um projeto Supabase isolado.

## 1. Contrato de identidade

- O backup deve pertencer à mesma organização lógica que será restaurada. A validação atual compara `backup.organization.id` com a organização autenticada.
- O `organization_id` de todos os registros precisa continuar sendo o ID da organização de destino. Nunca aceitar um ID de empresa diferente nem permitir que o cliente envie um `organization_id` por linha.
- IDs de clientes, aparelhos, produtos, categorias, serviços, OS, vendas, linhas e eventos podem ser preservados somente se o destino estiver vazio para essas entidades e não houver colisões. Qualquer estratégia de mesclagem exigirá um mapeamento explícito de IDs por tabela.
- IDs de filiais podem ser diferentes no destino. O mapa origem → destino deve ser completo, um-para-um, apontar apenas para filiais ativas da organização e ser aplicado a todas as referências de filial.
- Referências a usuários Auth não são exportadas como contas. Cada UUID de origem deve ser associado a um membro ativo já existente no destino. O mapa deve cobrir todas as referências e ser um-para-um.

## 2. Dependências e ordem de importação

A ordem abaixo respeita as chaves estrangeiras observadas nas migrações atuais:

1. **branches** — resolver cada ID de filial de origem para uma filial ativa já existente no destino. A filial Matriz criada automaticamente no onboarding pode ser reutilizada se o administrador a selecionar; esta versão não insere filiais.
2. **customers**, **inventory_items**, **financial_categories**, **service_catalog** — entidades-base sem dependência operacional entre si.
3. **devices** — depende de customers.
4. **branch_inventory** — depende de branches e inventory_items; a chave única é (branch_id, item_id), então o remapeamento não pode gerar duplicidade.
5. **service_orders** — depende de branches, customers e opcionalmente devices; remapear branch_id e technician_id/opened_by.
6. **financial_entries** — depende de branches e opcionalmente financial_categories; remapear branch_id e created_by.
7. **sales** — depende de branches e opcionalmente customers; remapear branch_id e sold_by.
8. **service_order_events** — depende de service_orders; remapear changed_by.
9. **stock_movements** — depende de branches e inventory_items; remapear branch_id e actor_id.
10. **sale_items** — depende de sales e inventory_items.
11. **service_order_lines** — depende de service_orders, branches e opcionalmente service_catalog; remapear branch_id e created_by.
12. **audit_logs** — importar por último; remapear actor_id. actor_id pode ser nulo conforme a FK atual.

A ordem deverá ser confirmada por constraints reais do banco no ambiente de homologação, não apenas pelo código do repositório.

## 3. Campos de identidade que precisam de mapeamento

| Tabela | Campo(s) |
|---|---|
| service_orders | branch_id, technician_id, opened_by |
| financial_entries | branch_id, created_by |
| sales | branch_id, sold_by |
| service_order_events | changed_by |
| stock_movements | branch_id, actor_id |
| service_order_lines | branch_id, created_by |
| audit_logs | actor_id |
| branch_inventory | branch_id |

O mapeamento de usuários deve verificar novamente, dentro da mesma transação de restauração, se o usuário continua sendo membro ativo da organização. A validação prévia na interface não é autorização suficiente para uma operação futura.

## 4. Colisões e campos especiais

- `branches`: unique (organization_id, code). Reutilizar ou criar filiais exige política explícita para códigos duplicados.
- `inventory_items`: índice único parcial por (organization_id, sku). Detectar colisões de SKU antes da escrita.
- `financial_categories`: unique (organization_id, name, entry_type). Detectar colisões antes da escrita.
- `branch_inventory`: unique (branch_id, item_id). Combinações repetidas após o remapeamento devem bloquear a operação.
- `service_orders.order_number` e `sales.sale_number`: são colunas identity GENERATED ALWAYS. A restauração precisa usar tratamento explícito de valores de identidade e atualizar as sequências depois da importação.
- `sale_items`: preservar snapshots de nome, custo e preço; não recalcular usando o preço atual do produto.
- `service_order_lines`: preservar snapshots de nome, quantidade e preço; não recalcular com o catálogo atual.
- `stock_movements`: preservar histórico e quantidades anteriores/posteriores; não chamar rotinas de venda ou ajuste de estoque durante a restauração, pois elas criariam novos movimentos.
- `financial_entries` gerados por vendas já estão no backup. Não chamar `create_sale` durante importação, para não gerar lançamentos duplicados nem baixar estoque novamente.
- `audit_logs`: manter registros históricos, mas não inventar um ator quando o usuário de origem não puder ser mapeado.

## 5. Transação, rollback e idempotência

A futura importação deve ocorrer em uma única transação PostgreSQL (preferencialmente uma função SQL/RPC dedicada, com execução restrita ao backend confiável) e falhar integralmente se qualquer validação ou inserção falhar. Não implementar importação como sequência de chamadas REST independentes: isso permitiria restauração parcial.

Antes da primeira escrita, dentro da transação:
- bloquear a organização de destino para impedir duas restaurações simultâneas;
- confirmar novamente papel autorizado, organização, formato, limites, associações e membros ativos;
- confirmar que as tabelas estão vazias, exceto exceções explicitamente previstas, ou aplicar uma estratégia de mesclagem aprovada;
- validar todas as referências, IDs, tipos, limites, duplicidades, constraints únicas e colisões após remapeamento;
- validar os limites de tamanho e quantidade por tabela.

Qualquer erro deve abortar a transação inteira. A operação deve ter um identificador/idempotency key persistido para impedir repetição acidental. Não usar `ON CONFLICT DO NOTHING` como substituto de validação, pois isso pode produzir restauração incompleta silenciosa.

## 6. Critérios de liberação

A restauração só poderá ser habilitada depois de:
1. implementar a rotina transacional e rollback;
2. aplicar o remapeamento de filiais e usuários em todas as referências;
3. resolver colisões e colunas identity/sequências;
4. validar dependências e constraints do schema real;
5. criar testes automatizados de sucesso, falha no meio da importação, rollback, repetição, duplicidades e tenant isolation;
6. testar com duas organizações e membros com papéis distintos em projeto Supabase isolado;
7. demonstrar que a falha não deixa registros parciais, estoque alterado ou lançamentos duplicados.

Até lá, manter a restauração indisponível e não executar importação manual em produção.
