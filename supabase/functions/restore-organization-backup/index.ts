import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.values(value).every(item => typeof item === "string");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Sessão não encontrada." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: "Função não configurada." }, 500);

  let body: {
    organization_id?: string;
    idempotency_key?: string;
    backup?: Record<string, unknown>;
    branch_mapping?: Record<string, string>;
    user_mapping?: Record<string, string>;
  };
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 10 * 1024 * 1024) {
      return response({ error: "Arquivo maior que 10 MB." }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return response({ error: "Envie um JSON válido." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return response({ error: "O corpo da solicitação deve ser um objeto JSON." }, 400);
  }
  if (!body.organization_id || !/^[0-9a-f-]{36}$/i.test(body.organization_id)) {
    return response({ error: "Empresa inválida." }, 400);
  }
  if (!body.idempotency_key || !/^[0-9a-f-]{36}$/i.test(body.idempotency_key)) {
    return response({ error: "Chave de operação inválida. Gere uma nova tentativa." }, 400);
  }
  if (!body.backup || typeof body.backup !== "object" || Array.isArray(body.backup)) {
    return response({ error: "Arquivo de backup inválido." }, 400);
  }
  if (!isStringRecord(body.branch_mapping) || !isStringRecord(body.user_mapping)) {
    return response({ error: "Valide os mapeamentos de filiais e usuários antes da restauração." }, 400);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(authorization.slice(7));
  if (authError || !authData.user) return response({ error: "Sessão inválida ou expirada." }, 401);

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", body.organization_id)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError || !membership?.active || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "Somente proprietário ou administrador ativo pode restaurar backup." }, 403);
  }

  const { data, error } = await adminClient.rpc("restore_organization_backup", {
    p_organization_id: body.organization_id,
    p_actor_user_id: authData.user.id,
    p_idempotency_key: body.idempotency_key,
    p_backup: body.backup,
    p_branch_mapping: body.branch_mapping,
    p_user_mapping: body.user_mapping,
  });
  if (error) {
    return response({ error: error.message || "A restauração foi cancelada. Nenhuma alteração parcial foi mantida." }, 400);
  }
  return response(data);
});
