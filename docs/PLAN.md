# Token Abacus — build plan

> Before an agent starts a task, tell it **which model to use and what budget to set**, based on
> what similar tasks actually cost other people. After the task, record what it really cost —
> automatically.

## 1. Why

Nobody can predict what an agent task will cost. A solopreneur doesn't know if "set up a reverse
proxy" is a $0.40 or a $4 job, and an agent running overnight has no realistic budget to work
against — it either stops too early or burns money.

Token Abacus is a shared database of real tasks (task → model → tokens → cost). Before a task, the
agent asks it for a recommended model and budget; after the task, the real numbers go back in.

**Who it's for**
- **Solopreneurs / indie builders** — want a cost number before they press go.
- **Agents running unattended** — need a budget ceiling grounded in data, not a guess.

**How data gets in**
1. **Automatically, every task (main path).** The local MCP server estimates before each task and
   uploads the real token counts after it. One install, then nothing to remember.
2. **Usage report (second path).** The website gives users a prompt to paste into their coding
   tool; it runs our script, which builds a report of their last 30 days (tokens, cost, models,
   what they shipped) and offers to contribute that history. Gets months of data in one go.
3. **Manual submissions (stretch).** A web form + leaderboard.

## 2. Demo (what judges see)

1. Fresh machine: `npx token-abacus init` → "Added to Claude Code and Cursor. Contribute data? Y".
2. In Claude Code: *"Set up a Caddy reverse proxy for my app."* The agent replies first with
   *"Similar tasks cost ~$0.40 on Sonnet (budget 180k tokens, 31 similar tasks)"*, then works.
3. When it's done, the agent records the task — the dashboard shows the new row with **exact**
   token counts read from the session log, next to the estimate.
4. Website: paste the report prompt → 30-day usage report → contribute → database grows live.

## 3. Architecture

```
User's machine                                         Supabase
┌───────────────────────────────────────┐             ┌──────────────────────────────────────────┐
│ Claude Code / Codex / Cursor           │             │ Edge Functions (Deno/TypeScript)         │
│   │ stdio (MCP)                        │   HTTPS     │   estimate  embed (gte-small) → stats    │
│   ▼                                    │ ──────────► │   submit    validate → tag → embed →     │
│ token-abacus mcp (local, via npx)      │             │             cost → outlier check → upsert│
│   tools: estimate_task, submit_run     │             │   report    batch of past sessions       │
│   reads the session log for exact      │             │                                          │
│   token counts; never trusts the agent │             │ Postgres + pgvector: runs, model_pricing │
└───────────────────────────────────────┘             └──────────────────────────────────────────┘
```

**Why local, not a hosted MCP server:** at the end of a task someone has to say how many tokens it
used. The agent can't — it doesn't see its own usage. A local server can read the harness's own
session log (Claude Code, Codex) and add it up exactly.

**Why it's fast:** the prompt is embedded inside the Edge Function with Supabase's built-in
`gte-small` model (384 dims) — no external embedding API call. The database side is one function
call that finds the nearest past tasks and computes per-model stats in a single query. Target:
under 300 ms. Warm the function up before the demo.

## 4. Repo layout

```
supabase/migrations/      schema
supabase/functions/       estimate/, submit/, report/
cli/                      npm package `token-abacus`: `mcp` (local MCP server), `init`, `report`
web/                      landing page, estimate box, report prompt, dashboard
docs/                     PLAN.md (this), MCP.md (local MCP build guide)
```

## 5. API

All endpoints: `POST https://fgkiecqobecqwwqixrem.supabase.co/functions/v1/<name>`, JWT
verification off, header `x-abacus-install: <install_id>` for rate limiting.

