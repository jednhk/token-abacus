-- Exact cost.
--
-- 1. Cache writes have two prices. Claude Code writes its prompt cache with a 1-hour lifetime
--    (100% of cache writes in our logs), billed at 2× input, not the 5-minute 1.25×. Costs were
--    ~30% low. run_models.cache_write_1h_tokens says how many of cache_write_tokens were 1-hour.
-- 2. Long-context tiers. Some models charge more per request once that request's prompt passes a
--    size (e.g. Sonnet 4.5: $3/$15 → $6/$22.50 above 200k prompt tokens). That's decided per
--    request, so clients may send per-request usage and record_run prices each request.
-- 3. Prices change. model_pricing is refreshed hourly from OpenRouter (sync-pricing function);
--    every change is kept in model_price_history. Rows with locked = true are never overwritten.

-- ── pricing ────────────────────────────────────────────────────────────────────
alter table public.model_pricing
  add column cache_write_1h_per_mtok numeric,
  add column tiers jsonb not null default '[]'::jsonb,   -- [{min_prompt_tokens, input_per_mtok, …}]
  add column source text not null default 'manual',      -- 'openrouter' | 'manual'
  add column source_id text,                             -- e.g. 'anthropic/claude-opus-5.5'
  add column locked boolean not null default false,      -- true = sync never overwrites
  add column checked_at timestamptz;                     -- last time sync saw this model

-- Anthropic's published rule until the first sync fills real values: 1-hour writes = 2× input.
update public.model_pricing
set cache_write_1h_per_mtok = input_per_mtok * 2
where provider in ('anthropic', '~anthropic') and cache_write_1h_per_mtok is null;

create table public.model_price_history (
  id                      bigint generated always as identity primary key,
  model                   text not null,
  input_per_mtok          numeric,
  output_per_mtok         numeric,
  cache_read_per_mtok     numeric,
  cache_write_per_mtok    numeric,
  cache_write_1h_per_mtok numeric,
  tiers                   jsonb,
  source                  text,
  valid_from              timestamptz not null default now()
);
create index model_price_history_model_idx on public.model_price_history (model, valid_from desc);
alter table public.model_price_history enable row level security;
create policy "price history is public" on public.model_price_history for select using (true);

insert into public.model_price_history
  (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, cache_write_1h_per_mtok, tiers, source, valid_from)
select model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, cache_write_1h_per_mtok, tiers, source, updated_at
from public.model_pricing;

create or replace function public.record_price_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
     or (new.input_per_mtok, new.output_per_mtok, new.cache_read_per_mtok, new.cache_write_per_mtok,
         new.cache_write_1h_per_mtok, new.tiers)
        is distinct from
        (old.input_per_mtok, old.output_per_mtok, old.cache_read_per_mtok, old.cache_write_per_mtok,
         old.cache_write_1h_per_mtok, old.tiers) then
    insert into model_price_history
      (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, cache_write_1h_per_mtok, tiers, source)
    values
      (new.model, new.input_per_mtok, new.output_per_mtok, new.cache_read_per_mtok, new.cache_write_per_mtok,
       new.cache_write_1h_per_mtok, new.tiers, new.source);
  end if;
  return new;
end;
$$;

create trigger model_pricing_history
  after insert or update on public.model_pricing
  for each row execute function public.record_price_change();

