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
- Persistência temporária no armazenamento local do navegador

## Executar localmente
```bash
npm install
npm run dev
```

## Próximas etapas
1. Cadastro completo de clientes e aparelhos
2. Impressão e PDF A4 com identidade visual da assistência
3. Autenticação, perfis e permissões
4. API e banco de dados centralizado para uso em rede
5. Estoque, serviços, financeiro e relatórios
6. Backup, trilha de auditoria e publicação

## Importante sobre os dados
A persistência atual usa o armazenamento local do navegador e serve apenas para prototipagem. Não é banco multiusuário, não sincroniza computadores e não deve armazenar senhas de desbloqueio ou dados sensíveis. A etapa de produção exigirá API, banco de dados, autenticação e backups seguros.
