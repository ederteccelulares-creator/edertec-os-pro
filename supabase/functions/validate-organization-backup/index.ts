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

  let body: { organization_id?: string; backup?: Record<string, unknown>; user_mapping?: Record<string, string>; branch_mapping?: Record<string, string> };
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

  const idSets = new Map<string, Set<string>>();
  for (const table of TABLES) {
    const rows = Array.isArray(tables[table]) ? tables[table] as Array<Record<string, unknown>> : [];
    idSets.set(table, new Set(rows.map(row => String(row?.id ?? ""))));
  }

  // Detect duplicated primary keys before any future import attempt.
  for (const table of TABLES) {
    const rows = Array.isArray(tables[table]) ? tables[table] as Array<Record<string, unknown>> : [];
    const seen = new Set<string>();
    for (let index = 0; index < rows.length; index++) {
      const id = rows[index]?.id;
      if ((typeof id !== "string" && typeof id !== "number") || !String(id).trim()) {
        errors.push(table + "[" + index + "] não possui chave primária válida.");
      } else if (seen.has(String(id))) {
        errors.push(table + "[" + index + "] contém chave primária duplicada: " + String(id));
      } else {
        seen.add(String(id));
      }
      if (errors.length >= 50) break;
    }
    if (errors.length >= 50) break;
  }

  const references: Array<[string, string, string, boolean]> = [
    ["devices", "customer_id", "customers", false],
    ["service_orders", "branch_id", "branches", false],
    ["service_orders", "customer_id", "customers", false],
    ["service_orders", "device_id", "devices", true],
    ["service_order_events", "service_order_id", "service_orders", false],
    ["branch_inventory", "branch_id", "branches", false],
    ["branch_inventory", "item_id", "inventory_items", false],
    ["stock_movements", "branch_id", "branches", false],
    ["stock_movements", "item_id", "inventory_items", false],
    ["financial_entries", "branch_id", "branches", false],
    ["financial_entries", "category_id", "financial_categories", true],
    ["sales", "branch_id", "branches", false],
    ["sales", "customer_id", "customers", true],
    ["sale_items", "sale_id", "sales", false],
    ["sale_items", "item_id", "inventory_items", false],
    ["service_order_lines", "branch_id", "branches", false],
    ["service_order_lines", "service_order_id", "service_orders", false],
    ["service_order_lines", "service_id", "service_catalog", true],
  ];

  for (const [sourceTable, field, targetTable, optional] of references) {
    const rows = Array.isArray(tables[sourceTable]) ? tables[sourceTable] as Array<Record<string, unknown>> : [];
    const targetIds = idSets.get(targetTable) ?? new Set<string>();
    for (let index = 0; index < rows.length; index++) {
      const value = rows[index]?.[field];
      if ((value === null || value === undefined || value === "") && optional) continue;
      if (typeof value !== "string" || !targetIds.has(value)) {
        errors.push(sourceTable + "[" + index + "]." + field + " não referencia um registro válido em " + targetTable + ".");
        if (errors.length >= 50) break;
      }
    }
    if (errors.length >= 50) break;
  }

  const authReferences = [
    ["service_orders", "technician_id"], ["service_orders", "opened_by"],
    ["service_order_events", "changed_by"], ["financial_entries", "created_by"],
    ["sales", "sold_by"], ["service_order_lines", "created_by"],
    ["stock_movements", "actor_id"], ["audit_logs", "actor_id"],
  ] as const;
  const userMappingRequirements = authReferences.map(([table, field]) => {
    const rows = Array.isArray(tables[table]) ? tables[table] as Array<Record<string, unknown>> : [];
    return { table, field, records: rows.filter(row => row?.[field] !== null && row?.[field] !== undefined).length };
  }).filter(item => item.records > 0);
  const requiresUserMapping = userMappingRequirements.length > 0;

  // Build a read-only identity inventory. No user is assigned or modified here.
  const sourceUserMap = new Map<string, { source_user_id: string; references: Array<{ table: string; field: string; records: number }> }>();
  for (const [table, field] of authReferences) {
    const rows = Array.isArray(tables[table]) ? tables[table] as Array<Record<string, unknown>> : [];
    const perUser = new Map<string, number>();
    for (const row of rows) {
      const value = row?.[field];
      if (typeof value !== "string" || !value.trim()) continue;
      perUser.set(value, (perUser.get(value) ?? 0) + 1);
    }
    for (const [userId, records] of perUser) {
      const entry = sourceUserMap.get(userId) ?? { source_user_id: userId, references: [] };
      entry.references.push({ table, field, records });
      sourceUserMap.set(userId, entry);
    }
  }
  const { data: destinationMembers, error: destinationMembersError } = await adminClient
    .from("organization_members")
    .select("user_id,role,active")
    .eq("organization_id", organizationId);
  if (destinationMembersError) errors.push("Não foi possível consultar os membros do destino para preparar o mapeamento.");
  const memberIds = (destinationMembers ?? []).map(member => member.user_id);
  const { data: destinationProfiles, error: destinationProfilesError } = memberIds.length
    ? await adminClient.from("profiles").select("id,full_name").in("id", memberIds)
    : { data: [], error: null };
  if (destinationProfilesError) errors.push("Não foi possível consultar os nomes dos membros do destino.");
  const profileNames = new Map((destinationProfiles ?? []).map(profile => [profile.id, profile.full_name]));
  const destinationMemberList = (destinationMembers ?? []).map(member => ({
    user_id: member.user_id,
    full_name: profileNames.get(member.user_id) ?? "",
    role: member.role,
    active: member.active,
  }));
  const destinationMemberIds = new Set(memberIds);
  const activeDestinationMemberIds = new Set((destinationMembers ?? []).filter(member => member.active).map(member => member.user_id));
  const sourceUsers = [...sourceUserMap.values()].map(user => ({
    ...user,
    same_id_member_exists: destinationMemberIds.has(user.source_user_id),
  }));
  const submittedMapping = body.user_mapping ?? {};
  const mappingProvided = Object.keys(submittedMapping).length > 0;
  const mappingErrors: string[] = [];
  const expectedSourceIds = new Set(sourceUsers.map(user => user.source_user_id));
  for (const sourceId of expectedSourceIds) {
    const targetId = submittedMapping[sourceId];
    if (mappingProvided && !targetId) mappingErrors.push("Usuário de origem sem associação: " + sourceId);
    else if (targetId && !activeDestinationMemberIds.has(targetId)) mappingErrors.push("O destino selecionado não é membro ativo da empresa: " + targetId);
  }
  for (const sourceId of Object.keys(submittedMapping)) {
    if (!expectedSourceIds.has(sourceId)) mappingErrors.push("Mapeamento contém usuário de origem não reconhecido: " + sourceId);
  }
  const mappedTargets = Object.values(submittedMapping).filter(Boolean);
  if (new Set(mappedTargets).size !== mappedTargets.length) mappingErrors.push("Cada usuário de origem deve ser associado a um membro diferente do destino.");
  const mappingValid = mappingProvided && mappingErrors.length === 0 && Object.keys(submittedMapping).length === expectedSourceIds.size;

  const sourceBranches = (Array.isArray(tables.branches) ? tables.branches as Array<Record<string, unknown>> : []).map(branch => {
    const id = String(branch.id ?? "");
    const referenceFields = [
      ["service_orders", "branch_id"], ["branch_inventory", "branch_id"],
      ["stock_movements", "branch_id"], ["financial_entries", "branch_id"],
      ["sales", "branch_id"], ["service_order_lines", "branch_id"],
    ] as const;
    const references = referenceFields.map(([table, field]) => ({
      table, field,
      records: (Array.isArray(tables[table]) ? tables[table] as Array<Record<string, unknown>> : [])
        .filter(row => row?.[field] === id).length,
    })).filter(item => item.records > 0);
    return { source_branch_id: id, name: String(branch.name ?? ""), code: String(branch.code ?? ""), active: branch.active !== false, references };
  });
  const { data: destinationBranches, error: destinationBranchesError } = await adminClient
    .from("branches").select("id,name,code,active").eq("organization_id", organizationId);
  if (destinationBranchesError) errors.push("Não foi possível consultar as filiais do destino.");
  const destinationBranchList = destinationBranches ?? [];
  const submittedBranchMapping = body.branch_mapping ?? {};
  const branchMappingProvided = Object.keys(submittedBranchMapping).length > 0;
  const branchMappingErrors: string[] = [];
  const expectedSourceBranchIds = new Set(sourceBranches.map(branch => branch.source_branch_id));
  const destinationBranchIds = new Set(destinationBranchList.filter(branch => branch.active).map(branch => branch.id));
  for (const sourceId of expectedSourceBranchIds) {
    const targetId = submittedBranchMapping[sourceId];
    if (branchMappingProvided && !targetId) branchMappingErrors.push("Filial de origem sem associação: " + sourceId);
    else if (targetId && !destinationBranchIds.has(targetId)) branchMappingErrors.push("A filial de destino selecionada não existe ou está inativa: " + targetId);
  }
  for (const sourceId of Object.keys(submittedBranchMapping)) {
    if (!expectedSourceBranchIds.has(sourceId)) branchMappingErrors.push("Mapeamento contém filial de origem não reconhecida: " + sourceId);
  }
  const mappedBranchTargets = Object.values(submittedBranchMapping).filter(Boolean);
  if (new Set(mappedBranchTargets).size !== mappedBranchTargets.length) branchMappingErrors.push("Cada filial de origem deve ser associada a uma filial diferente do destino.");
  const branchMappingValid = branchMappingProvided && branchMappingErrors.length === 0 && Object.keys(submittedBranchMapping).length === expectedSourceBranchIds.size;

  const unknownTables = Object.keys(tables).filter(name => !TABLES.includes(name as typeof TABLES[number]));
  if (unknownTables.length) errors.push("O arquivo contém tabelas não reconhecidas: " + unknownTables.join(", "));
  const targetCounts: Record<string, number> = {};
  const targetResults = await Promise.all(TABLES.map(async (table) => {
    const { count, error } = await adminClient.from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return { table, count: count ?? 0, error };
  }));
  for (const result of targetResults) {
    targetCounts[result.table] = result.count;
    if (result.error) errors.push("Não foi possível conferir o destino em " + result.table + ".");
  }
  const destinationEmpty = targetResults.every(result => !result.error && result.count === 0);
  const occupiedTables = targetResults
    .filter(result => result.count > 0)
    .map(result => ({ table: result.table, records: result.count }));

  const totalRecords = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const restoreBlockers = [
    "A restauração transacional com rollback ainda não foi implementada.",
    ...(sourceBranches.length > 0 && !branchMappingValid ? ["As associações das filiais ainda não foram validadas com sucesso no servidor."] : []),\n    "A importação ainda não implementa a substituição dos IDs de filiais nas referências relacionadas.",
    ...(requiresUserMapping && !mappingValid ? ["As associações de usuários ainda não foram validadas com sucesso no servidor."] : []),
    ...(!destinationEmpty ? ["O destino contém registros operacionais; uma estratégia segura de mesclagem ainda não foi implementada."] : []),
  ];
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
    requires_user_mapping: requiresUserMapping,
    user_mapping_requirements: userMappingRequirements,
    source_users: sourceUsers,
    destination_members: destinationMemberList,
    mapping_provided: mappingProvided,
    mapping_valid: mappingValid,
    mapping_errors: mappingErrors,
    destination_empty: destinationEmpty,
    target_counts: targetCounts,
    occupied_tables: occupiedTables,
    errors,
  });
});
