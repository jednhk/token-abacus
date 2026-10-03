-- Fast mode (speed: "fast", e.g. /fast in Claude Code) bills a request at a multiple of the
-- standard price — 2× on Claude Opus 5.5, Opus 5 and Opus 4.8 ($8/$40, $10/$50, $10/$50) —
-- applied to every part of the request, the way OpenRouter's batch prices apply ×0.5 to input,
-- output, cache reads and both cache writes alike.
--
-- Session logs record usage.speed per request, so the MCP client marks fast requests with a 6th
-- element in each per-request row: [input, output, cache_read, cache_write, cache_write_1h, fast].
-- model_pricing.fast_multiplier holds the multiple; the hourly OpenRouter sync never touches it
-- (the catalog has no fast-mode prices). A fast request on a model with no multiplier set uses 2,
-- the multiple Anthropic applies on every model that offers fast mode.

alter table public.model_pricing add column fast_multiplier numeric;

update public.model_pricing set fast_multiplier = 2
where model in ('claude-opus-5-5', 'claude-opus-5', 'claude-opus-4-8');

alter table public.run_models add column fast_requests integer not null default 0;

drop function if exists public.price_usage(model_pricing, bigint, bigint, bigint, bigint, bigint, bigint);

create function public.price_usage(
  p model_pricing, prompt_tokens bigint,
  input bigint, output bigint, cache_read bigint, cache_write bigint, cache_write_1h bigint,
  speed_multiplier numeric default 1
) returns numeric
language sql immutable
set search_path = public
as $$
  with tier as (
    select (select t from jsonb_array_elements(coalesce(p.tiers, '[]'::jsonb)) t
            where (t->>'min_prompt_tokens')::bigint <= prompt_tokens
            order by (t->>'min_prompt_tokens')::bigint desc limit 1) as t
  )
  select speed_multiplier * (
           input  * coalesce((t->>'input_per_mtok')::numeric,  p.input_per_mtok)
         + output * coalesce((t->>'output_per_mtok')::numeric, p.output_per_mtok)
         + cache_read * coalesce((t->>'cache_read_per_mtok')::numeric, p.cache_read_per_mtok)
         + (cache_write - cache_write_1h)
             * coalesce((t->>'cache_write_per_mtok')::numeric, p.cache_write_per_mtok)
         + cache_write_1h
             * coalesce((t->>'cache_write_1h_per_mtok')::numeric, p.cache_write_1h_per_mtok, p.cache_write_per_mtok)
         ) / 1e6
  from tier;
$$;

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

revoke execute on function public.record_run(jsonb) from public, anon, authenticated;
