import { db } from "../_shared/db.ts";
import { embed } from "../_shared/embed.ts";
import { error, json, rateLimited, readJson } from "../_shared/http.ts";
import { MIN_SCORE, RERANK_MODEL, rerank, type Judgement } from "../_shared/rerank.ts";
import { KINDS, normalizeStack, SIZES, tagTasks, type Size } from "../_shared/tags.ts";

// POST { prompt, model?, size?, work_kind?, stack?, harness? } → budget for the task, from truly
// comparable past tasks. Contract: docs/PLAN.md §5 and docs/FRONTEND.md §8.
//
// Matching in three steps:
//  1. Tags. The MCP agent sends size / kind / stack; for website queries Claude Haiku tags the prompt.
//  2. Candidates. The nearest distinct tasks by meaning (gte-small, exact search), limited to the
//     same size and its neighbour (a small task is never compared with a large one).
//  3. Rerank. Claude scores each candidate 0–10 for how comparable the work really is; only scores
//     ≥ MIN_SCORE feed the estimate. Without Claude, similarity + same size is the fallback.

const CANDIDATES = 40;             // distinct tasks fetched by vector search
const RERANKED = 25;               // of those, the nearest this many go to Claude
const MIN_SIMILARITY = 0.70;       // below this a task is unrelated however it's tagged (calibrated)
const FALLBACK_THRESHOLD = 0.80;   // similarity-only mode: the earlier calibrated threshold
const FALLBACK_BAND = 0.05;
const SOLID_TASKS = 3;             // models with this many comparable tasks are preferred
const MIN_SUCCESS_RATE = 0.7;
const HEADROOM = 1.15;             // budget = p85 × 1.15

const NEIGHBOUR_SIZES: Record<Size, Size[]> = {
  small: ["small", "medium"],
  medium: ["small", "medium", "large"],
  large: ["medium", "large"],
};

interface Candidate {
  task: string;
  similarity: number;
  work_kind: string | null;
  size: string | null;
  stack: string[] | null;
  runs: number;
  median_cost: number | null;
  top_model: string | null;
}

