import { db } from "../_shared/db.ts";
import { embed } from "../_shared/embed.ts";
import { error, json, rateLimited, readJson } from "../_shared/http.ts";

// POST { prompt, model?, harness? } → recommended model + token/USD budget, from similar past tasks.
// Contract: docs/PLAN.md §5 and docs/FRONTEND.md §8.

// Calibrated on the seeded data (gte-small): a bug fix's nearest other bug fix scores 0.83–0.92,
// while unrelated requests (a website, OAuth login, a blog post) top out at 0.73–0.78 against it.
// Below the threshold there is no estimate — an honest "none" beats a confident wrong number.
const THRESHOLD = 0.80;            // similarity needed to count as "a similar task"
const NEIGHBORS = 50;              // distinct tasks (the search runs over task_vectors)
const CLUSTER_BAND = 0.05;         // only tasks within this much of the best match count
const SOLID_TASKS = 3;             // models with this many similar tasks are preferred when any exist
const MIN_SUCCESS_RATE = 0.7;
const HEADROOM = 1.15;             // budget = p85 × 1.15

interface StatsRow {
  model: string;
  n: number;
  avg_similarity: number;
  success_rate: number | null;
  p50_tokens: number | null;
  p85_tokens: number | null;
  p95_tokens: number | null;
  p50_cost: number | null;
  p85_cost: number | null;
  p95_cost: number | null;
}

interface MatchRow {
  task: string;
  primary_model: string;
  total_tokens: number;
  cost_usd: number | null;
  similarity: number;
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

async function stats(vector: number[], threshold: number): Promise<StatsRow[]> {
  const { data, error: rpcError } = await db.rpc("estimate_stats", {
    query_embedding: JSON.stringify(vector),
    match_threshold: threshold,
    match_count: NEIGHBORS,
  });
  if (rpcError) throw rpcError;
  return (data ?? []) as StatsRow[];
}

function candidates(rows: StatsRow[]): StatsRow[] {
  // One similar task is enough for an estimate (confidence says how much to trust it), but a
  // single lucky run must not beat a model with real history: use well-evidenced models when
  // there are any.
  const usable = rows.filter((r) => r.n >= 1 && r.p85_tokens !== null);
  const solid = usable.filter((r) => r.n >= SOLID_TASKS);
  return solid.length > 0 ? solid : usable;
}

/** Cheapest model that usually succeeds. */
function pick(rows: StatsRow[]): StatsRow | null {
  if (rows.length === 0) return null;
  const reliable = rows.filter((r) => r.success_rate === null || r.success_rate >= MIN_SUCCESS_RATE);
  const pool = reliable.length > 0 ? reliable : rows;
  const priced = pool.filter((r) => r.p50_cost !== null);
  if (priced.length > 0) return priced.reduce((a, b) => (b.p50_cost! < a.p50_cost! ? b : a));
  return pool.reduce((a, b) => (b.n > a.n ? b : a));
}

/** Budget and ceiling for one model, from its similar tasks. */
function plan(row: StatsRow) {
  const budgetTokens = Math.round(row.p85_tokens! * HEADROOM);
  const budgetUsd = row.p85_cost !== null ? row.p85_cost * HEADROOM : null;
  return {
    model: row.model,
    budget_tokens: budgetTokens,
    budget_usd: round2(budgetUsd),
    // The ceiling is never below the budget, even when p95 sits close to p85.
    ceiling_tokens: Math.max(Math.round(row.p95_tokens!), budgetTokens),
    ceiling_usd: round2(row.p95_cost === null ? null : Math.max(row.p95_cost, budgetUsd ?? 0)),
  };
}

function confidence(row: StatsRow): "high" | "medium" | "low" {
  if (row.n < SOLID_TASKS) return "low";
  const spread = row.p50_tokens ? row.p85_tokens! / row.p50_tokens : Infinity;
  if (row.n >= 10 && row.avg_similarity >= 0.85 && spread < 2) return "high";
  return "medium";
}

Deno.serve(async (req) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (rateLimited(req, 120)) return error("Too many requests. Try again in a minute.", 429);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 2000) return error('"prompt" must be 3–2000 characters.', 400);
  // Logs may carry dated ids (claude-haiku-4-5-20251001); stored runs use undated ones.
  const requested = typeof body.model === "string" ? body.model.trim().replace(/-\d{8}$/, "") : undefined;

