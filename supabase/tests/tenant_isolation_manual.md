# Roteiro de testes reais — isolamento multiempresa

Execute somente em um projeto Supabase de homologação, com dados fictícios. Não use dados reais de clientes.

## Preparação

Crie duas empresas independentes (Empresa A e Empresa B) e os seguintes usuários autenticados:

- A1: proprietário da Empresa A.
- A2: atendente da Empresa A.
- A3: técnico da Empresa A.
- B1: proprietário da Empresa B.
- B2: atendente da Empresa B.

Cadastre uma filial, um cliente, um aparelho, uma OS, um produto e uma venda em cada empresa. Atribua a OS da Empresa A ao técnico A3. Cadastre também um lançamento financeiro em cada empresa.

## Testes de isolamento

| Ação | Usuário | Resultado esperado |
|---|---|---|
| Listar clientes da Empresa A | A1 ou A2 | Somente clientes da Empresa A |
| Consultar diretamente o ID de cliente da Empresa B | A1 ou A2 | Nenhuma linha retornada |
| Listar aparelhos da Empresa B | A1 | Nenhuma linha retornada |
| Consultar OS da Empresa B | A1 | Nenhuma linha retornada |
| Tentar abrir OS usando filial ou cliente da Empresa B | A1 | Operação rejeitada |
| Tentar mover cliente da Empresa A para B | A1 | Trigger rejeita alteração |
| Tentar mover aparelho para outro cliente | A1 | Trigger rejeita alteração |
| Tentar alterar diretamente campos da OS | A1 | RLS rejeita UPDATE direto |
| Tentar inserir OS diretamente pela API | A1 | RLS rejeita INSERT direto |
| Alterar status de OS atribuída | A3 | Permitido, com evento e auditoria |
| Alterar status de OS não atribuída | A3 | Função rejeita |
| Consultar vendas de outro atendente da mesma empresa | A2 | Nenhuma linha retornada |
| Consultar todas as vendas e custos | A1 | Permitido |
| Consultar lançamentos financeiros | A2 | Nenhuma linha retornada |
| Criar ou alterar lançamento financeiro | A2 | Função rejeita |
| Consultar estoque de outra empresa | A1 | Nenhuma linha retornada |
| Tentar alterar o saldo diretamente | A2 | RLS rejeita |
| Ajustar estoque pela função autorizada | A1 | Permitido, com movimento e auditoria |

## Evidências que devem ser guardadas

Para cada cenário, registre:
- Usuário e função utilizados.
- Empresa ativa no momento do teste.
- Ação executada e ID fictício do registro.
- Resultado esperado e resultado obtido.
- Mensagem de erro ou retorno da API.
- Data/hora e versão das migrações aplicadas.

## Critério de aprovação

Todos os cenários negativos precisam ser bloqueados pelo banco, não apenas escondidos pela interface. Todos os cenários positivos precisam funcionar e manter histórico/auditoria quando aplicável. Se qualquer teste falhar, interrompa a homologação e corrija antes de usar dados reais.

Este roteiro é manual e ainda precisa ser executado com usuários reais de homologação. O script `security_regression.sql` faz verificações estruturais, não substitui estes testes de ponta a ponta.
