-- Live counter for the website header: how many tasks have been submitted.
-- Counts the same rows the public feed shows (recorded, not flagged), so the
-- number never includes runs the site would hide.

create or replace function public.task_count()
returns bigint
language sql stable security definer
set search_path = public
as $$
  select count(*) from runs where status = 'recorded' and not flagged;
$$;

revoke execute on function public.task_count() from public;
grant  execute on function public.task_count() to anon, authenticated;
