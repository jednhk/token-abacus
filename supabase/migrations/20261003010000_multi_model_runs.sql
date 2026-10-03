-- Migration 2: one task can use several models.
--   runs        one row per task, totals across all models
--   run_models  one row per (task, model) with that model's tokens and cost
--   record_run  the single write path (scripts, the submit function, the report importer)
-- runs was empty when this was written; refuse to run against real data.

do $$
begin
  if exists (select 1 from public.runs) then
    raise exception 'runs is not empty: migrate the data instead of recreating the table';
  end if;
end $$;

drop function if exists public.estimate_stats(extensions.vector, float, int);
drop function if exists public.match_runs(extensions.vector, int);
drop table public.runs;

-- ── runs ───────────────────────────────────────────────────────────────────────
create table public.runs (
  run_id             uuid primary key default gen_random_uuid(),  -- client-generated; re-sending the same id updates the row
  task               text not null,                -- one sentence: what was asked ("Set up Caddy reverse proxy with TLS")
  summary            text,                         -- one sentence: what was actually done
  embedding          extensions.vector(384),       -- gte-small; filled in by the backend, null until then
  task_type          text,                         -- e.g. 'website', 'api', 'infra', 'bugfix' (tagged server-side)
  scope              text check (scope in ('S','M','L')),
  harness            text,                         -- 'claude-code', 'codex', 'cursor', ...
  client_version     text,
  primary_model      text,                         -- model with the most output tokens (from run_models)
  model_count        smallint not null default 0,
  input_tokens       bigint not null default 0,    -- totals across all models
  output_tokens      bigint not null default 0,
  cache_read_tokens  bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  total_tokens       bigint generated always as
                       (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) stored,
  cost_usd           numeric,                      -- sum over models; null if any model has no price yet
  outcome            text not null default 'unknown'
                       check (outcome in ('success','partial','failed','abandoned','unknown')),
  status             text not null default 'pending'
                       check (status in ('recorded','pending')),  -- pending = no token counts yet
  token_source       text not null default 'none'
                       check (token_source in ('transcript','report','manual','none')),
  source             text not null default 'mcp'
                       check (source in ('mcp','report','submission','seed')),
  trust_weight       real not null default 1.0,
  flagged            boolean not null default false,  -- outlier vs. similar tasks; excluded from estimates
  install_hash       text,                         -- sha256 of the client install id; never the raw id
  started_at         timestamptz,
  ended_at           timestamptz,
  duration_s         integer generated always as
                       (extract(epoch from (ended_at - started_at))::integer) stored,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index runs_embedding_hnsw on public.runs using hnsw (embedding extensions.vector_cosine_ops);
create index runs_primary_model_idx on public.runs (primary_model);
create index runs_created_at_idx on public.runs (created_at desc);
create index runs_unembedded_idx on public.runs (created_at) where embedding is null;

-- ── run_models ─────────────────────────────────────────────────────────────────
create table public.run_models (
  run_id             uuid not null references public.runs (run_id) on delete cascade,
  model              text not null,                -- normalized: date suffix stripped
  input_tokens       bigint not null default 0 check (input_tokens >= 0),
  output_tokens      bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens  bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  total_tokens       bigint generated always as
                       (input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) stored,
  cost_usd           numeric,                      -- from model_pricing at write time; null if unpriced
  primary key (run_id, model)
);

create index run_models_model_idx on public.run_models (model);

-- ── record_run: the only write path ────────────────────────────────────────────
-- payload: { run_id?, task, summary?, harness?, client_version?, outcome?, token_source?, source?,
--            trust_weight?, install_hash?, task_type?, scope?, started_at?, ended_at?, embedding?,
--            models: [{ model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens }] }
-- Upserts by run_id, replaces the model rows, prices each model, recomputes totals.
create or replace function public.record_run(payload jsonb)
returns jsonb
language plpgsql
set search_path = public, extensions
as $$
declare
  v_run_id  uuid := coalesce((payload->>'run_id')::uuid, gen_random_uuid());
  v_models  jsonb := coalesce(payload->'models', '[]'::jsonb);
  v_source  text := coalesce(payload->>'source', 'mcp');
  v_count   int;
  v_cost    numeric;
  v_status  text;
begin
  if coalesce(btrim(payload->>'task'), '') = '' then
    raise exception 'record_run: "task" is required';
  end if;
  if jsonb_typeof(v_models) <> 'array' then
    raise exception 'record_run: "models" must be an array';
  end if;

  insert into runs as r (
    run_id, task, summary, task_type, scope, harness, client_version, outcome, token_source,
    source, trust_weight, install_hash, started_at, ended_at, embedding)
  values (
    v_run_id, btrim(payload->>'task'), payload->>'summary', payload->>'task_type', payload->>'scope',
    payload->>'harness', payload->>'client_version', coalesce(payload->>'outcome', 'unknown'),
    coalesce(payload->>'token_source', 'none'), v_source,
    coalesce((payload->>'trust_weight')::real,
             case v_source when 'mcp' then 1.0 when 'report' then 0.8 when 'seed' then 0.8 else 0.3 end),
    payload->>'install_hash', (payload->>'started_at')::timestamptz, (payload->>'ended_at')::timestamptz,
    (payload->>'embedding')::extensions.vector(384))
  on conflict (run_id) do update set
    task = excluded.task, summary = excluded.summary, task_type = excluded.task_type,
    scope = excluded.scope, harness = excluded.harness, client_version = excluded.client_version,
    outcome = excluded.outcome, token_source = excluded.token_source, source = excluded.source,
    trust_weight = excluded.trust_weight, install_hash = excluded.install_hash,
    started_at = excluded.started_at, ended_at = excluded.ended_at,
    -- keep the stored embedding unless a new one is sent or the task text changed
    embedding = case when excluded.embedding is not null then excluded.embedding
                     when r.task is distinct from excluded.task then null
                     else r.embedding end,
    updated_at = now();

  delete from run_models where run_id = v_run_id;
  insert into run_models (run_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
  select v_run_id, m.model, m.input_tokens, m.output_tokens, m.cache_read_tokens, m.cache_write_tokens,
         (m.input_tokens * p.input_per_mtok + m.output_tokens * p.output_per_mtok
          + m.cache_read_tokens * p.cache_read_per_mtok + m.cache_write_tokens * p.cache_write_per_mtok) / 1e6
  from (
    select regexp_replace(btrim(x.model), '-\d{8}$', '') as model,     -- claude-haiku-4-5-20251001 → claude-haiku-4-5
           sum(coalesce(x.input_tokens, 0))       as input_tokens,
           sum(coalesce(x.output_tokens, 0))      as output_tokens,
           sum(coalesce(x.cache_read_tokens, 0))  as cache_read_tokens,
           sum(coalesce(x.cache_write_tokens, 0)) as cache_write_tokens
    from jsonb_to_recordset(v_models)
         as x(model text, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint, cache_write_tokens bigint)
    where coalesce(btrim(x.model), '') <> ''
    group by 1
  ) m
  left join model_pricing p on p.model = m.model;

  select count(*),
         case when count(*) > 0 and count(*) = count(cost_usd) then sum(cost_usd) end
    into v_count, v_cost
  from run_models where run_id = v_run_id;

  v_status := case when v_count = 0 or coalesce(payload->>'token_source', 'none') = 'none'
                   then 'pending' else 'recorded' end;

  update runs set
    model_count        = v_count,
    primary_model      = (select model from run_models where run_id = v_run_id
                          order by output_tokens desc, total_tokens desc limit 1),
    input_tokens       = (select coalesce(sum(input_tokens), 0) from run_models where run_id = v_run_id),
    output_tokens      = (select coalesce(sum(output_tokens), 0) from run_models where run_id = v_run_id),
    cache_read_tokens  = (select coalesce(sum(cache_read_tokens), 0) from run_models where run_id = v_run_id),
    cache_write_tokens = (select coalesce(sum(cache_write_tokens), 0) from run_models where run_id = v_run_id),
    cost_usd           = v_cost,
    status             = v_status
  where run_id = v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'status', v_status, 'cost_usd', v_cost, 'models', v_count);
end;
$$;

-- ── estimate: nearest tasks → stats grouped by primary model ───────────────────
-- Token/cost percentiles cover the WHOLE task (all models), grouped by the task's primary model.
-- Failed and abandoned tasks count toward success_rate but not toward the budget percentiles.
create or replace function public.estimate_stats(
  query_embedding extensions.vector(384),
  match_threshold float default 0.80,
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
    where r.embedding is not null
    order by r.embedding <=> query_embedding
    limit match_count
  ), kept as (
    select * from neighbors
    where similarity >= match_threshold and status = 'recorded' and not flagged and primary_model is not null
  )
  select
    primary_model,
    count(*),
    avg(similarity),
    (count(*) filter (where outcome = 'success'))::float
      / nullif(count(*) filter (where outcome <> 'unknown'), 0),
    percentile_cont(0.50) within group (order by total_tokens) filter (where outcome not in ('failed','abandoned')),
    percentile_cont(0.85) within group (order by total_tokens) filter (where outcome not in ('failed','abandoned')),
    percentile_cont(0.95) within group (order by total_tokens) filter (where outcome not in ('failed','abandoned')),
    percentile_cont(0.50) within group (order by cost_usd)     filter (where outcome not in ('failed','abandoned')),
    percentile_cont(0.85) within group (order by cost_usd)     filter (where outcome not in ('failed','abandoned'))
  from kept
  group by primary_model
  order by count(*) desc;
$$;

-- ── evidence: the similar tasks behind an estimate, with their model mix ───────
create or replace function public.match_runs(
  query_embedding extensions.vector(384),
  match_count int default 5
) returns table (task text, primary_model text, total_tokens bigint, cost_usd numeric, similarity float, models jsonb)
language sql stable
set search_path = public, extensions
as $$
  select r.task, r.primary_model, r.total_tokens, r.cost_usd, 1 - (r.embedding <=> query_embedding),
         (select jsonb_agg(jsonb_build_object('model', m.model, 'total_tokens', m.total_tokens, 'cost_usd', m.cost_usd)
                           order by m.output_tokens desc)
          from run_models m where m.run_id = r.run_id)
  from runs r
  where r.embedding is not null and r.status = 'recorded' and not r.flagged
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- ── public feed for the website: safe columns only ─────────────────────────────
create or replace function public.recent_runs(max_rows int default 50)
returns table (task text, summary text, harness text, primary_model text, models jsonb,
               total_tokens bigint, cost_usd numeric, outcome text, duration_s integer, created_at timestamptz)
language sql stable security definer
set search_path = public
as $$
  select r.task, r.summary, r.harness, r.primary_model,
         (select jsonb_agg(jsonb_build_object('model', m.model, 'total_tokens', m.total_tokens, 'cost_usd', m.cost_usd)
                           order by m.output_tokens desc)
          from run_models m where m.run_id = r.run_id),
         r.total_tokens, r.cost_usd, r.outcome, r.duration_s, r.created_at
  from runs r
  where r.status = 'recorded' and not r.flagged
  order by r.created_at desc
  limit least(greatest(max_rows, 1), 200);
$$;

-- ── security ───────────────────────────────────────────────────────────────────
alter table public.runs       enable row level security;
alter table public.run_models enable row level security;

revoke execute on function public.record_run(jsonb)                              from public, anon, authenticated;
revoke execute on function public.estimate_stats(extensions.vector, float, int)  from public, anon, authenticated;
revoke execute on function public.match_runs(extensions.vector, int)             from public, anon, authenticated;
revoke execute on function public.recent_runs(int)                               from public;
grant  execute on function public.recent_runs(int)                               to anon, authenticated;
