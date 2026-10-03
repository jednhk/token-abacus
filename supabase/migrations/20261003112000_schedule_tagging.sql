-- Tag new untagged tasks (imports, older clients) every minute with the tag-tasks function.

select cron.unschedule(jobid) from cron.job where jobname = 'tag-tasks';

select cron.schedule(
  'tag-tasks',
  '* * * * *',
  $$
  select net.http_post(
           url := 'https://fgkiecqobecqwwqixrem.supabase.co/functions/v1/tag-tasks',
           headers := '{"content-type": "application/json"}'::jsonb,
           body := '{}'::jsonb,
           timeout_milliseconds := 120000)
  where exists (select 1 from public.runs where tagged_by is null);
  $$
);
