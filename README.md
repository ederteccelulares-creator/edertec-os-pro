# Edertec OS Pro

Sistema de gestão para assistência técnica de celulares.

## Stack
- React + TypeScript
- Vite
- Lucide icons
- CSS responsivo (desktop e celular)

## Funcionalidades implementadas
- Dashboard com indicadores calculados a partir das ordens cadastradas
- Cadastro de ordens de serviço com número sequencial
- Dados do cliente, telefone, marca/modelo, defeito, valor estimado e status
- Lista, busca e filtro por status
- Alteração do andamento da OS
- Visualização de detalhes da ordem
- Cadastro de clientes com telefone, CPF, e-mail e endereço
- Perfil do cliente com histórico de ordens por telefone
- Criação automática de cadastro básico quando uma OS é aberta para um novo telefone
- Dados adicionais de entrada: IMEI/série, acessórios e condição física
- Modelo de impressão A4 com identificação da OS, dados do cliente/aparelho, defeito, valor e assinaturas
- Impressão pelo navegador com opção de salvar como PDF
- Persistência temporária no armazenamento local do navegador

## Executar localmente
```bash
npm install
npm run dev
```

## Próximas etapas
1. Cadastro completo de clientes e aparelhos
2. Completar o documento A4 com logo oficial, endereço, CNPJ/contatos e termos configuráveis
3. Autenticação, perfis e permissões
4. API e banco de dados centralizado para uso em rede
5. Estoque, serviços, financeiro e relatórios
6. Backup, trilha de auditoria e publicação

## Importante sobre os dados
A persistência atual usa o armazenamento local do navegador e serve apenas para prototipagem. Não é banco multiusuário, não sincroniza computadores e não deve armazenar senhas de desbloqueio ou dados sensíveis. A etapa de produção exigirá API, banco de dados, autenticação e backups seguros.
