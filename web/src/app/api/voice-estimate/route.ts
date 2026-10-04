import type { Breakdown, SubtaskCost } from "@/lib/breakdown";
import { demoBreakdown } from "@/lib/demo-estimates";
import { fetchEstimate } from "@/lib/estimate-server";
import type { Estimate, EstimateModel } from "@/lib/types";

const MAX_SUBTASKS = 8;
const MIN_SUCCESS_RATE = 0.7;

type Subtask = { title: string; detail: string };

// Prices a spoken task as the sum of its subtasks. Each subtask is matched
// against recorded runs on its own, on the cheapest reliable model the
// person said they can use.
export async function POST(request: Request) {
  let task = "";
  let subtasks: Subtask[] = [];
  let models: string[] = [];
  try {
    const body = (await request.json()) as { task?: unknown; subtasks?: unknown; models?: unknown };
    task = String(body.task ?? "").trim().slice(0, 2000);
    subtasks = readSubtasks(body.subtasks);
    models = Array.isArray(body.models) ? body.models.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  } catch {
    return Response.json({ error: "Unreadable request." }, { status: 400 });
  }
  if (!task) return Response.json({ error: "Missing task." }, { status: 400 });
  if (!subtasks.length) subtasks = [{ title: task, detail: "" }];
  const demo = demoBreakdown(task, subtasks);
  if (demo) return Response.json(demo);

  const estimates = await Promise.all(
    subtasks.map((subtask) => fetchEstimate(subtask.detail || subtask.title)),
  );
  const priced = subtasks.map((subtask, index) => price(subtask, estimates[index], models));
  const counted = priced.filter((row) => row.usd !== null);
  const breakdown: Breakdown = {
    task,
    total_usd: round(counted.reduce((sum, row) => sum + (row.usd ?? 0), 0)),
    total_high_usd: round(counted.reduce((sum, row) => sum + (row.high_usd ?? row.usd ?? 0), 0)),
    total_tokens: counted.reduce((sum, row) => sum + (row.tokens ?? 0), 0),
    priced: counted.length,
    subtasks: priced,
  };
  return Response.json(breakdown);
}

function price(subtask: Subtask, estimate: Estimate | null, models: string[]): SubtaskCost {
  const empty: SubtaskCost = {
    title: subtask.title,
    model: null,
    usd: null,
    high_usd: null,
    tokens: null,
    similar: 0,
    confidence: "none",
    closest: null,
    outside: false,
  };
  if (!estimate) return empty;
  const usable = estimate.models.filter((row) => row.p50_usd !== null && row.p50_usd !== undefined);
  const theirs = usable.filter((row) => canUse(row.model, models));
  const pool = theirs.length ? theirs : usable;
  const choice = cheapestReliable(pool);
  if (!choice) return { ...empty, closest: estimate.similar_tasks[0]?.title ?? null };
  return {
    title: subtask.title,
    model: choice.model,
    usd: round(choice.p50_usd),
    high_usd: round(choice.p85_usd),
    tokens: Math.round(choice.p50_tokens),
    similar: choice.n,
    confidence: estimate.confidence,
    closest: estimate.similar_tasks[0]?.title ?? null,
    outside: theirs.length === 0 && models.length > 0,
  };
}

function cheapestReliable(rows: EstimateModel[]) {
  if (!rows.length) return null;
  const reliable = rows.filter((row) => row.success_rate === null || row.success_rate >= MIN_SUCCESS_RATE);
  return (reliable.length ? reliable : rows).reduce((best, row) => (row.p50_usd < best.p50_usd ? row : best));
}

// "Opus", "Claude Sonnet" or "GPT-5" match model ids like claude-opus-4-8 by family name.
function canUse(model: string, names: string[]) {
  if (!names.length) return true;
  const id = model.toLowerCase();
  return names.some((name) =>
    name
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .filter((word) => word.length >= 3 && word !== "claude" && word !== "model")
      .some((word) => id.includes(word)),
  );
}

function readSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as { title?: unknown; detail?: unknown };
      return {
        title: String(row.title ?? "").trim().slice(0, 200),
        detail: String(row.detail ?? "").trim().slice(0, 1200),
      };
    })
    .filter((row) => row.title)
    .slice(0, MAX_SUBTASKS);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
