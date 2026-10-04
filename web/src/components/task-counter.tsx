"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const POLL_MS = 15000;

// GitHub-stars-style badge: how many tasks people have submitted, refreshed
// while the page is open.
export function TaskCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let live = true;

    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/task-count", { cache: "no-store" });
        const body = (await response.json()) as { count: number | null };
        if (live && typeof body.count === "number") setCount(body.count);
      } catch {
        /* Keep the last number. */
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (count === null) return null;

  return (
    <Link
      href="/#tasks"
      aria-label={`${count.toLocaleString("en-US")} tasks submitted`}
      className="flex items-stretch overflow-hidden rounded-full border border-neutral-200 text-sm font-medium hover:border-neutral-400"
    >
      <span className="flex items-center gap-1.5 py-1.5 pl-2.5 text-neutral-700 sm:bg-neutral-50 sm:pr-2">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span className="hidden sm:inline">Tasks</span>
      </span>
      <span className="flex items-center pr-2.5 pl-1.5 tabular-nums sm:border-l sm:border-neutral-200 sm:pl-2.5">
        <span key={count} className="animate-[abacus-tick_400ms_ease-out]">
          {formatCount(count)}
        </span>
      </span>
    </Link>
  );
}

function formatCount(count: number) {
  if (count < 10000) return count.toLocaleString("en-US");
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
    .format(count)
    .toLowerCase();
}