  try {
    const vector = await embed(prompt);
    const matchResult = await db.rpc("match_runs", { query_embedding: JSON.stringify(vector), match_count: 5 });
    if (matchResult.error) throw matchResult.error;
    const matches = (matchResult.data ?? []) as MatchRow[];

    // Estimate from the cluster around the best match, not from everything above the threshold:
    // one task at 0.97 says more than many loosely related tasks at 0.80.
    const best = matches[0]?.similarity ?? 0;
    const cutoff = Math.max(THRESHOLD, best - CLUSTER_BAND);
    const rows = best >= THRESHOLD ? await stats(vector, cutoff) : [];

    // The caller's own model gets its own budget when there's any data for it (an agent budgets
    // for the model it is running); the cheapest reliable model is offered alongside if cheaper.
    const own = requested
      ? rows.find((r) => r.model === requested && r.n >= 1 && r.p85_tokens !== null) ?? null
      : null;
    const cheapest = pick(candidates(rows));
    const chosen = own ?? cheapest;
    const alternative = own && cheapest && cheapest.model !== own.model &&
        cheapest.p50_cost !== null && own.p50_cost !== null && cheapest.p50_cost < own.p50_cost
      ? cheapest : null;

    // One entry per distinct task (imports repeat a task across models), preferring the run on the
    // recommended model so the example matches the recommendation.
    const byTask = new Map<string, MatchRow>();
    for (const m of matches) {
      if (m.similarity < cutoff) continue;
      const seen = byTask.get(m.task);
      if (!seen || (chosen && m.primary_model === chosen.model && seen.primary_model !== chosen.model)) {
        byTask.set(m.task, m);
      }
    }
    const similar = [...byTask.values()].slice(0, 5).map((m) => ({
      title: m.task,
      model: m.primary_model,
      total_tokens: m.total_tokens,
      cost_usd: round2(m.cost_usd),
      similarity: Math.round(m.similarity * 1000) / 1000,
    }));

    return json({
      recommendation: chosen && plan(chosen),
      confidence: chosen ? confidence(chosen) : "none",
      // true: the recommendation is for the model the caller asked about. false: no similar tasks
      // on that model yet, so this is the cheapest reliable model instead.
      ...(requested ? { for_requested_model: own !== null } : {}),
      alternative: alternative && {
        ...plan(alternative),
        n: alternative.n,
        success_rate: alternative.success_rate === null ? null : Math.round(alternative.success_rate * 100) / 100,
      },
      models: rows.map((r) => ({
        model: r.model,
        n: r.n,
        success_rate: r.success_rate === null ? null : Math.round(r.success_rate * 100) / 100,
        p50_tokens: r.p50_tokens === null ? null : Math.round(r.p50_tokens),
        p85_tokens: r.p85_tokens === null ? null : Math.round(r.p85_tokens),
        p50_usd: round2(r.p50_cost),
        p85_usd: round2(r.p85_cost),
      })),
      similar_tasks: similar,
      // { "debug": true } shows the nearest tasks regardless of threshold, for tuning.
      ...(body.debug === true ? {
        debug: {
          cutoff: Math.round(cutoff * 1000) / 1000,
          nearest: [...new Map(matches.map((m) => [m.task, m.similarity])).entries()]
            .map(([task, similarity]) => ({ task, similarity: Math.round(similarity * 1000) / 1000 })),
        },
      } : {}),
    });
  } catch (e) {
    console.error(`estimate failed: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    return error("Estimate failed. Try again shortly.", 500);
  }
});
