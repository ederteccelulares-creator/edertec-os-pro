# Alertas externos pelo WhatsApp

O Edertec OS Pro envia uma notificação para o número de WhatsApp configurado pela assistência quando o cliente aprova ou recusa um orçamento pelo Portal do Cliente.

## Modelo de envio

Esta implementação usa a WhatsApp Business Platform (Cloud API) com um número remetente pertencente à plataforma Edertec OS Pro. Cada empresa configura seu próprio número de destino. Se cada assistência precisar enviar mensagens usando o próprio número comercial, será necessário implementar o onboarding Embedded Signup da Meta e armazenar credenciais isoladas por empresa.

O envio externo não substitui a notificação interna. A decisão, a mudança de status e a notificação interna são gravadas no banco antes da tentativa de envio. Se a API estiver indisponível, a decisão permanece salva e o resultado fica registrado em `whatsapp_notification_logs`.

## Configuração no Meta

1. Configure um aplicativo Meta com o produto WhatsApp e uma conta WhatsApp Business Platform.
2. Obtenha o token de acesso de produção e o Phone Number ID do número remetente.
3. Crie e envie para aprovação um modelo de mensagem com categoria apropriada e idioma `pt_BR`.
4. O corpo do modelo deve ter exatamente quatro variáveis, nesta ordem:
   - `{{1}}`: nome da assistência.
   - `{{2}}`: número da ordem de serviço.
   - `{{3}}`: nome do cliente.
   - `{{4}}`: decisão (APROVADO ou RECUSADO).

Texto sugerido para o modelo:

> Atualização da {{1}}: o orçamento da OS #{{2}}, do cliente {{3}}, foi {{4}}. Consulte o painel Edertec OS Pro para ver os detalhes.

O número de destino deve ter consentimento para receber avisos da assistência. A Meta pode exigir aprovação do modelo e regras adicionais de opt-in.

## Segredos da Edge Function

Configure os seguintes segredos no projeto Supabase usando o painel de Secrets ou a CLI. Nunca coloque esses valores no frontend, no banco em texto aberto ou no Git:

- `WHATSAPP_ACCESS_TOKEN`: token de acesso da Meta.
- `WHATSAPP_PHONE_NUMBER_ID`: Phone Number ID remetente.
- `WHATSAPP_GRAPH_API_VERSION`: versão Graph API ativa na sua conta, no formato `vNN.N`.
- `WHATSAPP_TEMPLATE_NAME`: nome exato do modelo aprovado.
- `WHATSAPP_TEMPLATE_LANGUAGE`: código de idioma do modelo; normalmente `pt_BR`.

Exemplo de configuração via CLI, substituindo cada marcador localmente:

```bash
supabase secrets set WHATSAPP_ACCESS_TOKEN='SEU_TOKEN' WHATSAPP_PHONE_NUMBER_ID='SEU_PHONE_NUMBER_ID' WHATSAPP_GRAPH_API_VERSION='VERSAO_ATIVA' WHATSAPP_TEMPLATE_NAME='edertec_quote_decision' WHATSAPP_TEMPLATE_LANGUAGE='pt_BR'
```

## Implantação

Aplicar a migration `0023_whatsapp_quote_alerts.sql`, publicar a Edge Function `respond-service-order-quote` com verificação JWT desativada (a função valida o token bearer individual do portal), e publicar o frontend.

A configuração do projeto Supabase ainda precisa ser aplicada no ambiente real. O repositório e o CI validam o código e a migração no PostgreSQL de testes; isso não significa que a Meta ou a Edge Function já estejam ativas em produção.

## Teste recomendado

1. Salve o número de destino no painel do Edertec OS Pro, incluindo código do país e DDD (ex.: `55DDNUMERO`).
2. Ative os alertas.
3. Gere um novo link do portal para uma OS de teste em estado aguardando aprovação.
4. Aprove ou recuse o orçamento no portal.
5. Confirme a notificação interna e o registro de entrega em `whatsapp_notification_logs`.
6. Se o WhatsApp falhar, consulte `error_message`, as credenciais, o modelo aprovado e o opt-in do destinatário.
