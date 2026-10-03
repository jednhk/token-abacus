-- Refresh model prices from OpenRouter every hour (sync-pricing Edge Function). Every price
-- change is kept in model_price_history; locked rows in model_pricing are never overwritten.

select cron.unschedule(jobid) from cron.job where jobname = 'sync-pricing';

select cron.schedule(
  'sync-pricing',
  '7 * * * *',
  $$
  select net.http_post(
           url := 'https://fgkiecqobecqwwqixrem.supabase.co/functions/v1/sync-pricing',
           headers := '{"content-type": "application/json"}'::jsonb,
           body := '{}'::jsonb,
           timeout_milliseconds := 30000);
  $$
);
