-- Vector search over DISTINCT tasks.
--
-- Imports repeat each task across ~20 models with an identical embedding. HNSW degrades badly on
-- exact duplicates: neighbor lists fill with copies and parts of the graph become unreachable.
-- Measured: searching with a stored task's own embedding did not return that task at all, while
-- an exact scan returned it at similarity 1.0.
--
-- Fix: one row per distinct task text in task_vectors (kept in sync by a trigger on runs), HNSW
-- on that table only, and the search functions join back to runs. "N nearest neighbors" now
-- means N distinct tasks, which is also what the estimate needs.

create table public.task_vectors (
  task       text primary key,
  embedding  extensions.vector(384) not null,
  created_at timestamptz not null default now()
);

insert into public.task_vectors (task, embedding)
select distinct on (task) task, embedding
from public.runs
where embedding is not null
order by task, created_at;

create index task_vectors_embedding_hnsw on public.task_vectors
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.task_vectors enable row level security;   -- no policies: functions only

drop index if exists public.runs_embedding_hnsw;

create or replace function public.sync_task_vector()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.embedding is not null then
    insert into task_vectors (task, embedding) values (new.task, new.embedding)
    on conflict (task) do update set embedding = excluded.embedding;
  end if;
  return new;
end;
$$;

create trigger runs_sync_task_vector
  after insert or update of embedding, task on public.runs
  for each row execute function public.sync_task_vector();

-- match_count = number of distinct tasks to consider.
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
  p85_cost       float,
  p95_cost       float
)
language plpgsql volatile
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.ef_search', greatest(match_count, 40)::text, true);
  return query
  with nearest as (
    select tv.task, 1 - (tv.embedding <=> query_embedding) as similarity
    from task_vectors tv
    order by tv.embedding <=> query_embedding
    limit match_count
  ), kept as (
    select r.*, nearest.similarity
    from nearest join runs r on r.task = nearest.task
    where nearest.similarity >= match_threshold
      and r.status = 'recorded' and not r.flagged and r.primary_model is not null
  )
  select
    kept.primary_model,
    count(*),
    avg(kept.similarity)::float,
    ((count(*) filter (where kept.outcome = 'success'))::float
      / nullif(count(*) filter (where kept.outcome <> 'unknown'), 0))::float,
    percentile_cont(0.50) within group (order by kept.total_tokens) filter (where kept.outcome not in ('failed','abandoned')),
    percentile_cont(0.85) within group (order by kept.total_tokens) filter (where kept.outcome not in ('failed','abandoned')),
    percentile_cont(0.95) within group (order by kept.total_tokens) filter (where kept.outcome not in ('failed','abandoned')),
    percentile_cont(0.50) within group (order by kept.cost_usd)     filter (where kept.outcome not in ('failed','abandoned')),
    percentile_cont(0.85) within group (order by kept.cost_usd)     filter (where kept.outcome not in ('failed','abandoned')),
    percentile_cont(0.95) within group (order by kept.cost_usd)     filter (where kept.outcome not in ('failed','abandoned'))
  from kept
  group by kept.primary_model
  order by count(*) desc;
end;
$$;

-- match_count = number of distinct tasks; returns every recorded run of those tasks, nearest first.
create or replace function public.match_runs(
  query_embedding extensions.vector(384),
  match_count int default 5
) returns table (task text, primary_model text, total_tokens bigint, cost_usd numeric, similarity float, models jsonb)
language plpgsql volatile
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.ef_search', greatest(match_count, 40)::text, true);
  return query
  with nearest as (
    select tv.task, 1 - (tv.embedding <=> query_embedding) as similarity
    from task_vectors tv
    order by tv.embedding <=> query_embedding
    limit match_count
  )
  select r.task, r.primary_model, r.total_tokens, r.cost_usd, nearest.similarity::float,
         (select jsonb_agg(jsonb_build_object('model', m.model, 'total_tokens', m.total_tokens, 'cost_usd', m.cost_usd)
                           order by m.output_tokens desc)
          from run_models m where m.run_id = r.run_id)
  from nearest join runs r on r.task = nearest.task
  where r.status = 'recorded' and not r.flagged
  order by nearest.similarity desc, r.cost_usd nulls last;
end;
$$;

revoke execute on function public.estimate_stats(extensions.vector, float, int) from public, anon, authenticated;
revoke execute on function public.match_runs(extensions.vector, int)            from public, anon, authenticated;
revoke execute on function public.sync_task_vector()                            from public, anon, authenticated;
