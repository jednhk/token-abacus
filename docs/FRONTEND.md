# Frontend guide: reading Token Abacus data in `web/`

For the website (Next.js 16, App Router, React 19, Tailwind). Covers what data exists, what every
field means, how to fetch it, and how to show it. Database details: [SCHEMA.md](SCHEMA.md).

## 1. What the website can access

| Data | How | Status |
|---|---|---|
| **Recent tasks** — the live feed of real tasks people ran, with models, tokens and cost | `recent_runs` database function | ✅ Live (empty until data is uploaded) |
| **Estimate** — "what will this task cost?" | `estimate` Edge Function | 🔜 Coming — contract in §8 so you can build against it now |

The website uses the **publishable key** only. It can call `recent_runs` and nothing else — the
tables are locked by row-level security, so `supabase.from("runs").select()` returns no rows.
That's intentional, not a bug.

## 2. Setup

```bash
cd web
npm install @supabase/supabase-js
```

`web/.env.local` (gitignored — get the publishable key from the WhatsApp group or Dashboard → Project Settings → API Keys):
```
NEXT_PUBLIC_SUPABASE_URL=https://fgkiecqobecqwwqixrem.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never put the **secret** key in `web/`. Anything in a Next.js app can end up in the browser bundle.

`src/lib/supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },   // no user login against Supabase; read-only public data
);
```

## 3. Types

`src/lib/types.ts`:
```ts
export type Outcome = "success" | "partial" | "failed" | "abandoned" | "unknown";

/** One model's share of a task. A task can use several models. */
export type RunModel = {
  model: string;               // "claude-opus-5-5"
  total_tokens: number;
  cost_usd: number | null;     // null = no price for this model yet
};

/** One task from the public feed (`recent_runs`). */
export type RecentRun = {
  task: string;                // what was asked, one sentence
  summary: string | null;      // what was actually done, one sentence
  harness: string | null;      // "claude-code" | "codex" | "cursor" | …
  primary_model: string | null;
  models: RunModel[] | null;   // biggest first; null only if something went wrong upstream
  total_tokens: number;
  cost_usd: number | null;     // whole task, all models
  outcome: Outcome;
  duration_s: number | null;
  created_at: string;          // ISO 8601
};
```

## 4. What every field means

A **task** is one unit of work an agent did for someone: "Set up a Caddy reverse proxy",
"Fix the login redirect bug". Tasks are small and specific, not whole projects.

| Field | Meaning | How to show it |
|---|---|---|
| `task` | The request, written as one clear sentence by the agent. Already redacted (no keys, emails, paths, names). | Main line of a row/card |
| `summary` | What the agent actually did. Can be null. | Secondary text, muted |
| `harness` | The coding tool the task ran in. | Small label: `claude-code` → "Claude Code", `codex` → "Codex", `cursor` → "Cursor", anything else → as is |
| `primary_model` | The model that did most of the work (most output tokens). | Headline model on the card |
| `models` | **Every** model the task used, biggest first. Often 1; 2–3 when an agent hands sub-work to a cheaper model. | Model chips, or a split bar showing each model's share of tokens |
| `total_tokens` | All tokens across all models: input + output + cache reads + cache writes. | "216k tokens". Big numbers are normal (see note) |
| `cost_usd` | Real cost of the whole task in USD, computed from list prices. **Null** if any model isn't priced yet. | "$0.43"; "<$0.01" for tiny values; "—" when null |
| `outcome` | How it ended. `unknown` = the agent didn't say (e.g. the session closed). | Badge: success (green), partial (amber), failed/abandoned (red), unknown (grey) |
| `duration_s` | Seconds from start to finish. Can be null. | "12m 30s" |
| `created_at` | When it was recorded. | Relative: "3 min ago" |

**Why token counts look huge:** coding agents re-read their conversation on every step. Most of
that is *cache reads*, which are cheap. 10M tokens can cost a few dollars. Lead with **cost**,
show tokens second.

## 5. Fetching

### Server Component (simple, good for most pages)
```tsx
// src/app/tasks/page.tsx
import { supabase } from "@/lib/supabase";
import type { RecentRun } from "@/lib/types";
import { RecentTasks } from "@/components/recent-tasks";

