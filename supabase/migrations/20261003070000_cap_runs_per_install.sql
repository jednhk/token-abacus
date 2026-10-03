-- One install can't dominate an estimate: among the similar tasks behind an estimate, each install
-- counts at most 3 runs per model (its closest matches, newest first on ties). Rows without an
-- install_hash (imports, seeds) are each their own group, so they're unaffected. Nothing is
-- deleted; this only changes which rows the percentiles see.

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
  return query
  with nearest as (
    select tv.task, 1 - (tv.embedding <=> query_embedding) as similarity
    from task_vectors tv
    order by tv.embedding <=> query_embedding
    limit match_count
  ), similar_runs as (
    select r.*, nearest.similarity,
           row_number() over (
             partition by coalesce(r.install_hash, r.run_id::text), r.primary_model
             order by nearest.similarity desc, r.created_at desc) as per_install
    from nearest join runs r on r.task = nearest.task
    where nearest.similarity >= match_threshold
      and r.status = 'recorded' and not r.flagged and r.primary_model is not null
  ), kept as (
    select * from similar_runs where per_install <= 3
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

revoke execute on function public.estimate_stats(extensions.vector, float, int) from public, anon, authenticated;
