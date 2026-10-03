-- Claude list prices, USD per million tokens (Anthropic first-party API, as of 2026-09-25).
-- cache_read: 0.1× input, except Opus 5.5 ($0.20) and Fable/Mythos 5.1 ($0.25).
-- cache_write: 5-minute TTL rate, 1.25× input. 1-hour cache writes bill at 2× input; transcripts
-- don't always split the two, so costs for 1-hour-heavy sessions are slightly understated.
-- Non-Claude models are added once their exact model ids are seen in real logs.

insert into public.model_pricing
  (model, provider, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok)
values
  ('claude-fable-5-1',  'anthropic', 10, 50, 0.25, 12.50),
  ('claude-mythos-5-1', 'anthropic', 10, 50, 0.25, 12.50),
  ('claude-fable-5',    'anthropic', 10, 50, 1.00, 12.50),
  ('claude-mythos-5',   'anthropic', 10, 50, 1.00, 12.50),
  ('claude-opus-5-5',   'anthropic',  4, 20, 0.20,  5.00),
  ('claude-opus-5',     'anthropic',  5, 25, 0.50,  6.25),
  ('claude-opus-4-8',   'anthropic',  5, 25, 0.50,  6.25),
  ('claude-opus-4-7',   'anthropic',  5, 25, 0.50,  6.25),
  ('claude-opus-4-6',   'anthropic',  5, 25, 0.50,  6.25),
  ('claude-sonnet-5-5', 'anthropic',  2, 10, 0.20,  2.50),
  ('claude-sonnet-5',   'anthropic',  2, 10, 0.20,  2.50),
  ('claude-sonnet-4-6', 'anthropic',  3, 15, 0.30,  3.75),
  ('claude-haiku-4-5',  'anthropic',  1,  5, 0.10,  1.25)
on conflict (model) do update set
  provider = excluded.provider,
  input_per_mtok = excluded.input_per_mtok,
  output_per_mtok = excluded.output_per_mtok,
  cache_read_per_mtok = excluded.cache_read_per_mtok,
  cache_write_per_mtok = excluded.cache_write_per_mtok,
  updated_at = now();
