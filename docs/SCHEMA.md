# Database schema

Supabase project `token-abacus` (ref `fgkiecqobecqwwqixrem`, us-west-2). Postgres 17 + pgvector.
Source of truth: `supabase/migrations/`. This doc describes migration 2 (`20261003010000_multi_model_runs.sql`).

```
runs (one row per task)  1 ──── n  run_models (one row per model used in that task)
                                         │ model
model_pricing (one row per model) ───────┘ prices each run_models row at write time
```

**One task can use several models** (e.g. Opus plans, Haiku runs subagents). Each model's tokens and
cost go in `run_models`; `runs` holds the totals across all models plus the `primary_model`.

## Writing data: always call `record_run`

Don't insert into the tables directly. `record_run(payload jsonb)` is the single write path. It:
- upserts the task by `run_id` (sending the same `run_id` again updates it — safe to re-run imports),
- replaces the task's model rows, merging duplicate models and stripping date suffixes
  (`claude-haiku-4-5-20251001` → `claude-haiku-4-5`),
- prices every model from `model_pricing` and computes totals, `primary_model` (most output tokens)
  and `status`.

**You never send:** totals, costs, `primary_model`, `status`, `model_count`, `duration_s` — all computed.

### Payload

```json
{
  "run_id": "6f1c2a9e-3c55-4c43-9a4e-0d7f3f1b2a10",
  "task": "Set up Caddy reverse proxy with TLS for a Next.js app",
  "summary": "Configured Caddy reverse proxy with automatic TLS",
  "harness": "claude-code",
  "client_version": "2.1.0",
  "outcome": "success",
  "token_source": "transcript",
  "source": "report",
  "started_at": "2026-10-04T10:00:00Z",
  "ended_at": "2026-10-04T10:12:30Z",
  "models": [
    { "model": "claude-opus-5-5",  "input_tokens": 1200, "output_tokens": 9000,
      "cache_read_tokens": 150000, "cache_write_tokens": 11000 },
    { "model": "claude-haiku-4-5", "input_tokens": 300,  "output_tokens": 2500,
      "cache_read_tokens": 40000,  "cache_write_tokens": 2000 }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `run_id` | recommended | UUID. **For imports, derive it from the source** (e.g. UUIDv5 of `harness + session id`) so re-running the script updates rows instead of duplicating them. Generated if missing. |
| `task` | ✅ | One sentence: what was asked. Already redacted — no keys, emails, paths, names. |
| `summary` | | One sentence: what was done. |
| `harness` | | `claude-code`, `codex`, `cursor`, … |
| `outcome` | | `success` · `partial` · `failed` · `abandoned` · `unknown` (default) |
| `token_source` | | `transcript` (read from logs) · `report` · `manual` · `none` (default). `none` or no models → task is `pending` and not used in estimates. |
| `source` | | `mcp` (default) · `report` · `submission` · `seed` — sets the default `trust_weight` (1.0 / 0.8 / 0.3 / 0.8) |
| `started_at`, `ended_at` | | ISO 8601 timestamps |
| `task_type`, `scope` | | Optional tags; `scope` is `S` · `M` · `L` |
| `install_hash` | | sha256 of the client's install id — never the raw id |
| `models` | ✅ for `recorded` | Array of `{ model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cache_write_1h_tokens?, requests? }`. Missing numbers count as 0. `cache_write_1h_tokens` = the part of `cache_write_tokens` written with a 1-hour lifetime (billed at 2× input on Claude vs 1.25× for 5-minute; Claude Code uses 1-hour). `requests` = per-request `[input, output, cache_read, cache_write, cache_write_1h]`; when sent, each request is priced at its own long-context tier, so the cost is exact. |
| `embedding` | **don't send** | The backend computes it (gte-small, 384 dims): `submit` embeds immediately; rows written by `record_run` are embedded by a background job within about a minute. |

Returns `{ "run_id": "…", "status": "recorded" | "pending", "cost_usd": 0.42 | null, "models": 2 }`.
`cost_usd` is null when any model isn't in `model_pricing` yet.

### How to call it

`record_run` needs the project's **secret key** (`service_role`). Use it **only in scripts and
servers — never in website code**. Get it from Dashboard → Project Settings → API Keys; ask Shah
for access. Project URL: `https://fgkiecqobecqwwqixrem.supabase.co`.

TypeScript (`@supabase/supabase-js`):
```ts
import { createClient } from "@supabase/supabase-js";
const supabase = createClient("https://fgkiecqobecqwwqixrem.supabase.co", process.env.SUPABASE_SECRET_KEY!);
const { data, error } = await supabase.rpc("record_run", { payload });
```

Python (`supabase`):
```python
from supabase import create_client
supabase = create_client("https://fgkiecqobecqwwqixrem.supabase.co", os.environ["SUPABASE_SECRET_KEY"])
result = supabase.rpc("record_run", {"payload": payload}).execute()
```

Plain HTTP:
```
POST https://fgkiecqobecqwwqixrem.supabase.co/rest/v1/rpc/record_run
apikey: <secret key>
Authorization: Bearer <secret key>
Content-Type: application/json

{ "payload": { …as above… } }
```

## Reading data from the website

The website uses the **publishable (anon) key** and can only call `recent_runs` — the tables
themselves are locked by row-level security.

