"use client";

import { UsageChart } from "@/components/usage-chart";
import { formatTokens } from "@/lib/format";
import type { DemoAnswer, SolutionPoint } from "@/lib/demo-answer";

export function SolutionDiagram({ answer }: { answer: DemoAnswer }) {
  const leanModel = recommended(answer.models);
  const heavyModel = heaviest(answer.models);
  const leanSetup = recommended(answer.optimizations);

  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium">Average tokens</h2>
        <p className="text-xs text-neutral-400">This task</p>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
        {leanModel.name} is the lean model at {formatTokens(total(leanModel))}.{" "}
        {heavyModel.name} is the heavy one at {formatTokens(total(heavyModel))}. {leanSetup.name}{" "}
        is the leaner setup at {formatTokens(total(leanSetup))}.
      </p>
      <dl className="mt-5 grid gap-2 sm:grid-cols-3">
        <Stat label="Lean model" value={`${leanModel.name} · ${formatTokens(total(leanModel))}`} />
        <Stat label="Lean setup" value={`${leanSetup.name} · ${formatTokens(total(leanSetup))}`} />
        <Stat
          label="Heaviest model"
          value={`${heavyModel.name} · ${formatTokens(total(heavyModel))}`}
        />
      </dl>
      <div className="mt-8 flex flex-col gap-10">
        <UsageChart title="By model" accent="#5b4ce0" points={answer.models} />
        <UsageChart title="By optimization" accent="#f08a24" points={answer.optimizations} />
      </div>
      <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
        <i
          className="h-3.5 w-3.5 rounded-[3px]"
          style={{
            backgroundColor: "#1f8a42",
            backgroundImage:
              "linear-gradient(45deg, #7dcea0 25%, transparent 25%, transparent 50%, #7dcea0 50%, #7dcea0 75%, transparent 75%)",
            backgroundSize: "6px 6px",
          }}
        />
        Checked bar is the lean path
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-neutral-50 px-3 py-3">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

function recommended(points: SolutionPoint[]) {
  return points.find((point) => point.recommended) ?? points[0];
}

function heaviest(points: SolutionPoint[]) {
  return points.reduce((best, point) => (total(point) > total(best) ? point : best));
}

function total(point: SolutionPoint) {
  return point.input + point.output;
}
