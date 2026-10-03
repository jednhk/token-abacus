import { db } from "../_shared/db.ts";
import { embed } from "../_shared/embed.ts";
import { error, json, rateLimited, readJson, sha256 } from "../_shared/http.ts";

// POST a finished task → stored through record_run. Two shapes:
//   { …one task… }          sent by the local MCP server; embedded now and checked for outliers
//   { runs: [ …tasks… ] }   sent by `token-abacus import` (up to 100); stored with source "report"
//                           and embedded by the embed-backfill job (embedding many at once would
//                           exceed the function's CPU limit)
// Contract: docs/MCP.md §7. Token counts come from the client's session log; cost, totals and the
// primary model are computed in the database.

const OUTCOMES = ["success", "partial", "failed", "abandoned", "unknown"];
const TOKEN_SOURCES = ["transcript", "report", "manual", "none"];
const MAX_REQUESTS = 5000;   // per model per task; a long agent session is a few hundred
const MAX_BATCH = 100;
const OUTLIER_FACTOR = 10;   // flag a task >10× or <0.1× the median of ≥5 similar tasks on its model

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Validate one task; returns the record_run payload (without embedding) or an error message. */
function parseRun(body: Record<string, unknown>, source: "mcp" | "report", installHash?: string) {
  const task = str(body.task, 300);
  if (!task) return { error: '"task" is required.' };
  const runId = str(body.run_id, 64);
  if (runId && !/^[0-9a-f-]{36}$/i.test(runId)) return { error: '"run_id" must be a UUID.' };
  const outcome = str(body.outcome, 20) ?? "unknown";
  if (!OUTCOMES.includes(outcome)) return { error: `"outcome" must be one of ${OUTCOMES.join(", ")}.` };
  const tokenSource = str(body.token_source, 20) ?? "none";
  if (!TOKEN_SOURCES.includes(tokenSource)) return { error: `"token_source" must be one of ${TOKEN_SOURCES.join(", ")}.` };
  if (body.models !== undefined && !Array.isArray(body.models)) return { error: '"models" must be an array.' };

  const models = ((body.models as unknown[]) ?? []).slice(0, 20).flatMap((m) => {
    const entry = m as Record<string, unknown>;
    const model = str(entry?.model, 100);
    if (!model) return [];
    // Per-request usage lets the database apply long-context tiers and fast mode exactly.
    const requests = Array.isArray(entry.requests)
      ? (entry.requests as unknown[]).slice(0, MAX_REQUESTS)
          .filter((r): r is unknown[] => Array.isArray(r))
          // [input, output, cache_read, cache_write, cache_write_1h, fast]
          .map((r) => [0, 1, 2, 3, 4, 5].map((i) => count(r[i])))
      : undefined;
    return [{
      model,
      input_tokens: count(entry.input_tokens),
      output_tokens: count(entry.output_tokens),
      cache_read_tokens: count(entry.cache_read_tokens),
      cache_write_tokens: count(entry.cache_write_tokens),
      cache_write_1h_tokens: count(entry.cache_write_1h_tokens),
      ...(requests && requests.length > 0 ? { requests } : {}),
    }];
  });

  return {
    payload: {
      run_id: runId,
      task,
      summary: str(body.summary, 300),
      harness: str(body.harness, 40),
      client_version: str(body.client_version, 40),
      outcome,
      token_source: tokenSource,
      source,
      install_hash: installHash,
      started_at: str(body.started_at, 40),
      ended_at: str(body.ended_at, 40),
      // Tags for matching (record_run validates them): the agent's own judgement for MCP runs,
      // the summarizer's for imports.
      work_kind: str(body.work_kind, 20),
      size: str(body.size, 10),
      stack: Array.isArray(body.stack) ? (body.stack as unknown[]).slice(0, 8) : undefined,
      tagged_by: source === "mcp" ? "agent" : "llm",
      models,
    } as Record<string, unknown>,
  };
}

type Recorded = { run_id: string; status: string; cost_usd: number | null };

Deno.serve(async (req) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (rateLimited(req, 60)) return error("Too many requests. Try again in a minute.", 429);

  const install = req.headers.get("x-abacus-install");
  const installHash = install ? await sha256(install) : undefined;

  // ── batch (imports) ──────────────────────────────────────────────────────────
  if (Array.isArray(body.runs)) {
    if (body.runs.length > MAX_BATCH) return error(`At most ${MAX_BATCH} runs per request.`, 400);
    const results = [];
    for (const item of body.runs) {
      const parsed = parseRun((item ?? {}) as Record<string, unknown>, "report", installHash);
      if ("error" in parsed) { results.push({ status: "rejected", error: parsed.error }); continue; }
      const { data, error: recordError } = await db.rpc("record_run", { payload: parsed.payload });
      if (recordError) { results.push({ status: "rejected", error: recordError.message }); continue; }
      const r = data as Recorded;
      results.push({ id: r.run_id, cost_usd: r.cost_usd, status: r.status, flagged: false });
    }
    return json({ results });
  }

  // ── single task (MCP server) ─────────────────────────────────────────────────
  const parsed = parseRun(body, "mcp", installHash);
  if ("error" in parsed) return error(parsed.error!, 400);

  try {
    const vector = await embed(parsed.payload.task as string);
    const { data: recorded, error: recordError } = await db.rpc("record_run", {
      payload: { ...parsed.payload, embedding: vector },
    });
    if (recordError) return error(recordError.message, 400);
    const result = recorded as Recorded;

    // Outlier check against similar tasks on the same primary model.
    let flagged = false;
    if (result.status === "recorded") {
      const { data: run } = await db.from("runs").select("primary_model, total_tokens").eq("run_id", result.run_id).single();
      const { data: stats } = await db.rpc("estimate_stats", {
        query_embedding: JSON.stringify(vector), match_threshold: 0.8, match_count: 50,
      });
      const same = (stats ?? []).find((s: { model: string }) => s.model === run?.primary_model);
      if (run && same && same.n >= 5 && same.p50_tokens > 0) {
        const ratio = run.total_tokens / same.p50_tokens;
        flagged = ratio > OUTLIER_FACTOR || ratio < 1 / OUTLIER_FACTOR;
        if (flagged) await db.from("runs").update({ flagged: true }).eq("run_id", result.run_id);
      }
    }

    return json({ id: result.run_id, cost_usd: result.cost_usd, status: result.status, flagged });
  } catch (e) {
    console.error(`submit failed: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    return error("Submit failed. Try again shortly.", 500);
  }
});
