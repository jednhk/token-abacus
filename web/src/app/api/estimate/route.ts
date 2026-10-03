import type { Estimate } from "@/lib/types";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return Response.json({ available: false });

  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = String(body.prompt ?? "").trim().slice(0, 2000);
  } catch {
    return Response.json({ available: false });
  }
  if (!prompt) return Response.json({ available: false });

  try {
    const response = await fetch(`${url}/functions/v1/estimate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-abacus-install": "website",
      },
      body: JSON.stringify({ prompt, harness: "website" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return Response.json({ available: false });
    const estimate = (await response.json()) as Estimate;
    if (!estimate || !Array.isArray(estimate.models)) {
      return Response.json({ available: false });
    }
    return Response.json({ available: true, estimate });
  } catch {
    return Response.json({ available: false });
  }
}
