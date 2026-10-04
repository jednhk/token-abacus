import type { Estimate } from "@/lib/types";

// The estimate function embeds, searches and reranks; it routinely takes ~8s.
const ESTIMATE_TIMEOUT_MS = 20000;

export async function fetchEstimate(prompt: string): Promise<Estimate | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const response = await fetch(`${url}/functions/v1/estimate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-abacus-install": "website",
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), harness: "website" }),
      signal: AbortSignal.timeout(ESTIMATE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const estimate = (await response.json()) as Estimate;
    return estimate && Array.isArray(estimate.models) ? estimate : null;
  } catch {
    return null;
  }
}
