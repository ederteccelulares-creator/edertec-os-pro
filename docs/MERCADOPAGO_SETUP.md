# Configuração do Mercado Pago — Edertec OS Pro

O checkout e o webhook já estão implementados no Supabase Edge Function `mercadopago-billing`.

## Segredos obrigatórios (não colocar no GitHub nem no chat)

No painel Supabase do projeto `btouoeftgatyrvuobicr`, abra **Edge Functions → Secrets** e adicione:

- `MERCADOPAGO_ACCESS_TOKEN`: Access Token da aplicação Mercado Pago (produção).
- `MERCADOPAGO_WEBHOOK_SECRET`: assinatura secreta criada na configuração de Webhooks do Mercado Pago.
- `BILLING_SITE_URL`: `https://edertecospro.com.br` (opcional; esse é o padrão).

O token de acesso e a assinatura secreta devem ser copiados diretamente do painel do Mercado Pago para os Secrets do Supabase. Nunca use credenciais de produção em código público.

## Webhook no Mercado Pago

Em **Suas integrações → aplicação → Webhooks**, cadastre a URL de produção:

`https://btouoeftgatyrvuobicr.supabase.co/functions/v1/mercadopago-billing?action=webhook`

Ative o evento **Pagamentos** no modo de produção. Copie a chave secreta gerada pelo Mercado Pago para `MERCADOPAGO_WEBHOOK_SECRET` no Supabase.

## Fluxo de liberação

1. A empresa escolhe um plano na tela de assinatura e é redirecionada ao Checkout Pro.
2. O backend cria a cobrança com o preço consultado diretamente no banco.
3. O Mercado Pago envia o webhook.
4. O backend valida a assinatura HMAC e consulta o pagamento diretamente na API do Mercado Pago.
5. O backend confere referência, valor e moeda; somente pagamento aprovado gera uma nova assinatura ativa.
6. A confirmação é idempotente: notificações repetidas não criam ativações duplicadas.

## Teste antes de vender

- Configure primeiro credenciais de teste e teste com usuários/cartões de teste do Mercado Pago.
- Depois troque para credenciais de produção e valide um pagamento real de baixo valor.
- Confira a atualização da assinatura no painel Super Admin e o desbloqueio da empresa.
