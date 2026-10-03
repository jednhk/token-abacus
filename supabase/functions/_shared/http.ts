// Shared request/response helpers. Functions run with JWT verification off (config.toml):
// clients send no keys, so every endpoint validates input and rate-limits on its own.

export const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-abacus-install, authorization, apikey",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

/** Parse a POST JSON body, or return the Response to send instead. */
export async function readJson(req: Request): Promise<Record<string, unknown> | Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return error("Use POST.", 405);
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return error("Body must be a JSON object.", 400);
}

// Best-effort limiter, per function instance. Enough to stop a runaway client during the
// hackathon; not a security boundary.
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, perMinute: number): boolean {
  const key = req.headers.get("x-abacus-install") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > perMinute;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
