import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

const TABLES = [
  "branches", "customers", "devices", "service_orders", "service_order_events",
  "inventory_items", "branch_inventory", "stock_movements", "financial_categories",
  "financial_entries", "sales", "sale_items", "service_catalog", "service_order_lines",
  "audit_logs",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Sessão não encontrada." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: "Função não configurada." }, 500);

  let body: { organization_id?: string };
  try { body = await req.json(); } catch { return response({ error: "Corpo inválido." }, 400); }
  const organizationId = body.organization_id?.trim();
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return response({ error: "Empresa inválida." }, 400);

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
    .from("organization_members").select("role,active")
    .eq("organization_id", organizationId).eq("user_id", authData.user.id).maybeSingle();
  if (membershipError || !membership?.active || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "Somente proprietário ou administrador ativo pode exportar os dados." }, 403);
  }

  const { data: organization, error: organizationError } = await adminClient
    .from("organizations")
    .select("id,name,slug,document,phone,email,logo_url,timezone,created_at")
    .eq("id", organizationId).maybeSingle();
  if (organizationError || !organization) return response({ error: "Empresa não encontrada." }, 404);

  const exportedAt = new Date().toISOString();
  const backup: Record<string, unknown> = {
    format: "edertec-os-pro-backup",
    version: 1,
    exported_at: exportedAt,
    organization,
    tables: {},
  };
  const tables = backup.tables as Record<string, unknown>;
  for (const table of TABLES) {
    const rows: unknown[] = [];
    const pageSize = 500;
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const { data, error } = await adminClient.from(table).select("*")
        .eq("organization_id", organizationId).order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return response({ error: "Falha ao exportar " + table + ": " + error.message }, 500);
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
      if (offset + pageSize >= 10000) {
        return response({ error: "A tabela " + table + " excedeu 10.000 registros; solicite exportação assistida." }, 413);
      }
    }
    tables[table] = rows;
  }

  const filename = "edertec-backup-" + organization.slug + "-" + exportedAt.slice(0, 10) + ".json";
  return response(backup, 200, {
    "Content-Disposition": 'attachment; filename="' + filename + '"',
    "Cache-Control": "no-store",
  });
});
