import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const authEmail = (username: string) => username.toLowerCase() + "@eparts-login.invalid";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return reply({ error: "Função não configurada no servidor." }, 500);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: "Faça login como administrador." }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(authorization.slice(7));
  if (authError || !user) return reply({ error: "Sessão inválida. Entre novamente no painel." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply({ error: "Dados enviados inválidos." }, 400); }

  const supplierId = String(body.supplier_id || "").trim();
  const companyId = String(body.company_id || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!supplierId || !companyId) return reply({ error: "Fornecedor ou empresa não identificados. Atualize a página e tente novamente." }, 400);
  if (!/^[a-z0-9._-]{4,30}$/.test(username)) return reply({ error: "O usuário deve ter de 4 a 30 caracteres: letras, números, ponto, hífen ou underline." }, 400);
  if (password.length < 8 || password.length > 72) return reply({ error: "A senha deve ter entre 8 e 72 caracteres." }, 400);

  const { data: supplier, error: supplierError } = await admin
    .from("eparts_suppliers")
    .select("id,company_id,user_id,name,is_active")
    .eq("id", supplierId).eq("company_id", companyId).maybeSingle();
  if (supplierError) {
    console.error("supplier_lookup_failed", supplierError.message);
    return reply({ error: "Falha ao consultar fornecedor. Verifique a conexão do banco." }, 500);
  }
  if (!supplier || !supplier.is_active) return reply({ error: "Fornecedor não encontrado ou está inativo nesta empresa." }, 404);

  const { data: membership, error: membershipError } = await admin
    .from("company_members").select("role,is_active")
    .eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (membershipError) {
    console.error("membership_lookup_failed", membershipError.message);
    return reply({ error: "Não foi possível validar sua permissão administrativa." }, 500);
  }
  if (!membership?.is_active || !["owner", "admin", "manager"].includes(membership.role)) {
    return reply({ error: "Sua conta não tem permissão para criar acessos de fornecedores nesta empresa." }, 403);
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from("eparts_suppliers").select("id")
    .ilike("username", username).neq("id", supplierId).limit(1).maybeSingle();
  if (duplicateError) {
    console.error("username_lookup_failed", duplicateError.message);
    return reply({ error: "Não foi possível validar o nome de usuário." }, 500);
  }
  if (duplicate) return reply({ error: "Este nome de usuário já está em uso. Escolha outro." }, 409);

  const email = authEmail(username);
  let authUserId = supplier.user_id as string | null;
  try {
    if (authUserId) {
      const { data, error } = await admin.auth.admin.updateUserById(authUserId, { password, email, email_confirm: true });
      if (error || !data.user) throw new Error(error?.message || "Não foi possível atualizar a conta existente.");
    } else {
      // Reutiliza uma conta eventualmente criada numa tentativa anterior que falhou ao gravar o vínculo.
      let existingUser: any = null;
      for (let page = 1; page <= 10 && !existingUser; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error("Não foi possível verificar contas existentes: " + error.message);
        existingUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
        if (data.users.length < 1000) break;
      }
      if (existingUser) {
        const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, { password, email_confirm: true, user_metadata: { ...existingUser.user_metadata, eparts_supplier: true, supplier_id: supplier.id, company_id: supplier.company_id } });
        if (error || !data.user) throw new Error(error?.message || "Não foi possível recuperar a conta existente.");
        authUserId = data.user.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { eparts_supplier: true, supplier_id: supplier.id, company_id: supplier.company_id },
        });
        if (error || !data.user) throw new Error(error?.message || "Não foi possível criar a conta.");
        authUserId = data.user.id;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida ao criar a conta.";
    console.error("supplier_auth_account_failed", message);
    return reply({ error: "O Supabase Auth recusou a criação/atualização da conta: " + message }, 400);
  }

  const { error: linkError } = await admin.from("eparts_suppliers")
    .update({ username, user_id: authUserId })
    .eq("id", supplier.id).eq("company_id", companyId);
  if (linkError) {
    console.error("supplier_link_failed", linkError.message);
    return reply({ error: "A conta foi preparada, mas o vínculo no fornecedor falhou. Tente novamente; a próxima tentativa recuperará a conta criada." }, 500);
  }

  return reply({ success: true, username, supplier_name: supplier.name });
});