### `estimate`
```json
// request
{ "prompt": "Set up Caddy reverse proxy with TLS for a Next.js app", "model": "claude-sonnet-5-5", "harness": "claude-code" }

// response
{
  "recommendation": { "model": "claude-sonnet-5-5", "budget_tokens": 180000, "budget_usd": 0.40,
                      "ceiling_tokens": 290000, "ceiling_usd": 0.65 },
  "confidence": "high",                       // high | medium | low | none
  "models": [ { "model": "claude-sonnet-5-5", "n": 31, "success_rate": 0.9,
                "p50_tokens": 120000, "p85_tokens": 156000, "p50_usd": 0.27, "p85_usd": 0.35 } ],
  "similar_tasks": [ { "title": "Nginx reverse proxy with Let's Encrypt", "model": "claude-sonnet-5-5",
                       "total_tokens": 140000, "cost_usd": 0.31, "similarity": 0.91 } ]
}
// no matches → confidence "none", recommendation null
```

### `submit`
```json
// request (sent by the local MCP server; tokens come from the session log, never the agent)
{ "run_id": "6f1c…", "task": "Set up Caddy reverse proxy with TLS for a Next.js app",
  "summary": "Configured Caddy reverse proxy with automatic TLS",
  "harness": "claude-code", "client_version": "2.1.0", "outcome": "success",
  "started_at": "2026-10-04T10:00:00Z", "ended_at": "2026-10-04T10:12:30Z",
  "token_source": "transcript",               // transcript | none
  "models": [ { "model": "claude-sonnet-5-5", "input_tokens": 12000, "output_tokens": 9000,
                "cache_read_tokens": 150000, "cache_write_tokens": 11000 } ] }
// response — upsert by run_id, so retries are safe
{ "id": "uuid", "cost_usd": 0.37, "status": "recorded", "flagged": false }
// token_source "none" → status "pending" (not used in estimates until tokens are filled in)
```

### `report`
```json
// request (built by the report script from local logs)
{ "window_days": 30, "upload": true,
  "sessions": [ { "session_id": "…", "harness": "claude-code", "prompts": ["…redacted…"],
                  "models": [ … same shape as submit … ],
                  "started_at": "…", "ended_at": "…", "commits": ["feat: add booking form"] } ] }
// response
{ "totals": { "sessions": 41, "tokens": 0, "usd": 0 },
  "by_model": [], "by_day": [], "by_harness": [], "top_shipped": [] }
```

## 6. How the estimate is made

| Step | Rule |
|---|---|
| Find similar tasks | 50 nearest by meaning, keep similarity ≥ 0.80, drop flagged and pending rows |
| Candidate models | at least 1 similar task; models with ≥ 3 are preferred when any exist |
| Recommended model | cheapest median cost among models with ≥ 70% success (or the model the user is running) |
| Budget | 85th-percentile tokens × 1.15 — enough for ~85% of similar tasks, plus headroom |
| Ceiling | 95th percentile |
| Confidence | low: 1–2 tasks · medium: 3–9 · high: ≥ 10 tasks, high similarity, p85 < 2 × p50 |
| No similar task | no estimate (`confidence: "none"`) — unrelated requests score below 0.80 against the data |

Percentiles use successful tasks only. Budgets are shown in USD first, tokens second — cache reads
dominate raw token counts, so dollars are what users understand.

## 7. Data quality

- **Task boundaries** come from the agent: one `estimate_task` + one `submit_run` = one task. That
  gives small, specific rows ("set up Caddy", "fix login bug"), not whole sessions.
- **Token counts** come from the session log, never from the agent. Dedupe by `requestId` and
  include subagent logs (details in MCP.md §6).
- **Text** is the agent's one-sentence task + summary, scrubbed locally for keys, emails and paths.
  Server-side, Haiku tags `task_type` and `scope` and does a second redaction pass.
- **Trust weights:** automatic (MCP) 1.0 · report 0.8 · manual submission 0.3. Rows more than 10×
  or less than 0.1× the median of ≥ 5 similar tasks are flagged and excluded.
- **Model names** are normalized to `model_pricing` keys; cost is always computed server-side.

## 8. Database changes (Shah)

The first migration is applied. Migration 2 adds the run lifecycle:

