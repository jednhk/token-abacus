import { db } from "../_shared/db.ts";
import { error, json, rateLimited } from "../_shared/http.ts";

// Refreshes model_pricing from OpenRouter's public catalog. pg_cron calls it hourly; safe to call
// by hand. OpenRouter's Claude prices match Anthropic's list prices, and it publishes the 1-hour
// cache-write price and long-context tiers ("overrides") that exact costs need.
//
// Model names are normalized to what coding tools write in their logs: the provider prefix is
// dropped, and Anthropic's dotted versions become dashed (anthropic/claude-opus-4.5 →
// claude-opus-4-5). Variants such as ":batch" or ":free" are skipped. Rows marked locked in
// model_pricing are never overwritten.

const CATALOG = "https://openrouter.ai/api/v1/models";

type Prices = Record<string, unknown>;

/** OpenRouter quotes USD per token as strings; we store USD per million tokens. */
function perMillion(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number((n * 1_000_000).toFixed(6));
}

function normalize(id: string): { model: string; provider: string } | null {
  if (id.includes(":")) return null;
  const slash = id.indexOf("/");
  if (slash < 0) return null;
  const provider = id.slice(0, slash);
  let model = id.slice(slash + 1);
  if (provider.replace(/^~/, "") === "anthropic") model = model.replaceAll(".", "-");
  return { model, provider };
}

function tiers(overrides: unknown) {
  if (!Array.isArray(overrides)) return [];
  return overrides
    .filter((o: Prices) => Number.isFinite(Number(o?.min_prompt_tokens)))
    .map((o: Prices) => ({
      min_prompt_tokens: Number(o.min_prompt_tokens),
      input_per_mtok: perMillion(o.prompt),
      output_per_mtok: perMillion(o.completion),
      cache_read_per_mtok: perMillion(o.input_cache_read),
      cache_write_per_mtok: perMillion(o.input_cache_write),
      cache_write_1h_per_mtok: perMillion(o.input_cache_write_1h),
    }))
    .sort((a, b) => a.min_prompt_tokens - b.min_prompt_tokens);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return error("Use POST.", 405);
  if (rateLimited(req, 6)) return error("Too many requests.", 429);

  const response = await fetch(CATALOG, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return error(`OpenRouter returned ${response.status}`, 502);
  const { data } = await response.json() as { data: { id: string; pricing?: Prices }[] };

  const items = new Map<string, unknown>();
  let skipped = 0;
  for (const entry of data ?? []) {
    const name = normalize(entry.id);
    const p = entry.pricing ?? {};
    const input = perMillion(p.prompt);
    const output = perMillion(p.completion);
    if (!name || input === null || output === null) { skipped++; continue; }
    if (items.has(name.model)) continue;            // first listing wins on a name collision
    items.set(name.model, {
      model: name.model,
      provider: name.provider,
      input_per_mtok: input,
      output_per_mtok: output,
      cache_read_per_mtok: perMillion(p.input_cache_read),
      cache_write_per_mtok: perMillion(p.input_cache_write),
      cache_write_1h_per_mtok: perMillion(p.input_cache_write_1h),
      tiers: tiers(p.overrides),
      source_id: entry.id,
    });
  }

  const { data: result, error: upsertError } = await db.rpc("upsert_pricing", { items: [...items.values()] });
  if (upsertError) return error(upsertError.message, 500);
  return json({ catalog: data?.length ?? 0, models: items.size, skipped, ...(result as object) });
});
