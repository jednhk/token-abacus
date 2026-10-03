import { db } from "../_shared/db.ts";
import { embed } from "../_shared/embed.ts";
import { error, json } from "../_shared/http.ts";

// Embeds tasks that were written without an embedding (imports via record_run, teammates' scripts).
// pg_cron calls it several times in parallel every 10 seconds; safe to call by hand.
//
// Each call is capped by Supabase's per-request CPU limit, and model inference counts against it:
// ~14 embeddings exhausted it in testing, so a call embeds 8 distinct task texts. Imports often
// repeat the same task across many models (one benchmark issue × 20 models), so each embedding is
// written to every unembedded row with that exact text.

const PER_CALL = 8;
const SCAN = 500;

Deno.serve(async (req) => {
  if (req.method !== "POST") return error("Use POST.", 405);
  const started = Date.now();
  let embedded = 0;
  let rowsUpdated = 0;
  let failed = 0;

  const { data: pending, error: selectError } = await db
    .from("runs")
    .select("task")
    .is("embedding", null)
    .order("created_at", { ascending: true })
    .limit(SCAN);
  if (selectError) return error(selectError.message, 500);

  // Parallel callers start at different points in the list so they rarely pick the same text.
  const texts = [...new Set((pending ?? []).map((r) => r.task as string))];
  const start = texts.length > PER_CALL ? Math.floor(Math.random() * Math.min(texts.length, PER_CALL * 4)) : 0;
  const batch = [...texts.slice(start), ...texts.slice(0, start)].slice(0, PER_CALL);

  for (const task of batch) {
    try {
      const vector = await embed(task);
      const { count, error: updateError } = await db
        .from("runs")
        .update({ embedding: JSON.stringify(vector) }, { count: "exact" })
        .eq("task", task)
        .is("embedding", null);
      if (updateError) throw updateError;
      embedded++;
      rowsUpdated += count ?? 0;
    } catch (e) {
      failed++;
      console.error(`embedding "${task.slice(0, 60)}" failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  const { count } = await db.from("runs").select("run_id", { count: "exact", head: true }).is("embedding", null);
  return json({ embedded, rows_updated: rowsUpdated, failed, remaining: count ?? null, ms: Date.now() - started });
});
