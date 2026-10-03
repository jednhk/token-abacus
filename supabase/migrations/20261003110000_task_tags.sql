-- Accurate matching: compare tasks by what they ARE, not just what they're about.
--
-- Vector similarity matched "small Node/Express blood-donor chat app" to "blood-donor chat on AWS
-- WebSocket + 7 Lambdas + Terraform + React Native" at 0.913 — same topic, ~50× the work. Every
-- task now carries structured tags:
--   work_kind  new_app | feature | bugfix | refactor | infra | docs | data | test | research | other
--   size       small | medium | large   (one shared definition, see _shared/tags.ts)
--   stack      lowercase technologies, e.g. {node,express,socket.io,sqlite}
-- set by the agent (MCP: tagged_by 'agent') or by Claude in the tag-tasks job (tagged_by 'llm').
-- The estimate filters candidates by size, then Claude reranks them for real comparability.
-- The team's existing task_type / scope columns are left untouched.

alter table public.runs
  add column work_kind text check (work_kind in
    ('new_app','feature','bugfix','refactor','infra','docs','data','test','research','other')),
  add column size text check (size in ('small','medium','large')),
  add column stack text[] not null default '{}',
  add column tagged_by text check (tagged_by in ('agent','llm'));

create index runs_task_untagged_idx on public.runs (task) where tagged_by is null;
create index runs_task_idx on public.runs (task);

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
  v_kind    text := case when payload->>'work_kind' in
                ('new_app','feature','bugfix','refactor','infra','docs','data','test','research','other')
                then payload->>'work_kind' end;
  v_size    text := case when payload->>'size' in ('small','medium','large') then payload->>'size' end;
  v_stack   text[] := coalesce(
                (select array_agg(distinct lower(btrim(s))) from jsonb_array_elements_text(
                   case when jsonb_typeof(payload->'stack') = 'array' then payload->'stack' else '[]'::jsonb end) s
                 where btrim(s) <> ''), '{}');
begin
  if coalesce(btrim(payload->>'task'), '') = '' then
    raise exception 'record_run: "task" is required';
  end if;
  if jsonb_typeof(v_models) <> 'array' then
    raise exception 'record_run: "models" must be an array';
  end if;

  insert into runs as r (
    run_id, task, summary, task_type, scope, harness, client_version, outcome, token_source,
    source, trust_weight, install_hash, started_at, ended_at, embedding,
    work_kind, size, stack, tagged_by)
  values (
    v_run_id, btrim(payload->>'task'), payload->>'summary', payload->>'task_type', payload->>'scope',
    payload->>'harness', payload->>'client_version', coalesce(payload->>'outcome', 'unknown'),
    coalesce(payload->>'token_source', 'none'), v_source,
    coalesce((payload->>'trust_weight')::real,
             case v_source when 'mcp' then 1.0 when 'report' then 0.8 when 'seed' then 0.8 else 0.3 end),
    payload->>'install_hash', (payload->>'started_at')::timestamptz, (payload->>'ended_at')::timestamptz,
    (payload->>'embedding')::extensions.vector(384),
    v_kind, v_size, v_stack, case when v_size is not null or v_kind is not null then coalesce(payload->>'tagged_by', 'agent') end)
  on conflict (run_id) do update set
    task = excluded.task, summary = excluded.summary, task_type = excluded.task_type,
    scope = excluded.scope, harness = excluded.harness, client_version = excluded.client_version,
    outcome = excluded.outcome, token_source = excluded.token_source, source = excluded.source,
    trust_weight = excluded.trust_weight, install_hash = excluded.install_hash,
    started_at = excluded.started_at, ended_at = excluded.ended_at,
    -- tags: keep existing ones unless new ones are sent
    work_kind = coalesce(excluded.work_kind, r.work_kind),
    size = coalesce(excluded.size, r.size),
    stack = case when cardinality(excluded.stack) > 0 then excluded.stack else r.stack end,
    tagged_by = coalesce(excluded.tagged_by, r.tagged_by),
    embedding = case when excluded.embedding is not null then excluded.embedding
                     when r.task is distinct from excluded.task then null
                     else r.embedding end,
    updated_at = now();

  delete from run_models where run_id = v_run_id;

  with entries as (
    select regexp_replace(btrim(x.model), '-\d{8}$', '') as model,
           x.input_tokens, x.output_tokens, x.cache_read_tokens, x.cache_write_tokens,
           x.cache_write_1h_tokens, x.requests
    from jsonb_to_recordset(v_models) as x(
      model text, input_tokens bigint, output_tokens bigint, cache_read_tokens bigint,
      cache_write_tokens bigint, cache_write_1h_tokens bigint, requests jsonb)
    where coalesce(btrim(x.model), '') <> ''
  ), lines as (
    -- one line per request when the client sent them …
    select e.model,
           coalesce((q->>0)::bigint, 0) as i, coalesce((q->>1)::bigint, 0) as o,
           coalesce((q->>2)::bigint, 0) as cr, coalesce((q->>3)::bigint, 0) as cw,
           coalesce((q->>4)::bigint, 0) as cw1h, coalesce((q->>5)::int, 0) = 1 as fast,
           true as per_request
    from entries e, jsonb_array_elements(e.requests) q
    where jsonb_typeof(e.requests) = 'array' and jsonb_array_length(e.requests) > 0
    union all
    -- … otherwise one line with the totals (standard speed)
    select e.model,
           coalesce(e.input_tokens, 0), coalesce(e.output_tokens, 0), coalesce(e.cache_read_tokens, 0),
           coalesce(e.cache_write_tokens, 0), coalesce(e.cache_write_1h_tokens, 0), false, false
    from entries e
    where e.requests is null or jsonb_typeof(e.requests) <> 'array' or jsonb_array_length(e.requests) = 0
  ), priced as (
    select l.model, l.i, l.o, l.cr, l.cw, least(l.cw1h, l.cw) as cw1h, l.fast, l.per_request,
           price_usage(p, case when l.per_request then l.i + l.cr + l.cw else 0 end,
                       l.i, l.o, l.cr, l.cw, least(l.cw1h, l.cw),
                       case when l.fast then coalesce(p.fast_multiplier, 2) else 1 end) as price
    from lines l left join model_pricing p on p.model = l.model
  )
  insert into run_models
    (run_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
     cache_write_1h_tokens, cost_usd, priced_per_request, fast_requests)
  select v_run_id, model, sum(i), sum(o), sum(cr), sum(cw), sum(cw1h),
         case when count(*) = count(price) then sum(price) end,
         bool_or(per_request), count(*) filter (where fast)
  from priced
  group by model;

  select count(*),
         case when count(*) > 0 and count(*) = count(cost_usd) then sum(cost_usd) end
    into v_count, v_cost
  from run_models where run_id = v_run_id;

  v_status := case when v_count = 0 or coalesce(payload->>'token_source', 'none') = 'none'
                   then 'pending' else 'recorded' end;

  update runs set
    model_count           = v_count,
    primary_model         = (select model from run_models where run_id = v_run_id
                             order by output_tokens desc, total_tokens desc limit 1),
    input_tokens          = (select coalesce(sum(input_tokens), 0) from run_models where run_id = v_run_id),
    output_tokens         = (select coalesce(sum(output_tokens), 0) from run_models where run_id = v_run_id),
    cache_read_tokens     = (select coalesce(sum(cache_read_tokens), 0) from run_models where run_id = v_run_id),
    cache_write_tokens    = (select coalesce(sum(cache_write_tokens), 0) from run_models where run_id = v_run_id),
    cache_write_1h_tokens = (select coalesce(sum(cache_write_1h_tokens), 0) from run_models where run_id = v_run_id),
    cost_usd              = v_cost,
    status                = v_status
  where run_id = v_run_id;

  return jsonb_build_object('run_id', v_run_id, 'status', v_status, 'cost_usd', v_cost, 'models', v_count);
