import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  let body: { token?: string; decision?: string };
  try { body = await req.json(); } catch { return response({ error: "Solicitação inválida." }, 400); }

  const token = body.token?.trim();
  const decision = body.decision;
  if (!token || !/^[0-9a-f]{64}$/.test(token) || !["approved", "declined"].includes(decision || "")) {
    return response({ error: "Link ou decisão inválida." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "Serviço temporariamente indisponível." }, 503);
  }

  const publicClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Validate the bearer link before accepting a public decision.
  const { data: portal, error: portalError } = await publicClient.rpc("get_service_order_portal", {
    p_token: token,
  });
  if (portalError || !portal) return response({ error: "Link inválido, revogado ou expirado." }, 404);

  const { data: result, error: decisionError } = await publicClient.rpc("respond_service_order_quote", {
    p_token: token,
    p_decision: decision,
  });
  if (decisionError || !result) {
    return response({ error: decisionError?.message || "Não foi possível registrar a decisão." }, 409);
  }

  const { data: target, error: targetError } = await adminClient.rpc("get_service_order_whatsapp_target", {
    p_token: token,
  });

  let whatsappSent = false;
  let deliveryStatus: "sent" | "failed" | "skipped" = "skipped";
  let providerMessageId: string | null = null;
  let deliveryError: string | null = null;

  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const graphVersion = Deno.env.get("WHATSAPP_GRAPH_API_VERSION");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") || "pt_BR";

  if (targetError) {
    deliveryStatus = "failed";
    deliveryError = "Não foi possível consultar o destino configurado.";
  } else if (target?.enabled && target?.recipient_phone && accessToken && phoneNumberId && graphVersion && templateName) {
    const decisionLabel = decision === "approved" ? "APROVADO" : "RECUSADO";
    try {
      const graphResponse = await fetch(
        `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: target.recipient_phone,
            type: "template",
            template: {
              name: templateName,
              language: { code: templateLanguage },
              components: [{
                type: "body",
                parameters: [
                  { type: "text", text: String(target.organization_name || "Assistência") },
                  { type: "text", text: String(target.order_number) },
                  { type: "text", text: String(target.customer_name || "Cliente") },
                  { type: "text", text: decisionLabel },
                ],
              }],
            },
          }),
        },
      );
      const graphBody = await graphResponse.json().catch(() => ({}));
      if (!graphResponse.ok) {
        deliveryStatus = "failed";
        deliveryError = String(graphBody?.error?.message || "A Meta não aceitou o envio. Verifique o modelo aprovado e as credenciais.");
      } else {
        deliveryStatus = "sent";
        whatsappSent = true;
        providerMessageId = graphBody?.messages?.[0]?.id || null;
      }
    } catch {
      deliveryStatus = "failed";
      deliveryError = "Falha de conexão com a API do WhatsApp.";
    }
  } else if (target?.enabled) {
    deliveryStatus = "skipped";
    deliveryError = "Integração WhatsApp ainda não foi configurada no servidor.";
  }

  if (target && target.organization_id && target.branch_id && target.service_order_id) {
    await adminClient.from("whatsapp_notification_logs").insert({
      organization_id: target.organization_id,
      branch_id: target.branch_id,
      service_order_id: target.service_order_id,
      recipient_phone: target.recipient_phone || "",
      notification_type: decision === "approved" ? "quote_approved" : "quote_declined",
      delivery_status: deliveryStatus,
      provider_message_id: providerMessageId,
      error_message: deliveryError,
    });
  }

  // The decision and in-app alert are committed even when WhatsApp delivery fails.
  return response({
    success: true,
    decision: result.decision,
    status: result.status,
    approved_amount: result.approved_amount,
    decided_at: result.decided_at,
    whatsapp_sent: whatsappSent,
    whatsapp_status: deliveryStatus,
  });
});
