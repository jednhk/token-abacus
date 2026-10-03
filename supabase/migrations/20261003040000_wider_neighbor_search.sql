-- The estimate looks at the nearest tasks, but imports repeat each task across ~20 models, so 50
-- neighbors covered only 2–3 distinct tasks. Callers now ask for a few hundred neighbors. An HNSW
-- index scan returns at most hnsw.ef_search rows (default 40), so both search functions raise it
-- for their own transaction. (Supabase doesn't allow attaching it with ALTER FUNCTION ... SET, so
-- they become plpgsql and set it at run time.)

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
  select r.task, r.primary_model, r.total_tokens, r.cost_usd, (1 - (r.embedding <=> query_embedding))::float,
         (select jsonb_agg(jsonb_build_object('model', m.model, 'total_tokens', m.total_tokens, 'cost_usd', m.cost_usd)
                           order by m.output_tokens desc)
          from run_models m where m.run_id = r.run_id)
  from runs r
  where r.embedding is not null and r.status = 'recorded' and not r.flagged
  order by r.embedding <=> query_embedding
  limit match_count;
end;
$$;

revoke execute on function public.estimate_stats(extensions.vector, float, int) from public, anon, authenticated;
revoke execute on function public.match_runs(extensions.vector, int)            from public, anon, authenticated;