end;
$$;

-- Nearest distinct tasks (exact scan), with their tags and run summary, optionally limited to
-- given sizes. Untagged tasks are returned only when include_untagged is true.
create or replace function public.nearest_tasks(
  query_embedding extensions.vector(384),
  match_count int default 40,
  sizes text[] default null,
  include_untagged boolean default false
) returns table (task text, similarity float, work_kind text, size text, stack text[], runs bigint, median_cost float)
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
             filter (where r.status = 'recorded' and not r.flagged) as median_cost
    from nearest n join runs r on r.task = n.task
    group by n.task, n.similarity
  )
  select task, similarity, work_kind, size, stack, runs, median_cost
  from tagged
  where runs > 0
    and (sizes is null or size = any(sizes) or (include_untagged and size is null))
  order by similarity desc
  limit match_count;
$$;

-- Per-model stats over an explicit set of tasks (chosen by the reranker). Each install counts at
-- most 3 runs per model; imports without an install hash are unaffected.
create or replace function public.stats_for_tasks(tasks text[])
returns table (
  model text, n bigint, distinct_tasks bigint, success_rate float,
  p50_tokens float, p85_tokens float, p95_tokens float,
  p50_cost float, p85_cost float, p95_cost float
)
language sql stable
set search_path = public
as $$
  with chosen as (
    select r.*,
           row_number() over (partition by coalesce(r.install_hash, r.run_id::text), r.primary_model
                              order by r.created_at desc) as per_install
    from runs r
    where r.task = any(tasks) and r.status = 'recorded' and not r.flagged and r.primary_model is not null
  ), kept as (select * from chosen where per_install <= 3)
  select primary_model,
         count(*),
         count(distinct task),
         ((count(*) filter (where outcome = 'success'))::float
           / nullif(count(*) filter (where outcome <> 'unknown'), 0))::float,
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

-- Distinct tasks that still need tags (for the tag-tasks job).
create or replace function public.untagged_tasks(max_rows int default 40)
returns table (task text, runs bigint)
language sql stable
set search_path = public
as $$
  select task, count(*) from runs where tagged_by is null group by task order by count(*) desc limit max_rows;
$$;

revoke execute on function public.record_run(jsonb)                                  from public, anon, authenticated;
revoke execute on function public.nearest_tasks(extensions.vector, int, text[], boolean) from public, anon, authenticated;
revoke execute on function public.stats_for_tasks(text[])                            from public, anon, authenticated;
revoke execute on function public.untagged_tasks(int)                                from public, anon, authenticated;
