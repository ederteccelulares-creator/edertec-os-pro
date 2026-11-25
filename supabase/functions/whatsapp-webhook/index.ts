import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return ""; } })();
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")
  || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default; } catch { return ""; } })();
const admin = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
async function platformAdmin(req: Request) {
  if (!admin || !ANON_KEY) return { ok: false as const, status: 503, message: "Backend não configurado." };
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return { ok: false as const, status: 401, message: "Autenticação necessária." };
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(jwt);
  if (error || !data.user) return { ok: false as const, status: 401, message: "Sessão inválida." };
  const { data: isAdmin, error: checkError } = await userClient.rpc("is_platform_admin");
  if (checkError || isAdmin !== true) return { ok: false as const, status: 403, message: "Acesso exclusivo do Super Admin." };
  return { ok: true as const, userId: data.user.id };
}
async function loadSecrets() {
  if (!admin) return null;
  const { data, error } = await admin.rpc("get_platform_whatsapp_secrets");
  if (error) { console.error("whatsapp_secret_lookup_failed", error.code); return null; }
  return data || null;
}
async function validMetaSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${hex}`;
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "settings") {
    const auth = await platformAdmin(req);
    if (!auth.ok) return json({ error: auth.message }, auth.status);
    if (!admin) return json({ error: "Backend não configurado." }, 503);
    if (req.method === "GET") {
      const { data, error } = await admin.rpc("get_platform_whatsapp_config_status");
      if (error) return json({ error: "Não foi possível consultar a configuração." }, 500);
      return json(data || {});
    }
    if (req.method === "POST") {
      let input: Record<string, unknown>;
      try { input = await req.json(); } catch { return json({ error: "JSON inválido." }, 400); }
      const text = (key: string) => typeof input[key] === "string" ? String(input[key]).trim() : "";
      const { data, error } = await admin.rpc("save_platform_whatsapp_config", {
        p_user_id: auth.userId,
        p_app_id: text("app_id"),
        p_phone_number_id: text("phone_number_id"),
        p_waba_id: text("waba_id"),
        p_app_secret: text("app_secret"),
        p_access_token: text("access_token"),
        p_verify_token: text("verify_token"),
      });
      if (error) return json({ error: error.message || "Não foi possível salvar as configurações." }, 400);
      return json(data || { saved: true });
    }
    return json({ error: "Método não permitido." }, 405);
  }

  if (req.method === "GET") {
    const secrets = await loadSecrets();
    const mode = url.searchParams.get("hub.mode") || url.searchParams.get("hub_mode");
    const token = url.searchParams.get("hub.verify_token") || url.searchParams.get("hub_verify_token");
    const challenge = url.searchParams.get("hub.challenge") || url.searchParams.get("hub_challenge");
    if (mode === "subscribe" && secrets?.verify_token && token === secrets.verify_token && challenge) {
      return new Response(challenge, { status: 200, headers: { ...cors, "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
    return json({ error: "Webhook verification failed" }, 403);
  }

  if (req.method === "POST") {
    const secrets = await loadSecrets();
    if (!secrets?.app_secret) return json({ error: "App Secret não configurado." }, 503);
    const rawBody = await req.text();
    if (!(await validMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), secrets.app_secret))) {
      return json({ error: "Invalid webhook signature" }, 401);
    }
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON payload" }, 400); }
    if ((payload as { object?: string })?.object !== "whatsapp_business_account") {
      return json({ error: "Unsupported webhook object" }, 400);
    }
    return json({ received: true });
  }
  return json({ error: "Method not allowed" }, 405);
});
