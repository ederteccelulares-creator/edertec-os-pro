import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const VERIFY_TOKEN = Deno.env.get("META_WHATSAPP_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function validMetaSignature(rawBody: string, signature: string | null) {
  if (!APP_SECRET || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  ));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `sha256=${hex}`;
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      });
    }
    return json({ error: "Webhook verification failed" }, 403);
  }

  if (req.method === "POST") {
    if (!APP_SECRET) return json({ error: "Webhook signature validation is not configured" }, 503);
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");
    if (!(await validMetaSignature(rawBody, signature))) {
      return json({ error: "Invalid webhook signature" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON payload" }, 400);
    }

    // Acknowledge only authenticated Meta events. Event processing and message
    // delivery are added through the tenant-scoped outbox in the next phase.
    const objectType = (payload as { object?: string })?.object;
    if (objectType !== "whatsapp_business_account") {
      return json({ error: "Unsupported webhook object" }, 400);
    }
    return json({ received: true });
  }

  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, POST" },
  });
});
