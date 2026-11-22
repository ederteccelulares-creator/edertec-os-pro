# Próxima etapa de desenvolvimento — Edertec OS Pro

## Auditoria do ponto de continuação

O README descreve uma plataforma SaaS com Supabase, migrações 0001–0018 e módulos operacionais. Porém, a versão atualmente encontrada em `src/App.tsx` ainda contém uma interface de demonstração: ordens e clientes são gravados em `localStorage`, o seletor de empresa é apenas visual e os módulos de aparelhos, técnicos, estoque, serviços, financeiro e relatórios ainda exibem telas de placeholder.

Isso significa que a documentação e a interface executável precisam ser reconciliadas antes de qualquer comercialização. Não considerar o produto pronto só porque a documentação descreve os recursos.

## Ordem obrigatória de implementação

1. **Conectar a interface ao Supabase**
   - Criar um cliente Supabase único usando somente `VITE_SUPABASE_URL` e a chave pública.
   - Remover persistência de OS e clientes em `localStorage`.
   - Carregar a sessão e bloquear telas privadas sem autenticação.
   - Buscar a organização e a filial ativas do usuário autenticado.
   - Garantir que toda consulta use o contexto autenticado e que RLS seja a barreira final.

2. **Ordens de serviço**
   - Implementar listagem, abertura transacional, detalhes, edição permitida, atribuição de técnico e histórico.
   - Usar as RPCs e políticas existentes; não fazer insert/update direto em campos protegidos.
   - Gerar impressão A4 com via da assistência e via do cliente, preservando os dados da OS.

3. **Completar módulos reais**
   - Clientes e aparelhos.
   - Equipe e permissões.
   - Produtos, estoque e movimentações.
   - Catálogo de serviços.
   - Vendas e caixa.
   - Relatórios por filial.

4. **Preparação de produção**
   - Executar migrações 0001–0018 somente em projeto Supabase dedicado, após conferir o destino.
   - Publicar as quatro Edge Functions documentadas.
   - Configurar Auth, SMTP, URLs e secrets no ambiente seguro.
   - Rodar testes com duas organizações fictícias e papéis diferentes.
   - Revisar logs, backups, políticas RLS e build de produção.

## Critérios de aceite

- Nenhum dado operacional é salvo em `localStorage`.
- Dois usuários de empresas diferentes não conseguem consultar nem alterar dados um do outro.
- Alterações protegidas passam pelas funções SQL autorizadas.
- A aplicação funciona em celular e desktop.
- A OS impressa contém identificação da empresa, cliente, aparelho, defeito, acessórios, condição, valores, termos e assinaturas.
- Build e testes automatizados passam.
- Homologação real no Supabase é concluída antes de cadastrar dados reais.

## Limites de segurança

Nunca colocar `service_role`, senha do banco ou secrets em variáveis `VITE_*`, no código do frontend ou no repositório. Não executar `supabase db reset` em produção. Não publicar nem comercializar o sistema antes da homologação multiempresa.
