import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// gte-small runs inside the Edge Function: 384 dimensions, no external API call, no cost.
// Every stored task and every estimate query must be embedded with exactly this model and these
// options, or similarity scores stop meaning anything.
const session = new Supabase.ai.Session("gte-small");

export async function embed(text: string): Promise<number[]> {
  const output = await session.run(text, { mean_pool: true, normalize: true });
  return Array.from(output as number[]);
}