```ts
const supabase = createClient(URL, PUBLISHABLE_KEY);
const { data } = await supabase.rpc("recent_runs", { max_rows: 50 });
// [{ task, summary, harness, primary_model, models: [{ model, total_tokens, cost_usd }],
//    total_tokens, cost_usd, outcome, duration_s, created_at }, …]
```
Only recorded, non-flagged tasks are returned, newest first, max 200. This function is public on
purpose (Supabase's advisor flags it as a warning); it never returns install hashes or embeddings.

Estimates come from the `estimate` Edge Function (see FRONTEND.md §8), not from direct database calls.

---

## Tables

### `runs` — one row per task

| Column | Type | Notes |
|---|---|---|
| `run_id` | uuid PK | Client-generated idempotency key |
| `task` | text, not null | One sentence: what was asked |
| `summary` | text | One sentence: what was done |
| `embedding` | vector(384) | gte-small; set by the backend, null until then |
| `task_type` | text | Tag, e.g. `website`, `api`, `infra`, `bugfix` |
| `scope` | text | `S` · `M` · `L` |
| `harness` | text | `claude-code`, `codex`, `cursor`, … |
| `client_version` | text | |
| `primary_model` | text | **Computed:** model with the most output tokens |
| `model_count` | smallint | **Computed:** number of models used |
| `input_tokens` | bigint | **Computed:** sum over models |
| `output_tokens` | bigint | **Computed:** sum over models |
| `cache_read_tokens` | bigint | **Computed:** sum over models |
| `cache_write_tokens` | bigint | **Computed:** sum over models |
| `total_tokens` | bigint | **Generated:** sum of the four token columns |
| `cost_usd` | numeric | **Computed:** sum of model costs; null if any model is unpriced |
| `outcome` | text | `success` · `partial` · `failed` · `abandoned` · `unknown` |
| `status` | text | **Computed:** `recorded` (has token counts) · `pending` |
| `token_source` | text | `transcript` · `report` · `manual` · `none` |
| `source` | text | `mcp` · `report` · `submission` · `seed` |
| `trust_weight` | real | 1.0 mcp · 0.8 report/seed · 0.3 submission |
| `flagged` | boolean | Outlier; excluded from estimates |
| `install_hash` | text | sha256 of install id |
| `started_at`, `ended_at` | timestamptz | |
| `duration_s` | integer | **Generated:** `ended_at − started_at` |
| `created_at`, `updated_at` | timestamptz | |

Indexes: `primary_model`, `created_at desc`, and a partial index on rows still missing an embedding.

### `task_vectors` — one embedding per distinct task text (search index)

| Column | Type | Notes |
|---|---|---|
| `task` | text PK | Same text as `runs.task` |
| `embedding` | vector(384) | Copied from `runs.embedding` by a trigger; never write it directly |

Similarity search runs here, as an exact scan (a few ms at this size), then joins back to `runs`.
Imports repeat each task across many models with identical embeddings, which broke the HNSW
index on `runs`; an approximate index is worth revisiting only past ~100k distinct tasks.

### `run_models` — one row per model per task

| Column | Type | Notes |
|---|---|---|
| `run_id` | uuid | FK → `runs.run_id`, cascade delete |
| `model` | text | Normalized name (date suffix stripped) |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_write_tokens` | bigint ≥ 0 | |
| `total_tokens` | bigint | **Generated** |
| `cost_usd` | numeric | Priced at write time from `model_pricing`; null if unpriced |
| `cache_write_1h_tokens` | bigint | Part of `cache_write_tokens` with a 1-hour lifetime |
| `priced_per_request` | boolean | Cost computed request by request (exact long-context tiers) |

Primary key: `(run_id, model)`.

### `model_pricing` — USD per million tokens

| Column | Type |
|---|---|
| `model` | text PK — same normalized names as `run_models.model` |
| `provider` | text |
| `input_per_mtok`, `output_per_mtok`, `cache_read_per_mtok`, `cache_write_per_mtok` | numeric (cache write = 5-minute) |
| `cache_write_1h_per_mtok` | numeric; null → the 5-minute price is used |
| `tiers` | jsonb: long-context prices `[{ min_prompt_tokens, input_per_mtok, … }]`, applied per request |
| `source`, `source_id` | `openrouter` + catalog id, or `manual` |
| `locked` | true = the hourly sync never overwrites this row (manual overrides) |
| `checked_at`, `updated_at` | last seen by the sync / last price change |

Readable by anyone. **Refreshed hourly** from OpenRouter's public catalog by the `sync-pricing` Edge Function (pg_cron, minute 7); its Claude prices match Anthropic's list prices. Every price change is kept in `model_price_history` (`model`, the prices, `valid_from`), so any past cost can be traced to the prices in force. A model missing here gives a null cost. `reprice_runs()` recomputes stored costs from current prices — for corrections only.
Costs are fixed at write time, so a price change doesn't rewrite history.

## Functions

| Function | Who can call | Purpose |
|---|---|---|
| `record_run(payload)` | secret key only | The write path (above) |
| `recent_runs(max_rows)` | anyone | Public feed for the website |
| `estimate_stats(embedding, threshold, count)` | secret key only | Nearest tasks → per-primary-model percentiles. Used by the `estimate` Edge Function |
| `match_runs(embedding, count)` | secret key only | The similar tasks behind an estimate, with their model mix |

Estimates group tasks by `primary_model` and compute percentiles over the **whole task's** tokens
and cost (all models). Failed and abandoned tasks count toward the success rate but not the budget.
