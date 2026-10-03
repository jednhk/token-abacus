import { db } from "../_shared/db.ts";
import { embed } from "../_shared/embed.ts";
import { error, json, rateLimited, readJson, sha256 } from "../_shared/http.ts";

// POST a finished task (sent by the local MCP server) → stored through record_run.
// Contract: docs/MCP.md §7. Token counts come from the client's session log; cost, totals and the
// primary model are computed in the database.

const OUTCOMES = ["success", "partial", "failed", "abandoned", "unknown"];
const TOKEN_SOURCES = ["transcript", "report", "manual", "none"];
const OUTLIER_FACTOR = 10;   // flag a task >10× or <0.1× the median of ≥5 similar tasks on its model

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

Deno.serve(async (req) => {
  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (rateLimited(req, 60)) return error("Too many requests. Try again in a minute.", 429);

  const task = str(body.task, 300);
  if (!task) return error('"task" is required.', 400);
  const runId = str(body.run_id, 64);
  if (runId && !/^[0-9a-f-]{36}$/i.test(runId)) return error('"run_id" must be a UUID.', 400);
  const outcome = str(body.outcome, 20) ?? "unknown";
  if (!OUTCOMES.includes(outcome)) return error(`"outcome" must be one of ${OUTCOMES.join(", ")}.`, 400);
  const tokenSource = str(body.token_source, 20) ?? "none";
  if (!TOKEN_SOURCES.includes(tokenSource)) return error(`"token_source" must be one of ${TOKEN_SOURCES.join(", ")}.`, 400);
  if (body.models !== undefined && !Array.isArray(body.models)) return error('"models" must be an array.', 400);

  const models = ((body.models as unknown[]) ?? []).slice(0, 20).flatMap((m) => {
    const entry = m as Record<string, unknown>;
    const model = str(entry?.model, 100);
    if (!model) return [];
    return [{
      model,
      input_tokens: count(entry.input_tokens),
      output_tokens: count(entry.output_tokens),
      cache_read_tokens: count(entry.cache_read_tokens),
      cache_write_tokens: count(entry.cache_write_tokens),
    }];
  });

  const install = req.headers.get("x-abacus-install");

  try {
    const vector = await embed(task);
    const { data: recorded, error: recordError } = await db.rpc("record_run", {
      payload: {
        run_id: runId,
        task,
        summary: str(body.summary, 300),
        harness: str(body.harness, 40),
        client_version: str(body.client_version, 40),
        outcome,
        token_source: tokenSource,
        source: "mcp",
        install_hash: install ? await sha256(install) : undefined,
        started_at: str(body.started_at, 40),
        ended_at: str(body.ended_at, 40),
        embedding: vector,
        models,
      },
    });
    if (recordError) return error(recordError.message, 400);
    const result = recorded as { run_id: string; status: string; cost_usd: number | null };

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
