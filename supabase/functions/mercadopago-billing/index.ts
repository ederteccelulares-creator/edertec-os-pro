import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function getApiKey(name: string): string | undefined {
  const direct = Deno.env.get(name);
  if (direct) return direct;
  const keys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (name === "SUPABASE_ANON_KEY" && keys) {
    try { return JSON.parse(keys).default; } catch { return undefined; }
  }
  return undefined;
}

function mapStatus(status: string): string {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "charged_back") return "charged_back";
  return "pending";
}

async function validSignature(req: Request, dataId: string, secret: string) {
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, rest.join("=")];
  }));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  const hex = Array.from(digest).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.toLowerCase().charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" && !(req.method === "GET" && new URL(req.url).searchParams.get("action") === "settings")) return response({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return undefined; } })();
  if (!supabaseUrl || !serviceKey) return response({ error: "Billing backend is not configured." }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Settings are available only to authenticated Super Admin accounts.
  if (action === "settings") {
    const authorization = req.headers.get("Authorization") || "";
    const jwt = authorization.replace(/^Bearer\\s+/i, "");
    const anonKey = getApiKey("SUPABASE_ANON_KEY");
    if (!jwt || !anonKey) return response({ error: "Authentication required." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) return response({ error: "Invalid session." }, 401);
    const { data: isAdmin } = await admin.from("platform_admins").select("user_id").eq("user_id", userData.user.id).maybeSingle();
    if (!isAdmin) return response({ error: "Super Admin access required." }, 403);

    if (req.method === "GET") {
      const { data, error } = await admin.rpc("get_platform_billing_config_status");
      if (error) return response({ error: "Could not load billing settings." }, 500);
      return response(data || { access_token_configured: false, webhook_secret_configured: false });
    }
    if (req.method === "POST") {
      let input: { access_token?: string; webhook_secret?: string };
      try { input = await req.json(); } catch { return response({ error: "Invalid JSON." }, 400); }
      const { data, error } = await admin.rpc("save_platform_billing_secrets", {
        p_user_id: userData.user.id,
        p_access_token: input.access_token || "",
        p_webhook_secret: input.webhook_secret || "",
      });
      if (error) return response({ error: error.message || "Could not save billing credentials." }, 400);
      return response(data || { configured: true });
    }
    return response({ error: "Method not allowed." }, 405);
  }

  const { data: storedSecrets } = await admin.rpc("get_platform_billing_secrets");
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || storedSecrets?.access_token;
  const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || storedSecrets?.webhook_secret;
  if (!accessToken) return response({ error: "Mercado Pago access token is not configured." }, 503);

  if (action === "webhook") {
    if (!webhookSecret) return response({ error: "Webhook secret is not configured." }, 503);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* query parameters may still identify the event */ }
    const data = (body.data && typeof body.data === "object") ? body.data as Record<string, unknown> : {};
    const dataId = String(url.searchParams.get("data.id") || data.id || "");
    if (!dataId) return response({ received: true });
    if (!await validSignature(req, dataId, webhookSecret)) return response({ error: "Invalid webhook signature." }, 401);

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!paymentResponse.ok) return response({ error: "Could not verify payment with Mercado Pago." }, 502);
    const mp = await paymentResponse.json();
    const externalReference = String(mp.external_reference || "");
    if (!externalReference) return response({ received: true });
    const { data: localPayment, error: lookupError } = await admin
      .from("platform_payments")
      .select("id,amount,currency,company_id,plan_id,status")
      .eq("external_reference", externalReference)
      .maybeSingle();
    if (lookupError) return response({ error: "Payment lookup failed." }, 500);
    if (!localPayment) return response({ received: true });

    const amount = Number(mp.transaction_amount);
    const currency = String(mp.currency_id || "");
    if (Math.abs(amount - Number(localPayment.amount)) > 0.009 || currency !== localPayment.currency) {
      return response({ error: "Payment amount or currency mismatch." }, 422);
    }
    const mapped = mapStatus(String(mp.status || "pending"));
    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_platform_payment", {
      p_payment_id: localPayment.id,
      p_provider_payment_id: String(mp.id),
      p_status: mapped,
      p_raw_status: String(mp.status || "unknown"),
    });
    if (finalizeError || finalized !== true) return response({ error: "Could not finalize payment." }, 500);
    return response({ received: true });
  }

  // Checkout creation requires a real signed-in user. Never trust company_id or price from the browser.
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "");
  const anonKey = getApiKey("SUPABASE_ANON_KEY");
  if (!jwt || !anonKey) return response({ error: "Authentication required." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
  if (userError || !userData.user) return response({ error: "Invalid session." }, 401);

  let input: { company_id?: string; plan_id?: string };
  try { input = await req.json(); } catch { return response({ error: "Invalid JSON." }, 400); }
  if (!input.company_id || !input.plan_id) return response({ error: "Choose a company and plan." }, 400);

  const { data: membership } = await admin.from("company_members")
    .select("role").eq("company_id", input.company_id).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "Only an active company owner or administrator can purchase a plan." }, 403);
  }
  const { data: company } = await admin.from("companies")
    .select("id,name,status").eq("id", input.company_id).maybeSingle();
  if (!company || company.status !== "active") return response({ error: "Company is unavailable." }, 403);
  const { data: plan } = await admin.from("subscription_plans")
    .select("id,name,price,billing_interval,is_active").eq("id", input.plan_id).eq("is_active", true).maybeSingle();
  if (!plan || Number(plan.price) <= 0) return response({ error: "Selected plan is unavailable." }, 400);

  const { data: localPayment, error: insertError } = await admin.from("platform_payments").insert({
    company_id: company.id,
    plan_id: plan.id,
    created_by: userData.user.id,
    external_reference: crypto.randomUUID(),
    amount: Number(plan.price),
    currency: "BRL",
    status: "pending",
  }).select("id,external_reference,amount").single();
  if (insertError || !localPayment) return response({ error: "Could not create payment record." }, 500);

  const siteUrl = Deno.env.get("BILLING_SITE_URL") || "https://edertecospro.com.br";
  const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-billing?action=webhook`;
  const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        id: plan.id,
        title: `Edertec OS Pro - ${plan.name}`,
        quantity: 1,
        currency_id: "BRL",
        unit_price: Number(plan.price),
      }],
      external_reference: localPayment.external_reference,
      notification_url: webhookUrl,
      back_urls: {
        success: `${siteUrl}/?billing=success`,
        pending: `${siteUrl}/?billing=pending`,
        failure: `${siteUrl}/?billing=failure`,
      },
      auto_return: "approved",
      statement_descriptor: "EDERTEC OS PRO",
      metadata: { payment_id: localPayment.id, company_id: company.id, plan_id: plan.id },
    }),
  });
  const preference = await preferenceResponse.json();
  if (!preferenceResponse.ok || !preference.init_point) {
    await admin.from("platform_payments").update({ status: "rejected", raw_status: "preference_creation_failed" }).eq("id", localPayment.id);
    return response({ error: "Mercado Pago could not create checkout." }, 502);
  }
  await admin.from("platform_payments").update({
    provider_preference_id: String(preference.id),
    checkout_url: String(preference.init_point),
  }).eq("id", localPayment.id);

  return response({ checkout_url: preference.init_point, payment_id: localPayment.id });
});
