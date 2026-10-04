import type { Breakdown } from "@/lib/breakdown";
import { formatTokens, formatUsd } from "@/lib/format";

// One total, then what each subtask adds to it, priced from recorded runs.
export function CostBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const count = breakdown.subtasks.length;
  const peak = Math.max(...breakdown.subtasks.map((row) => row.usd ?? 0), 0.01);
  return (
    <div className="rounded-2xl border border-neutral-200 px-5 py-5">
      <p className="text-sm text-neutral-500">Estimated cost</p>
      <p className="mt-1 font-serif text-5xl font-medium tracking-[-0.03em]">
        {breakdown.summary
          ? `${formatUsd(breakdown.total_usd)} to ${formatUsd(breakdown.total_high_usd)}`
          : breakdown.priced
            ? formatUsd(breakdown.total_usd)
            : "No data yet"}
      </p>
      <p className={`mt-2 text-sm text-neutral-500 ${breakdown.summary ? "max-w-xl leading-6" : ""}`}>
        {breakdown.summary
          ? breakdown.summary
          : breakdown.priced
          ? `Up to ${formatUsd(breakdown.total_high_usd)} · ${formatTokens(breakdown.total_tokens)} tokens · ${
              breakdown.priced === count ? `all ${count} subtasks` : `${breakdown.priced} of ${count} subtasks`
            } priced from recorded runs`
          : "None of these subtasks match a recorded run yet."}
      </p>
      <ul className="mt-5 divide-y divide-neutral-100">
        {breakdown.subtasks.map((row, index) => (
          <li key={`${row.title}-${index}`} className="py-3">
            <div className="flex items-baseline justify-between gap-4">
              <p className="min-w-0 text-[15px] font-medium">{row.title}</p>
              <p className={`shrink-0 text-[15px] tabular-nums ${row.usd === null ? "text-neutral-400" : ""}`}>
                {row.label ?? formatUsd(row.usd)}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-black"
                style={{ width: `${row.usd === null ? 0 : Math.max(4, (row.usd / peak) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500">
              {row.basis
                ? row.basis
                : row.model
                ? `${modelLabel(row.model)} · ${row.similar} similar ${row.similar === 1 ? "task" : "tasks"}${
                    row.outside ? " · not a model you listed" : ""
                  }`
                : "No similar runs yet"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// claude-opus-4-8 → Opus 4.8; anything else is shown as recorded.
function modelLabel(model: string) {
  const match = /^claude-([a-z]+)-([\d-]+)$/.exec(model);
  if (!match) return model;
  return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2].replace(/-/g, ".")}`;
}