interface StatsRow {
  model: string;
  n: number;
  distinct_tasks: number;
  success_rate: number | null;
  p50_tokens: number | null;
  p85_tokens: number | null;
  p95_tokens: number | null;
  p50_cost: number | null;
  p85_cost: number | null;
  p95_cost: number | null;
}

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function candidatesFor(rows: StatsRow[]): StatsRow[] {
  // One comparable task is enough for an estimate (confidence says how much to trust it), but a
  // single lucky run must not beat a model with real history.
  const usable = rows.filter((r) => r.n >= 1 && r.p85_tokens !== null);
  const solid = usable.filter((r) => r.distinct_tasks >= SOLID_TASKS);
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

/** Budget and ceiling for one model, from its comparable tasks. */
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

function confidence(row: StatsRow, meanScore: number | null): "high" | "medium" | "low" {
  if (row.distinct_tasks < SOLID_TASKS) return "low";
  const spread = row.p50_tokens ? row.p85_tokens! / row.p50_tokens : Infinity;
  if (row.distinct_tasks >= 10 && spread < 2 && (meanScore === null || meanScore >= 8)) return "high";
  return "medium";
}

// Same question → same answer for a while, and no repeated Claude calls.
const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 10 * 60_000;

Deno.serve(async (req) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (rateLimited(req, 120)) return error("Too many requests. Try again in a minute.", 429);

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (prompt.length < 3 || prompt.length > 2000) return error('"prompt" must be 3–2000 characters.', 400);
  // Logs may carry dated ids (claude-haiku-4-5-20251001); stored runs use undated ones.
  const requested = typeof body.model === "string" ? body.model.trim().replace(/-\d{8}$/, "") : undefined;
  let size = SIZES.includes(body.size as Size) ? body.size as Size : undefined;
  let workKind = KINDS.includes(body.work_kind as typeof KINDS[number]) ? body.work_kind as string : undefined;
  let stack = normalizeStack(body.stack);
  const debug = body.debug === true;

  const cacheKey = JSON.stringify([prompt, requested, size, workKind, stack, debug]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.body);

  try {
    // 1. Tags: from the caller, or from Claude Haiku for untagged queries (the website).
    let taggedBy = size ? "caller" : "none";
    if (!size) {
      try {
        const t = (await tagTasks([prompt])).get(0);
        if (t) { size = t.size; workKind ??= t.work_kind; stack = stack.length ? stack : t.stack; taggedBy = "claude"; }
      } catch (e) {
        console.error(`query tagging failed: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 2. Candidates: nearest distinct tasks of a compatible size.
    const vector = await embed(prompt);
    const { data, error: rpcError } = await db.rpc("nearest_tasks", {
      query_embedding: JSON.stringify(vector),
      match_count: CANDIDATES,
      sizes: size ? NEIGHBOUR_SIZES[size] : null,
      include_untagged: true,
    });
    if (rpcError) throw rpcError;
    const pool = ((data ?? []) as Candidate[]).filter((c) => c.similarity >= MIN_SIMILARITY).slice(0, RERANKED);

    // 3. Rerank with Claude; fall back to similarity + same size.
    let matching: "reranked" | "similarity" = "reranked";
    let judgements = new Map<number, Judgement>();
    if (pool.length > 0) {
      try {
        judgements = await rerank(
          { description: prompt, work_kind: workKind, size, stack },
          pool.map((c) => ({ description: c.task, work_kind: c.work_kind, size: c.size, stack: c.stack })),
        );
      } catch (e) {
        console.error(`rerank failed, using similarity: ${e instanceof Error ? e.message : e}`);
        matching = "similarity";
      }
    }
    let kept: { c: Candidate; score: number | null; reason?: string }[];
    if (matching === "reranked") {
      kept = pool.flatMap((c, i) => {
        const j = judgements.get(i);
        return j && j.score >= MIN_SCORE ? [{ c, score: j.score, reason: j.reason }] : [];
      }).sort((a, b) => b.score! - a.score! || b.c.similarity - a.c.similarity);
    } else {
      const best = pool[0]?.similarity ?? 0;
      const cutoff = Math.max(FALLBACK_THRESHOLD, best - FALLBACK_BAND);
      kept = pool.filter((c) => c.similarity >= cutoff && (!size || !c.size || c.size === size))
        .map((c) => ({ c, score: null }));
    }

    // Stats over the comparable tasks' runs.
    let rows: StatsRow[] = [];
    if (kept.length > 0) {
      const { data: stats, error: statsError } = await db.rpc("stats_for_tasks", { tasks: kept.map((k) => k.c.task) });
      if (statsError) throw statsError;
      rows = (stats ?? []) as StatsRow[];
    }
    const scored = kept.filter((k) => k.score !== null);
    const meanScore = scored.length ? scored.reduce((s, k) => s + k.score!, 0) / scored.length : null;

    // The caller's own model gets its own budget when there's any data for it (an agent budgets
    // for the model it is running); the cheapest reliable model is offered alongside if cheaper.
    const own = requested ? rows.find((r) => r.model === requested && r.p85_tokens !== null) ?? null : null;
    const cheapest = pick(candidatesFor(rows));
    const chosen = own ?? cheapest;
    const alternative = own && cheapest && cheapest.model !== own.model &&
        cheapest.p50_cost !== null && own.p50_cost !== null && cheapest.p50_cost < own.p50_cost
      ? cheapest : null;

    const response = {
      recommendation: chosen && plan(chosen),
      confidence: chosen ? confidence(chosen, meanScore) : "none",
      ...(requested ? { for_requested_model: own !== null } : {}),
      alternative: alternative && {
        ...plan(alternative),
        n: alternative.distinct_tasks,
        success_rate: alternative.success_rate === null ? null : Math.round(alternative.success_rate * 100) / 100,
      },
      task: { size: size ?? null, work_kind: workKind ?? null, stack, tagged_by: taggedBy },
      matching: matching === "reranked" ? { method: "reranked", model: RERANK_MODEL, min_score: MIN_SCORE } : { method: "similarity" },
      models: rows.map((r) => ({
        model: r.model,
        n: r.distinct_tasks,
        runs: r.n,
        success_rate: r.success_rate === null ? null : Math.round(r.success_rate * 100) / 100,
        p50_tokens: r.p50_tokens === null ? null : Math.round(r.p50_tokens),
        p85_tokens: r.p85_tokens === null ? null : Math.round(r.p85_tokens),
        p50_usd: round2(r.p50_cost),
        p85_usd: round2(r.p85_cost),
      })),
      similar_tasks: kept.slice(0, 5).map((k) => ({
        title: k.c.task,
        model: k.c.top_model,
        total_tokens: null,
        cost_usd: round2(k.c.median_cost),
        similarity: round3(k.c.similarity),
        match_score: k.score,
        size: k.c.size,
      })),
      ...(debug ? {
        debug: {
          candidates: pool.map((c, i) => ({
            task: c.task, similarity: round3(c.similarity), size: c.size, kind: c.work_kind, stack: c.stack,
            score: judgements.get(i)?.score ?? null, reason: judgements.get(i)?.reason ?? null,
          })),
        },
      } : {}),
    };

    cache.set(cacheKey, { at: Date.now(), body: response });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    return json(response);
  } catch (e) {
    console.error(`estimate failed: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    return error("Estimate failed. Try again shortly.", 500);
  }
});
