import { fetchEstimate } from "@/lib/estimate-server";

export async function POST(request: Request) {
  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = String(body.prompt ?? "").trim().slice(0, 2000);
  } catch {
    return Response.json({ available: false });
  }
  if (!prompt) return Response.json({ available: false });

  const estimate = await fetchEstimate(prompt);
  if (!estimate) return Response.json({ available: false });
  return Response.json({ available: true, estimate });
}