- `runs`: add `run_id uuid unique` (upsert key), `task text`, `summary text`, `status`
  (`recorded` | `pending`), `token_source`, `started_at`, `ended_at`, `client_version`,
  `install_hash`, and `models jsonb` (per-model breakdown; the existing token columns hold totals
  for the primary model's row).
- `estimate_stats` / `match_runs`: also exclude `status = 'pending'`.
- Change `source` values to `mcp` | `report` | `submission` | `seed`.

## 9. Integration with everyone's agents

| Layer | What it is | Works with | Automatic? |
|---|---|---|---|
| **Local MCP server** (main) | `npx token-abacus mcp`: `estimate_task`, `submit_run`, exact tokens from logs | Claude Code, Codex (exact tokens) · Cursor and others (estimates; tokens pending) | Yes — server instructions tell the agent when to call |
| **`token-abacus init`** | Adds the server to every installed tool, asks for consent | Same | One command |
| **Report prompt** (second path) | Paste into any coding tool → runs `npx token-abacus report` → report + optional upload | Any tool with local logs | On demand |
| **Claude Code hook** (stretch) | Forces an estimate on the first prompt if the agent skips it | Claude Code | Yes |
| **OpenTelemetry** (later) | Native usage export from Claude Code / Codex | Claude Code, Codex | Yes |

Full build guide for the MCP server: **docs/MCP.md**.

## 10. Security & privacy

- Row-level security on; clients never touch tables. All reads/writes go through Edge Functions.
- Database functions are not callable by `anon` / `authenticated`.
- Only the task sentence, summary, model and token numbers leave the user's machine. Never code,
  file names, paths or log lines. Contributing is opt-in at `init`; estimates work without it.
- Rate limit per `install_id` and per IP.

**Secrets:** `SUPABASE_SERVICE_ROLE_KEY` (Edge Functions only, automatic) · `ANTHROPIC_API_KEY`
(Edge Function secret, for tagging). Clients need no keys.

**Budget:** Supabase Pro (~$25/mo) from the $100 credits, spend cap on. Haiku tagging costs a
fraction of a cent per task and only runs on submit, never on estimate.

## 11. Build order & owners

| # | Milestone | Owner | Must-have? |
|---|---|---|---|
| 1 | Schema migration 1 + `model_pricing` seeded | Shah | ✅ (schema done) |
| 2 | Seed data: parse our own Claude Code logs into tasks | Shah | ✅ |
| 3 | `estimate` function deployed, real numbers for a test prompt | Shah | ✅ |
| 4 | Local MCP server against a mock API (MCP.md milestones 1–4) | MCP teammate | ✅ |
| 5 | Migration 2 + `submit` function | Shah | ✅ |
| 6 | MCP server against the real API + `init` | MCP teammate | ✅ |
| 7 | Website: landing page, estimate box, live dashboard of recent tasks | Web | ✅ |
| 8 | Report script + report prompt + `report` function | Report / Web | stretch |
| 9 | Codex log reader, Claude Code hook | MCP teammate | stretch |

**Cut line:** ship 1–7. The report is the first stretch goal.

## 12. Open decisions

- **Similarity threshold:** 0.80 is a placeholder. `gte-small` scores run high; check same-task vs
  different-task pairs on the seed data before the demo.
- **Will agents call the tools reliably?** Test the server instructions on 10 real tasks in Claude
  Code and Codex. If they skip `estimate_task` often, add the Claude Code hook.
- **Cursor and other tools without readable logs:** their tasks stay `pending`. Is that acceptable
  for v1, or do we accept agent-estimated tokens at low trust?
- **Report data vs. MCP data:** report history has no clean task boundaries. Store it as sessions
  (low trust) or split it into tasks with an LLM?

## Glossary

- **Embedding / vector search** — turning text into numbers so "Caddy reverse proxy" and "Nginx
  reverse proxy" land close together; we look up the closest past tasks.
- **p50 / p85 / p95** — the token count that 50% / 85% / 95% of similar tasks stayed under.
- **Edge Function** — a small TypeScript server function hosted by Supabase.
- **MCP** — the standard way agents (Claude, Codex, Cursor, …) call external tools. A *local* MCP
  server runs on the user's machine, started by their coding tool.
