import { db } from "../_shared/db.ts";
import { error, json } from "../_shared/http.ts";
import { tagTasks } from "../_shared/tags.ts";

// Tags stored tasks that have no kind/size/stack yet (imports, older rows), with Claude Haiku.
// pg_cron calls it every minute while untagged tasks exist; safe to call by hand. Each call tags up
// to BATCHES × BATCH distinct task texts and writes the tags to every run with that text.

const BATCH = 40;
const BATCHES = 3;

Deno.serve(async (req) => {
  if (req.method !== "POST") return error("Use POST.", 405);
  const started = Date.now();
  let tagged = 0;
  let rows = 0;
  let failed = 0;
  let lastError: string | undefined;

  for (let b = 0; b < BATCHES; b++) {
    const { data: pending, error: selectError } = await db.rpc("untagged_tasks", { max_rows: BATCH });
    if (selectError) return error(selectError.message, 500);
    const tasks = ((pending ?? []) as { task: string }[]).map((p) => p.task);
    if (tasks.length === 0) break;

    let tags;
    try {
      tags = await tagTasks(tasks);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`tagging failed: ${lastError}`);
      failed += tasks.length;
      break;
    }
    for (const [i, t] of tags) {
      const { count, error: updateError } = await db.from("runs")
        .update({ work_kind: t.work_kind, size: t.size, stack: t.stack, tagged_by: "llm" }, { count: "exact" })
        .eq("task", tasks[i])
        .is("tagged_by", null);
      if (updateError) { failed++; continue; }
      tagged++;
      rows += count ?? 0;
    }
    failed += tasks.length - tags.size;
  }

  const { count: remaining } = await db.from("runs").select("run_id", { count: "exact", head: true }).is("tagged_by", null);
  return json({ tagged, rows, failed, remaining, ms: Date.now() - started, ...(lastError ? { error: lastError.slice(0, 300) } : {}) });
});
