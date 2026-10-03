-- Hotfix: record_run from 20261003080000 failed on every call ("column reference model is
-- ambiguous": the entries CTE selected both the normalized model and x.*, which has model too).
-- Same function with the columns listed explicitly.

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
           coalesce((q->>4)::bigint, 0) as cw1h, true as per_request
    from entries e, jsonb_array_elements(e.requests) q
    where jsonb_typeof(e.requests) = 'array' and jsonb_array_length(e.requests) > 0
    union all
    -- … otherwise one line with the totals
    select e.model,
           coalesce(e.input_tokens, 0), coalesce(e.output_tokens, 0), coalesce(e.cache_read_tokens, 0),
           coalesce(e.cache_write_tokens, 0), coalesce(e.cache_write_1h_tokens, 0), false
    from entries e
    where e.requests is null or jsonb_typeof(e.requests) <> 'array' or jsonb_array_length(e.requests) = 0
  ), priced as (
    select l.model, l.i, l.o, l.cr, l.cw, least(l.cw1h, l.cw) as cw1h, l.per_request,
           price_usage(p, case when l.per_request then l.i + l.cr + l.cw else 0 end,
                       l.i, l.o, l.cr, l.cw, least(l.cw1h, l.cw)) as price
    from lines l left join model_pricing p on p.model = l.model
  )
  insert into run_models
    (run_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
     cache_write_1h_tokens, cost_usd, priced_per_request)
  select v_run_id, model, sum(i), sum(o), sum(cr), sum(cw), sum(cw1h),
         case when count(*) = count(price) then sum(price) end,
         bool_or(per_request)
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

revoke execute on function public.record_run(jsonb) from public, anon, authenticated;
