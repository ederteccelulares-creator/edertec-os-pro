import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    || (() => { try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return undefined; } })();
  if (!url || !serviceKey) return json({ error: "Storage monitor is not configured." }, 503);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Authentication required." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData.user) return json({ error: "Invalid session." }, 401);

  const { data: adminRecord, error: adminError } = await admin.from("platform_admins")
    .select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (adminError) return json({ error: "Could not verify administrator access." }, 500);
  if (!adminRecord) return json({ error: "Super Admin access required." }, 403);

  try {
    const [{ data: buckets, error: bucketsError }, { data: companies, error: companiesError }] = await Promise.all([
      admin.schema("storage").from("buckets").select("id,name,public,file_size_limit").order("name"),
      admin.from("companies").select("id,name").limit(2000),
    ]);
    if (bucketsError) throw bucketsError;
    if (companiesError) throw companiesError;

    const totals = new Map<string, { files: number; bytes: number; photos: number }>();
    let totalFiles = 0;
    let totalBytes = 0;
    let totalPhotos = 0;
    let offset = 0;
    const pageSize = 1000;
    let truncated = false;

    while (true) {
      const { data: objects, error } = await admin.schema("storage").from("objects")
        .select("bucket_id,name,metadata")
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = objects || [];
      for (const object of rows) {
        const metadata = object.metadata && typeof object.metadata === "object"
          ? object.metadata as Record<string, unknown> : {};
        const size = Math.max(0, Number(metadata.size || metadata.contentLength || 0) || 0);
        const mime = String(metadata.mimetype || metadata.contentType || "").toLowerCase();
        const isPhoto = mime.startsWith("image/");
        totalFiles += 1;
        totalBytes += size;
        if (isPhoto) totalPhotos += 1;

        const pathParts = String(object.name || "").split("/").filter(Boolean);
        const companyId = pathParts[0] === "companies" ? (pathParts[1] || "sem-identificacao") : (pathParts[0] || "sem-identificacao");
        const current = totals.get(companyId) || { files: 0, bytes: 0, photos: 0 };
        current.files += 1;
        current.bytes += size;
        if (isPhoto) current.photos += 1;
        totals.set(companyId, current);
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
      if (offset >= 100000) { truncated = true; break; }
    }

    const names = new Map((companies || []).map((company: { id: string; name: string }) => [company.id, company.name]));
    const byCompany = Array.from(totals.entries()).map(([companyId, usage]) => ({
      company_id: companyId,
      company_name: names.get(companyId) || (companyId === "sem-identificacao" ? "Arquivos sem pasta de empresa" : "Empresa não identificada"),
      ...usage,
    })).sort((a, b) => b.bytes - a.bytes);

    return json({
      total_files: totalFiles,
      total_bytes: totalBytes,
      total_photos: totalPhotos,
      buckets: (buckets || []).map((bucket: { id: string; name: string; public: boolean; file_size_limit: number | null }) => ({
        id: bucket.id, name: bucket.name, is_public: bucket.public, file_size_limit: bucket.file_size_limit,
      })),
      companies: byCompany,
      scanned_at: new Date().toISOString(),
      truncated,
      scan_limit: 100000,
    });
  } catch (error) {
    console.error("platform_storage_usage_failed", error);
    return json({ error: "Não foi possível consultar o armazenamento agora." }, 500);
  }
});
