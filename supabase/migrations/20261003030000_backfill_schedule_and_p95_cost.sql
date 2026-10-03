-- 1. Embed imported tasks automatically: pg_cron fires the embed-backfill Edge Function three
--    times in parallel every 10 seconds (each call embeds up to 8 rows → ~140 rows/minute).
-- 2. estimate_stats also returns p95_cost, so the estimate's ceiling is priced from real data.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'embed-backfill';

select cron.schedule(
  'embed-backfill',
  '10 seconds',
  $$
  select net.http_post(
           url := 'https://fgkiecqobecqwwqixrem.supabase.co/functions/v1/embed-backfill',
           headers := '{"content-type": "application/json"}'::jsonb,
           body := '{}'::jsonb,
           timeout_milliseconds := 15000)
  from generate_series(1, 3)
  where exists (select 1 from public.runs where embedding is null);
  $$
);

drop function if exists public.estimate_stats(extensions.vector, float, int);

create function public.estimate_stats(
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
    percentile_cont(0.85) within group (order by cost_usd)     filter (where outcome not in ('failed','abandoned')),
    percentile_cont(0.95) within group (order by cost_usd)     filter (where outcome not in ('failed','abandoned'))
  from kept
  group by primary_model
  order by count(*) desc;
$$;

revoke execute on function public.estimate_stats(extensions.vector, float, int) from public, anon, authenticated;
