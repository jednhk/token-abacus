-- nearest_tasks also returns each task's most common primary model, for showing examples.

drop function if exists public.nearest_tasks(extensions.vector, int, text[], boolean);

create function public.nearest_tasks(
  query_embedding extensions.vector(384),
  match_count int default 40,
  sizes text[] default null,
  include_untagged boolean default false
) returns table (task text, similarity float, work_kind text, size text, stack text[], runs bigint,
                 median_cost float, top_model text)
language sql stable
set search_path = public, extensions
as $$
  with nearest as (
    select tv.task, 1 - (tv.embedding <=> query_embedding) as similarity
    from task_vectors tv
    order by tv.embedding <=> query_embedding
    limit greatest(match_count * 5, 200)
  ), tagged as (
    select n.task, n.similarity,
           mode() within group (order by r.work_kind) as work_kind,
           mode() within group (order by r.size) as size,
           (select r2.stack from runs r2 where r2.task = n.task
            order by cardinality(r2.stack) desc limit 1) as stack,
           count(*) filter (where r.status = 'recorded' and not r.flagged) as runs,
           percentile_cont(0.5) within group (order by r.cost_usd)
             filter (where r.status = 'recorded' and not r.flagged) as median_cost,
           mode() within group (order by r.primary_model) as top_model
    from nearest n join runs r on r.task = n.task
    group by n.task, n.similarity
  )
  select task, similarity, work_kind, size, stack, runs, median_cost, top_model
  from tagged
  where runs > 0
    and (sizes is null or size = any(sizes) or (include_untagged and size is null))
  order by similarity desc
  limit match_count;
$$;

revoke execute on function public.nearest_tasks(extensions.vector, int, text[], boolean) from public, anon, authenticated;
