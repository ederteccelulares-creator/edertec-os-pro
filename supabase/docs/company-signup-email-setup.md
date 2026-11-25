# E-mails de cadastro de empresas

## 1. Confirmação de endereço (Supabase Auth)

No Supabase Dashboard, abra **Authentication → Email Templates → Confirm signup** e personalize o HTML. O cadastro envia os metadados `full_name` e `signup_company_name`; use também `{{ .ConfirmationURL }}` para manter o link seguro de confirmação.

Modelo recomendado:

```html
<div style="font-family:Arial,sans-serif;background:#0b0f16;color:#e8edf5;padding:32px">
  <div style="max-width:600px;margin:auto;background:#121923;border:1px solid #293444;border-radius:16px;padding:32px">
    <h2>EDERTEC <span style="color:#ef4444">OS PRO</span></h2>
    <h1>Confirme seu e-mail</h1>
    <p>Olá, {{ .Data.full_name }}!</p>
    <p>Recebemos o cadastro da assistência <strong>{{ .Data.signup_company_name }}</strong>.</p>
    <p>Confirme seu endereço para ativar sua conta e concluir a criação do ambiente da empresa.</p>
    <p style="margin:28px 0"><a href="{{ .ConfirmationURL }}" style="background:#ef4444;color:#fff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:bold">CONFIRMAR E-MAIL</a></p>
    <p style="color:#9aa7b8;font-size:13px">Se você não solicitou este cadastro, ignore esta mensagem. Nunca compartilhamos sua senha por e-mail.</p>
    <p style="color:#758195;font-size:12px">Edertec OS Pro · Gestão inteligente para assistências técnicas</p>
  </div>
</div>
```

O frontend envia `emailRedirectTo` usando `VITE_APP_URL` ou a origem atual do site. Cadastre a URL correspondente em **Authentication → URL Configuration → Redirect URLs**. Configure também SMTP de produção em **Authentication → SMTP Settings** para entrega confiável.

## 2. Boas-vindas após confirmação

A função `send-company-welcome` só aceita sessão autenticada do proprietário com e-mail confirmado e vínculo ativo. Ela consulta os dados reais da empresa e envia código da empresa, usuário, e-mail e link do sistema. A tabela `company_welcome_emails` impede duplicidade por empresa/proprietário.

1. Aplique a migração `20261125190000_company_welcome_email.sql`.
2. Verifique um domínio remetente no Resend.
3. Defina os secrets no Supabase (não no frontend):
   ```bash
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
   supabase secrets set RESEND_FROM_EMAIL="Edertec OS Pro <acesso@SEU-DOMINIO-VERIFICADO>"
   supabase secrets set APP_SITE_URL=https://edertecospro.com.br
   ```
4. Publique a função:
   ```bash
   supabase functions deploy send-company-welcome
   ```

A função é chamada depois que o proprietário confirma o e-mail e o cadastro da empresa é concluído. Se o provedor estiver indisponível, o acesso não é bloqueado e os dados permanecem visíveis na tela; o erro de envio é apresentado para diagnóstico.

**Importante:** a personalização do template Auth é feita no Dashboard; a migração e a Edge Function precisam ser publicadas no Supabase real. Nenhum segredo deve ser colocado no frontend ou commitado no Git.
