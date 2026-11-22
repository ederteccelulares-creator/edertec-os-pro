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

  let body: { organization_id?: string; backup?: Record<string, unknown> };
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).length > 10 * 1024 * 1024) return response({ error: "Arquivo maior que 10 MB. Solicite análise assistida." }, 413);
    body = JSON.parse(rawBody);
  } catch { return response({ error: "Envie um JSON válido." }, 400); }
  const organizationId = body.organization_id?.trim();
  const backup = body.backup;
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return response({ error: "Empresa inválida." }, 400);
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) return response({ error: "Estrutura do backup inválida." }, 400);
  if (backup.format !== "edertec-os-pro-backup" || backup.version !== 1) return response({ error: "Formato ou versão de backup não suportado." }, 400);
  const backupOrg = backup.organization as Record<string, unknown> | undefined;
  if (!backupOrg || backupOrg.id !== organizationId) return response({ error: "O backup pertence a outra empresa. Selecione a empresa de origem." }, 409);
  const tables = backup.tables as Record<string, unknown> | undefined;
  if (!tables || typeof tables !== "object" || Array.isArray(tables)) return response({ error: "O arquivo não contém a coleção de tabelas." }, 400);

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
    return response({ error: "Somente proprietário ou administrador ativo pode validar backup." }, 403);
  }

  const counts: Record<string, number> = {};
  const errors: string[] = [];
  for (const table of TABLES) {
    const rows = tables[table];
    if (!Array.isArray(rows)) {
      errors.push("Coleção ausente ou inválida: " + table);
      continue;
    }
    counts[table] = rows.length;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index] as Record<string, unknown>;
      if (!row || typeof row !== "object" || row.organization_id !== organizationId) {
        errors.push(table + "[" + index + "] possui organization_id ausente ou diferente.");
        if (errors.length >= 30) break;
      }
    }
    if (errors.length >= 30) break;
  }

  const unknownTables = Object.keys(tables).filter(name => !TABLES.includes(name as typeof TABLES[number]));
  if (unknownTables.length) errors.push("O arquivo contém tabelas não reconhecidas: " + unknownTables.join(", "));
  const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return response({
    valid: errors.length === 0,
    applied: false,
    message: errors.length === 0
      ? "Estrutura validada. Nenhum dado foi restaurado ou alterado."
      : "Foram encontrados problemas. Nenhum dado foi restaurado ou alterado.",
    organization: { id: backupOrg.id, name: backupOrg.name },
    exported_at: backup.exported_at ?? null,
    total_records: totalRecords,
    counts,
    errors,
  });
});
