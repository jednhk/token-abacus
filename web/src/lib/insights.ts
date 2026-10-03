import type { RecentRun } from "./types";

export type FeedInsight = {
  taskCount: number;
  pricedCount: number;
  medianCost: number | null;
  cheapest: { model: string; medianCost: number; tasks: number } | null;
  heaviest: { model: string; cost: number } | null;
  splitTasks: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function feedInsight(runs: RecentRun[]): FeedInsight {
  const priced = runs
    .map((run) => run.cost_usd)
    .filter((cost): cost is number => cost !== null);
  const byModel = new Map<string, number[]>();

  for (const run of runs) {
    if (!run.primary_model || run.cost_usd === null) continue;
    if (run.outcome === "failed" || run.outcome === "abandoned") continue;
    const costs = byModel.get(run.primary_model) ?? [];
    costs.push(run.cost_usd);
    byModel.set(run.primary_model, costs);
  }

  let cheapest: FeedInsight["cheapest"] = null;
  for (const [model, costs] of byModel) {
    const medianCost = median(costs);
    if (medianCost === null) continue;
    if (!cheapest || medianCost < cheapest.medianCost) {
      cheapest = { model, medianCost, tasks: costs.length };
    }
  }

  const spend = new Map<string, number>();
  for (const run of runs) {
    for (const model of run.models ?? []) {
      if (model.cost_usd === null) continue;
      spend.set(model.model, (spend.get(model.model) ?? 0) + model.cost_usd);
    }
  }
  let heaviest: FeedInsight["heaviest"] = null;
  for (const [model, cost] of spend) {
    if (!heaviest || cost > heaviest.cost) heaviest = { model, cost };
  }

  return {
    taskCount: runs.length,
    pricedCount: priced.length,
    medianCost: median(priced),
    cheapest,
    heaviest,
    splitTasks: runs.filter((run) => (run.models?.length ?? 0) > 1).length,
  };
}