export const revalidate = 30;   // refresh at most every 30 s

export default async function TasksPage() {
  const { data, error } = await supabase.rpc("recent_runs", { max_rows: 50 });
  if (error) throw new Error(error.message);         // shows the nearest error.tsx
  return <RecentTasks runs={(data ?? []) as RecentRun[]} />;
}
```

### Client polling (for a live "database growing" demo screen)
```tsx
"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { RecentRun } from "@/lib/types";

export function useRecentRuns(intervalMs = 5000) {
  const [runs, setRuns] = useState<RecentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("recent_runs", { max_rows: 50 });
      if (!alive) return;
      if (error) setError(error.message);
      else { setRuns((data ?? []) as RecentRun[]); setError(null); }
    };
    load();
    const id = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(id); };
  }, [intervalMs]);
  return { runs, error };   // runs === null → still loading
}
```

`recent_runs(max_rows)`: newest first, `max_rows` 1–200 (default 50). Only finished tasks with
token counts are included; incomplete or flagged rows never appear.

## 6. Formatting helpers

`src/lib/format.ts`:
```ts
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

export function formatUsd(n: number | null): string {
  if (n === null) return "—";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function formatDuration(s: number | null): string {
  if (s === null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const HARNESS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", cursor: "Cursor" };
export const harnessLabel = (h: string | null) => (h ? HARNESS[h] ?? h : "Unknown tool");

export function timeAgo(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
```

## 7. Example component

```tsx
// src/components/recent-tasks.tsx
import type { RecentRun } from "@/lib/types";
import { formatDuration, formatTokens, formatUsd, harnessLabel, timeAgo } from "@/lib/format";

const OUTCOME_STYLE: Record<RecentRun["outcome"], string> = {
  success: "bg-emerald-50 text-emerald-700",
  partial: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  abandoned: "bg-red-50 text-red-700",
  unknown: "bg-neutral-100 text-neutral-500",
};

export function RecentTasks({ runs }: { runs: RecentRun[] }) {
  if (runs.length === 0) {
    return (
      <p className="py-12 text-center text-neutral-500">
        No tasks recorded yet. Install the MCP server and run a task to add the first one.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-neutral-200">
      {runs.map((run) => (
        <li key={`${run.created_at}-${run.task}`} className="flex flex-col gap-2 py-4">
          <div className="flex items-start justify-between gap-4">
            <p className="min-w-0 font-medium">{run.task}</p>
            <span className="shrink-0 tabular-nums font-medium">{formatUsd(run.cost_usd)}</span>
          </div>
          {run.summary && <p className="text-sm text-neutral-500">{run.summary}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
            <span className={`rounded-full px-2 py-0.5 ${OUTCOME_STYLE[run.outcome]}`}>{run.outcome}</span>
            <span>{harnessLabel(run.harness)}</span>
            <span>·</span>
            <span className="tabular-nums">{formatTokens(run.total_tokens)} tokens</span>
            <span>·</span>
            <span className="tabular-nums">{formatDuration(run.duration_s)}</span>
            <span>·</span>
            <span>{timeAgo(run.created_at)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(run.models ?? []).map((m) => (
              <span key={m.model} className="rounded-md border border-neutral-200 px-2 py-0.5 text-xs">
                {m.model} · {formatTokens(m.total_tokens)}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

Note: `recent_runs` doesn't return an id. Use `created_at + task` as the React key.

## 8. Estimate (coming next)

The estimate box in `HomeStudio` currently uses the scripted `buildReply()` in
`src/lib/content.ts`. When the `estimate` Edge Function is live, swap it in.

**Call it from the server** (a Route Handler or Server Action), not the browser:

```ts
// src/app/api/estimate/route.ts
export async function POST(request: Request) {
  const { prompt } = await request.json();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/estimate`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-abacus-install": "website" },
    body: JSON.stringify({ prompt, harness: "website" }),
  });
  return Response.json(await response.json(), { status: response.status });
}
```

Request: `{ "prompt": "Set up Caddy reverse proxy with TLS for a Next.js app", "model"?: "claude-sonnet-5-5" }`

Response:
```ts
export type Estimate = {
  recommendation: {
    model: string;
    budget_tokens: number;   // 85th percentile × 1.15 — enough for ~85% of similar tasks
    budget_usd: number;
    ceiling_tokens: number;  // 95th percentile
    ceiling_usd: number;
  } | null;                  // null when there's no similar data yet
  confidence: "high" | "medium" | "low" | "none";
  models: {                  // one row per model that has done similar tasks
    model: string; n: number; success_rate: number;
    p50_tokens: number; p85_tokens: number; p50_usd: number; p85_usd: number;
  }[];
  similar_tasks: { title: string; model: string; total_tokens: number; cost_usd: number; similarity: number }[];
};
```

Mapping onto the existing `Reply` type so `HomeStudio` keeps working:
```ts
function toReply(e: Estimate): Reply {
  if (!e.recommendation) {
    return {
      summary: "No similar tasks recorded yet, so there's no estimate for this one.",
      recommendation: "Run it once with the MCP server installed and it will be the first data point.",
      lines: [],
      suggested: 0,
    };
  }
  const r = e.recommendation;
  const n = e.models.find((m) => m.model === r.model)?.n ?? 0;
  return {
    summary: `Similar tasks cost about ${formatUsd(r.budget_usd)} on ${r.model} (${n} similar tasks, ${e.confidence} confidence).`,
    recommendation: `Use ${r.model} with a ${formatTokens(r.budget_tokens)}-token budget.`,
    lines: e.models.map((m) => ({ label: m.model, tokens: Math.round(m.p50_tokens) })),
    suggested: r.budget_tokens,
  };
}
```

Show `similar_tasks` under the estimate ("Based on tasks like…"). It's the most convincing part
of the product.

## 9. Sample data for development

Until real data exists, use this in place of the RPC result (`src/lib/sample-runs.ts`):
```ts
import type { RecentRun } from "./types";

export const sampleRuns: RecentRun[] = [
  {
    task: "Set up Caddy reverse proxy with TLS for a Next.js app",
    summary: "Configured Caddy with automatic HTTPS and a health check",
    harness: "claude-code",
    primary_model: "claude-sonnet-5-5",
    models: [{ model: "claude-sonnet-5-5", total_tokens: 182000, cost_usd: 0.37 }],
    total_tokens: 182000, cost_usd: 0.37, outcome: "success", duration_s: 750,
    created_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    task: "Add Stripe checkout to the pricing page",
    summary: "Added Checkout session route, webhook handler and success page",
    harness: "claude-code",
    primary_model: "claude-opus-5-5",
    models: [
      { model: "claude-opus-5-5", total_tokens: 1240000, cost_usd: 2.85 },
      { model: "claude-haiku-4-5", total_tokens: 310000, cost_usd: 0.09 },
    ],
    total_tokens: 1550000, cost_usd: 2.94, outcome: "success", duration_s: 2710,
    created_at: new Date(Date.now() - 52 * 60_000).toISOString(),
  },
  {
    task: "Fix the login redirect loop after session expiry",
    summary: null,
    harness: "codex",
    primary_model: "gpt-5",
    models: [{ model: "gpt-5", total_tokens: 96000, cost_usd: null }],
    total_tokens: 96000, cost_usd: null, outcome: "unknown", duration_s: 410,
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
];
```
These numbers are made up for layout only. Label any screen that uses them as sample data.

## 10. Checklist

- [ ] Publishable key in `web/.env.local`; no secret key anywhere in `web/`
- [ ] Empty state when `recent_runs` returns `[]` (it does today)
- [ ] `cost_usd: null` shows "—", not "$0.00" or "NaN"
- [ ] Tasks with several models show every model
- [ ] Cost first, tokens second
- [ ] Error state if the RPC fails (network, wrong key)

Need something the feed doesn't give you (totals per model, cost per day, leaderboard)? Ask Shah
for a new read-only database function — don't query the tables directly.
