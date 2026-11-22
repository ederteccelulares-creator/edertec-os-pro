import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return response({ error: "Sessão não encontrada." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: "A função ainda não está configurada no Supabase." }, 500);
  }

  const token = authorization.slice(7);
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const actor = authData.user;
  if (authError || !actor) return response({ error: "Sessão inválida ou expirada." }, 401);

  let body: { organization_id?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return response({ error: "Corpo da solicitação inválido." }, 400);
  }

  const organizationId = body.organization_id?.trim();
  const email = body.email?.trim().toLowerCase();
  const role = body.role?.trim();

  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) {
    return response({ error: "Empresa inválida." }, 400);
  }
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response({ error: "Informe um e-mail válido." }, 400);
  }
  if (!["admin", "manager", "attendant", "technician"].includes(role || "")) {
    return response({ error: "Função de equipe inválida." }, 400);
  }

  const { data: membership, error: memberError } = await adminClient
    .from("organization_members")
    .select("role,active")
    .eq("organization_id", organizationId)
    .eq("user_id", actor.id)
    .maybeSingle();

  if (memberError || !membership?.active || !["owner", "admin"].includes(membership.role)) {
    return response({ error: "Somente proprietário ou administrador ativo pode convidar membros." }, 403);
  }
  if (membership.role === "admin" && role === "admin") {
    return response({ error: "Administradores não podem convidar outros administradores." }, 403);
  }

  const { data: subscription, error: subscriptionError } = await adminClient
    .from("subscriptions")
    .select("status,trial_ends_at,plans(max_users)")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (subscriptionError || !subscription) return response({ error: "Assinatura da empresa não encontrada." }, 403);
  const trialValid = subscription.status === "trialing" &&
    !!subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() > Date.now();
  if (subscription.status !== "active" && !trialValid) {
    return response({ error: "A assinatura da empresa não permite convidar novos membros." }, 403);
  }

  await adminClient.from("pending_team_invitations")
    .update({ status: "expired" })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  const { count: memberCount, error: countError } = await adminClient
    .from("organization_members")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (countError) return response({ error: "Não foi possível verificar o limite de usuários." }, 500);

  const { count: pendingCount, error: pendingCountError } = await adminClient
    .from("pending_team_invitations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  if (pendingCountError) return response({ error: "A migração de convites ainda não foi aplicada." }, 500);

  const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
  const maxUsers = plan?.max_users;
  if (maxUsers !== null && maxUsers !== undefined &&
      (memberCount || 0) + (pendingCount || 0) >= Number(maxUsers)) {
    return response({ error: "O limite de usuários do plano foi atingido. Altere o plano no painel Super Admin." }, 409);
  }

  const { data: existingInvite } = await adminClient
    .from("pending_team_invitations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingInvite) return response({ error: "Já existe um convite pendente para este e-mail." }, 409);

  const { data: invitation, error: insertError } = await adminClient
    .from("pending_team_invitations")
    .insert({
      organization_id: organizationId,
      email,
      role,
      invited_by: actor.id,
    })
    .select("id")
    .single();
  if (insertError || !invitation) {
    return response({ error: insertError?.message || "Não foi possível criar o convite." }, 500);
  }

  const appSiteUrl = Deno.env.get("APP_SITE_URL");
  const inviteOptions: { data: Record<string, string>; redirectTo?: string } = {
    data: { team_invitation_id: invitation.id },
  };
  if (appSiteUrl) inviteOptions.redirectTo = appSiteUrl;

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
  if (inviteError) {
    await adminClient.from("pending_team_invitations")
      .update({ status: "cancelled" })
      .eq("id", invitation.id);
    return response({
      error: inviteError.message.includes("already been registered")
        ? "Este e-mail já possui uma conta. A inclusão de usuários já cadastrados ainda não está habilitada; use um e-mail novo."
        : `O Supabase não conseguiu enviar o convite: ${inviteError.message}`,
    }, 400);
  }

  return response({
    success: true,
    message: "Convite enviado. O usuário será vinculado à empresa quando concluir o cadastro pelo e-mail.",
  });
});
