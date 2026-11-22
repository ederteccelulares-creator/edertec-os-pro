import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return respond({ error: "Sessão não informada." }, 401);

  let body: { company_id?: string; idempotency_key?: string; backup?: unknown };
  try { body = await req.json(); } catch { return respond({ error: "JSON inválido." }, 400); }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!body.company_id || !uuidPattern.test(body.company_id)
      || !body.idempotency_key || !uuidPattern.test(body.idempotency_key)
      || !body.backup || typeof body.backup !== "object") {
    return respond({ error: "Empresa, chave de operação e arquivo de backup são obrigatórios." }, 400);
  }
  if (JSON.stringify(body.backup).length > 10 * 1024 * 1024) {
    return respond({ error: "O backup ultrapassa o limite de 10 MB." }, 413);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return respond({ error: "Serviço de restauração não configurado." }, 503);

  const publicClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await publicClient.auth.getUser(match[1]);
  if (authError || !authData.user) return respond({ error: "Sessão inválida ou expirada." }, 401);

  const { data, error } = await adminClient.rpc("restore_company_backup", {
    p_company_id: body.company_id,
    p_actor_user_id: authData.user.id,
    p_idempotency_key: body.idempotency_key,
    p_backup: body.backup,
  });
  if (error) {
    const status = /não autorizado|only a company owner|Only a company owner/i.test(error.message) ? 403 : 400;
    return respond({ error: error.message }, status);
  }
  return respond({ success: true, result: data });
});
