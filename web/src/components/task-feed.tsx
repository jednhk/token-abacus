import { TaskList } from "@/components/task-list";
import { formatUsd } from "@/lib/format";
import { feedInsight } from "@/lib/insights";
import type { TaskFeed } from "@/lib/runs";

export function TaskFeed({ feed }: { feed: TaskFeed }) {
  const insight = feed.insight ?? feedInsight(feed.runs);
  const sample = feed.source === "sample";

  return (
    <section className="mx-auto max-w-3xl px-4 pt-10 pb-20 sm:px-6 sm:pt-16 sm:pb-28">
      <h2 className="font-serif text-[2rem] leading-none tracking-tight sm:text-4xl">
        What tasks actually cost
      </h2>
      <p className="mt-3 text-sm text-neutral-500">
        {sample ? "Sample preview. " : ""}
        {formatUsd(insight.medianCost)} typical
        {insight.cheapest
          ? ` · ${insight.cheapest.model} is the cheaper model`
          : ""}
      </p>
      <TaskList runs={feed.runs} />
    </section>
  );
}
