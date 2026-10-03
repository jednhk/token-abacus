"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatTokens, formatUsd, timeAgo } from "@/lib/format";
import type { RecentRun } from "@/lib/types";

const PAGE_SIZE = 8;
const MIN_CATEGORY = 2;
const MAX_CATEGORIES = 6;

export function TaskList({ runs }: { runs: RecentRun[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<RecentRun | null>(null);

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
            <TaskRow
              key={`${run.created_at}-${run.task}`}
              run={run}
              onOpen={run.summary ? () => setOpen(run) : undefined}
            />
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
      {open?.summary ? <PromptDialog run={open} onClose={() => setOpen(null)} /> : null}
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

function TaskRow({ run, onOpen }: { run: RecentRun; onOpen?: () => void }) {
  const model = run.primary_model ?? run.models?.[0]?.model ?? "Unknown model";
  const extra = Math.max(0, (run.models?.length ?? 0) - 1);
  const flag = run.outcome === "failed" || run.outcome === "abandoned" || run.outcome === "partial";
  const title = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className="line-clamp-3 w-full text-left font-medium leading-6 hover:underline"
    >
      {run.summary}
    </button>
  ) : (
    <p className="truncate font-medium">{run.task}</p>
  );

  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3.5 ${onOpen ? "items-start" : "items-baseline"}`}
    >
      {title}
      <span className="shrink-0 font-medium tabular-nums">{formatUsd(run.cost_usd)}</span>
      <p className="col-span-2 truncate text-sm text-neutral-500" suppressHydrationWarning>
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

function PromptDialog({ run, onClose }: { run: RecentRun; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copyPrompt() {
    const text = run.summary ?? "";
    const ok = await writeClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close prompt"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        className="relative max-h-[min(32rem,80dvh)] w-full max-w-xl overflow-y-auto rounded-3xl bg-white px-5 py-5 shadow-xl sm:px-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 id="prompt-dialog-title" className="text-base font-medium">
            Full prompt
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm text-neutral-700 hover:bg-neutral-100"
              onClick={() => void copyPrompt()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full hover:bg-neutral-100"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-7 whitespace-pre-wrap text-neutral-800">{run.summary}</p>
      </div>
    </div>
  );
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "0";
      area.style.top = "0";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
