"use client";

import { useMemo, useState, type ReactNode } from "react";
import { formatTokens, formatUsd, timeAgo } from "@/lib/format";
import type { RecentRun } from "@/lib/types";

const PAGE_SIZE = 8;
const MIN_CATEGORY = 2;
const MAX_CATEGORIES = 6;

export function TaskList({ runs }: { runs: RecentRun[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const categories = useMemo(() => topCategories(runs), [runs]);
  const active = categories.some((item) => item.id === category) ? category : null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return runs.filter((run) => {
      if (active && taskCategory(run.task) !== active) return false;
      if (needle && !haystack(run).includes(needle)) return false;
      return true;
    });
  }, [active, query, runs]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.length === 0 ? 1 : Math.min(page, pageCount);
  const start = (current - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  return (
    <div className="mt-8">
      <label className="flex items-center gap-2 rounded-full border border-neutral-200 px-4 py-2">
        <SearchIcon />
        <span className="sr-only">Search tasks</span>
        <input
          value={query}
          placeholder="Search tasks or models"
          className="w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>

      {categories.length > 0 ? (
        <div
          className="mt-3 flex flex-wrap gap-2"
          role="group"
          aria-label="Task categories"
        >
          <CategoryChip
            selected={active === null}
            onClick={() => {
              setCategory(null);
              setPage(1);
            }}
          >
            All
          </CategoryChip>
          {categories.map((item) => (
            <CategoryChip
              key={item.id}
              selected={active === item.id}
              onClick={() => {
                setCategory(item.id);
                setPage(1);
              }}
            >
              {item.label}
              <span
                className={`tabular-nums ${active === item.id ? "text-white/70" : "text-neutral-400"}`}
              >
                {item.count}
              </span>
            </CategoryChip>
          ))}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-500">
          No tasks match that search.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-200">
          {visible.map((run) => (
            <TaskRow key={`${run.created_at}-${run.task}`} run={run} />
          ))}
        </ul>
      )}

      {filtered.length > PAGE_SIZE ? (
        <nav
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
          aria-label="Task pages"
        >
          <p className="text-sm text-neutral-500 tabular-nums">
            {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <PageButton
              label="Previous page"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <Chevron direction="left" />
            </PageButton>
            {pageItems(current, pageCount).map((item, index) =>
              item === "gap" ? (
                <span key={`gap-${index}`} className="px-1 text-sm text-neutral-400">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  aria-label={`Page ${item}`}
                  aria-current={item === current ? "page" : undefined}
                  className={`grid h-8 min-w-8 place-items-center rounded-full px-2 text-sm tabular-nums ${
                    item === current
                      ? "bg-black text-white"
                      : "text-neutral-500 hover:bg-neutral-100 hover:text-black"
                  }`}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              ),
            )}
            <PageButton
              label="Next page"
              disabled={current === pageCount}
              onClick={() => setPage(current + 1)}
            >
              <Chevron direction="right" />
            </PageButton>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function topCategories(runs: RecentRun[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const run of runs) {
    const id = taskCategory(run.task);
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= MIN_CATEGORY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_CATEGORIES)
    .map(([id, count]) => ({ id, label: categoryLabel(id), count }));
}

function taskCategory(task: string): string | null {
  const match = task.match(/\b[\w.-]+\/([\w.-]+)\b/);
  return match ? match[1].toLowerCase() : null;
}

function categoryLabel(id: string): string {
  if (id.includes("-")) return id;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function CategoryChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
        selected
          ? "border-black bg-black text-white"
          : "border-neutral-200 text-neutral-700 hover:border-black"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TaskRow({ run }: { run: RecentRun }) {
  const model = run.primary_model ?? run.models?.[0]?.model ?? "Unknown model";
  const extra = Math.max(0, (run.models?.length ?? 0) - 1);
  const flag = run.outcome === "failed" || run.outcome === "abandoned" || run.outcome === "partial";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 py-3.5">
      <p className="truncate font-medium" title={run.task}>
        {run.task}
      </p>
      <span className="shrink-0 font-medium tabular-nums">{formatUsd(run.cost_usd)}</span>
      <p className="col-span-2 truncate text-sm text-neutral-500">
        {model}
        {extra > 0 ? ` +${extra}` : ""}
        <span aria-hidden="true"> · </span>
        {formatTokens(run.total_tokens)}
        <span aria-hidden="true"> · </span>
        {timeAgo(run.created_at)}
        {flag ? (
          <>
            <span aria-hidden="true"> · </span>
            {run.outcome}
          </>
        ) : null}
      </p>
    </li>
  );
}

function haystack(run: RecentRun): string {
  return [
    run.task,
    run.summary,
    run.harness,
    run.primary_model,
    run.outcome,
    ...(run.models ?? []).map((model) => model.model),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pageItems(current: number, total: number): Array<number | "gap"> {
  const items: Array<number | "gap"> = [];
  for (let page = 1; page <= total; page += 1) {
    const show = page === 1 || page === total || Math.abs(page - current) <= 1;
    if (show) items.push(page);
    else if (items[items.length - 1] !== "gap") items.push("gap");
  }
  return items;
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-300"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-neutral-400">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16.5 20 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={direction === "left" ? "M14 6 8 12l6 6" : "M10 6l6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