-- Upsert from the sync job. Skips locked rows; bumps updated_at only when a price really changed.
create or replace function public.upsert_pricing(items jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_changed int;
  v_seen int;
begin
  with incoming as (
    select * from jsonb_to_recordset(items) as x(
      model text, provider text, input_per_mtok numeric, output_per_mtok numeric,
      cache_read_per_mtok numeric, cache_write_per_mtok numeric, cache_write_1h_per_mtok numeric,
      tiers jsonb, source_id text)
  ), written as (
    insert into model_pricing as mp
      (model, provider, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok,
       cache_write_1h_per_mtok, tiers, source, source_id, checked_at, updated_at)
    select model, provider, input_per_mtok, output_per_mtok,
           coalesce(cache_read_per_mtok, input_per_mtok), coalesce(cache_write_per_mtok, input_per_mtok),
           cache_write_1h_per_mtok, coalesce(tiers, '[]'::jsonb), 'openrouter', source_id, now(), now()
    from incoming
    on conflict (model) do update set
      provider = excluded.provider,
      input_per_mtok = excluded.input_per_mtok,
      output_per_mtok = excluded.output_per_mtok,
      cache_read_per_mtok = excluded.cache_read_per_mtok,
      cache_write_per_mtok = excluded.cache_write_per_mtok,
      cache_write_1h_per_mtok = excluded.cache_write_1h_per_mtok,
      tiers = excluded.tiers,
      source = 'openrouter',
      source_id = excluded.source_id,
      checked_at = now(),
      updated_at = now()
    where not mp.locked
      and (mp.input_per_mtok, mp.output_per_mtok, mp.cache_read_per_mtok, mp.cache_write_per_mtok,
           mp.cache_write_1h_per_mtok, mp.tiers, mp.source_id)
          is distinct from
          (excluded.input_per_mtok, excluded.output_per_mtok, excluded.cache_read_per_mtok,
           excluded.cache_write_per_mtok, excluded.cache_write_1h_per_mtok, excluded.tiers, excluded.source_id)
    returning 1
  )
  select count(*) into v_changed from written;

  update model_pricing set checked_at = now()
  where model in (select x->>'model' from jsonb_array_elements(items) x) and not locked;
  get diagnostics v_seen = row_count;

  return jsonb_build_object('changed', v_changed, 'seen', v_seen);
end;
$$;

-- ── usage columns ──────────────────────────────────────────────────────────────
alter table public.run_models
  add column cache_write_1h_tokens bigint not null default 0,
  add column priced_per_request boolean not null default false,
  add constraint run_models_cache_write_1h_check
    check (cache_write_1h_tokens >= 0 and cache_write_1h_tokens <= cache_write_tokens);

alter table public.runs
  add column cache_write_1h_tokens bigint not null default 0;

-- ── pricing one block of usage ─────────────────────────────────────────────────
-- prompt_tokens picks the long-context tier: the tier with the highest min_prompt_tokens that the
-- prompt reaches. Pass 0 for aggregated usage (base tier). Null when the model has no price.
create or replace function public.price_usage(
  p model_pricing, prompt_tokens bigint,
  input bigint, output bigint, cache_read bigint, cache_write bigint, cache_write_1h bigint
) returns numeric
language sql immutable
set search_path = public
as $$
  with tier as (
    select (select t from jsonb_array_elements(coalesce(p.tiers, '[]'::jsonb)) t
            where (t->>'min_prompt_tokens')::bigint <= prompt_tokens
            order by (t->>'min_prompt_tokens')::bigint desc limit 1) as t
  )
  select ( input  * coalesce((t->>'input_per_mtok')::numeric,  p.input_per_mtok)
         + output * coalesce((t->>'output_per_mtok')::numeric, p.output_per_mtok)
         + cache_read * coalesce((t->>'cache_read_per_mtok')::numeric, p.cache_read_per_mtok)
         + (cache_write - cache_write_1h)
             * coalesce((t->>'cache_write_per_mtok')::numeric, p.cache_write_per_mtok)
         + cache_write_1h
             * coalesce((t->>'cache_write_1h_per_mtok')::numeric, p.cache_write_1h_per_mtok, p.cache_write_per_mtok)
         ) / 1e6
  from tier;
$$;

-- ── record_run: accepts cache_write_1h_tokens and optional per-request usage ───
-- models[i] = { model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
--               cache_write_1h_tokens?, requests?: [[input, output, cache_read, cache_write, cache_write_1h], …] }
-- With requests, token totals come from them and each request is priced at its own tier.
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

-- ── reprice: recompute stored costs from current prices (corrections only) ─────
-- Rows priced per request keep their cost (their per-request detail isn't stored).
create or replace function public.reprice_runs()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_models int;
  v_runs int;
begin
  update run_models m
  set cost_usd = price_usage(p, 0, m.input_tokens, m.output_tokens, m.cache_read_tokens,
                             m.cache_write_tokens, m.cache_write_1h_tokens)
  from (select rm.run_id, rm.model, mp as p
        from run_models rm left join model_pricing mp on mp.model = rm.model
        where not rm.priced_per_request) x
  where m.run_id = x.run_id and m.model = x.model;
  get diagnostics v_models = row_count;

  update runs r
  set cost_usd = x.cost
  from (select run_id, case when count(*) = count(cost_usd) then sum(cost_usd) end as cost
        from run_models group by run_id) x
  where r.run_id = x.run_id and r.cost_usd is distinct from x.cost;
  get diagnostics v_runs = row_count;

  return jsonb_build_object('model_rows', v_models, 'runs_changed', v_runs);
end;
$$;

revoke execute on function public.record_run(jsonb)        from public, anon, authenticated;
revoke execute on function public.upsert_pricing(jsonb)    from public, anon, authenticated;
revoke execute on function public.reprice_runs()           from public, anon, authenticated;
revoke execute on function public.record_price_change()    from public, anon, authenticated;
