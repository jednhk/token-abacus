-- Token-budget estimator — Supabase schema (run in SQL editor or as a migration)

create extension if not exists vector with schema extensions;

-- ── pricing: cost is computed by us, never trusted from the client ─────────────
create table public.model_pricing (
  model                text primary key,          -- e.g. 'claude-sonnet-5-5'
  provider             text not null,
  input_per_mtok       numeric not null,
  output_per_mtok      numeric not null,
  cache_read_per_mtok  numeric not null default 0,
  cache_write_per_mtok numeric not null default 0,
  updated_at           timestamptz not null default now()
);

-- ── runs: one row per completed task (v1: one row per harness session) ─────────
create table public.runs (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  description        text not null,               -- redacted summary, never raw prompts
  embedding          extensions.vector(384) not null,  -- gte-small (Supabase.ai, in-edge)
  task_type          text,                         -- LLM-extracted at ingest: 'website', 'api', 'data-pipeline', ...
  scope              text check (scope in ('S','M','L')),
  model              text not null,                -- primary model used
  harness            text,                         -- 'claude-code', 'cursor', 'codex', ...
  input_tokens       bigint not null default 0,
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  total_tokens       bigint generated always as
                       (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) stored,
  cost_usd           numeric not null,             -- computed at insert from model_pricing
  duration_s         integer,
  outcome            text not null default 'success'
                       check (outcome in ('success','partial','failed','abandoned')),
  source             text not null check (source in ('seed','report','submission')),
  trust_weight       real not null default 0.5,    -- report 1.0, seed 0.8, submission 0.3
  flagged            boolean not null default false, -- outlier vs. neighbors at insert time
  submitter_hash     text,                         -- sha256(user id), for leaderboard / dedupe
  created_at         timestamptz not null default now()
);

create index runs_embedding_hnsw on public.runs
  using hnsw (embedding extensions.vector_cosine_ops);
create index runs_model_idx on public.runs (model);

-- ── estimate: nearest neighbors -> per-model stats, in ONE round-trip ──────────
-- ORDER BY distance + LIMIT keeps the HNSW index in play; similarity/flag filters
-- are applied AFTER the kNN so they can't starve the index scan.
create or replace function public.estimate_stats(
  query_embedding extensions.vector(384),
  match_threshold float default 0.80,   -- tune on real data; gte-small scores run high
  match_count     int   default 50
) returns table (
  model          text,
  n              bigint,
  avg_similarity float,
  success_rate   float,
  p50_tokens     float,
  p85_tokens     float,
  p95_tokens     float,
  p50_cost       float,
  p85_cost       float
)
language sql stable
set search_path = public, extensions
as $$
  with neighbors as (
    select r.*, 1 - (r.embedding <=> query_embedding) as similarity
    from runs r
    order by r.embedding <=> query_embedding
    limit match_count
  ), kept as (
    select * from neighbors where similarity >= match_threshold and not flagged
  )
  select
    model,
    count(*),
    avg(similarity),
    avg((outcome = 'success')::int)::float,
    percentile_cont(0.50) within group (order by total_tokens) filter (where outcome = 'success'),
    percentile_cont(0.85) within group (order by total_tokens) filter (where outcome = 'success'),
    percentile_cont(0.95) within group (order by total_tokens) filter (where outcome = 'success'),
    percentile_cont(0.50) within group (order by cost_usd)     filter (where outcome = 'success'),
    percentile_cont(0.85) within group (order by cost_usd)     filter (where outcome = 'success')
  from kept
  group by model
  order by count(*) desc;
$$;

-- ── evidence: the similar tasks behind an estimate ("based on 14 tasks like…") ──
create or replace function public.match_runs(
  query_embedding extensions.vector(384),
  match_count int default 5
) returns table (title text, model text, total_tokens bigint, cost_usd numeric, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select title, model, total_tokens, cost_usd, 1 - (embedding <=> query_embedding)
  from runs
  where not flagged
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── security: no direct client access; Edge Functions use the service role ─────
alter table public.runs          enable row level security;
alter table public.model_pricing enable row level security;
create policy "pricing is public" on public.model_pricing for select using (true);

revoke execute on function public.estimate_stats(extensions.vector, float, int) from public, anon, authenticated;
revoke execute on function public.match_runs(extensions.vector, int)            from public, anon, authenticated;
