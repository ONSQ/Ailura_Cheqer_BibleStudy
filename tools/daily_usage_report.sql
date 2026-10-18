-- Cheqer daily usage report. Read-only. "Day" = yesterday in America/Chicago.
-- The app has no analytics: anonymous readers who never use an AI feature
-- leave no trace, and distinct IPs only approximate people.
with b as (
  select (date_trunc('day', now() at time zone 'America/Chicago') - interval '1 day') at time zone 'America/Chicago' as d0,
         date_trunc('day', now() at time zone 'America/Chicago') at time zone 'America/Chicago' as d1
)
select
  (select (d0 at time zone 'America/Chicago')::date from b) as report_day,
  -- accounts
  (select count(*) from auth.users) as accounts_total,
  (select count(*) from auth.users, b where created_at >= d0 and created_at < d1) as accounts_new,
  (select count(*) from auth.users, b where last_sign_in_at >= d0 and last_sign_in_at < d1) as accounts_signed_in,
  (select count(*) from auth.users where last_sign_in_at >= now() - interval '7 days') as accounts_active_7d,
  -- AI features (anonymous signal)
  (select count(*) from ai_calls, b where created_at >= d0 and created_at < d1) as ai_calls_day,
  (select count(distinct ip) from ai_calls, b where created_at >= d0 and created_at < d1) as ai_ips_day,
  (select count(distinct ip) from ai_calls where created_at >= now() - interval '7 days') as ai_ips_7d,
  (select count(*) from ai_calls) as ai_calls_total,
  (select coalesce(json_object_agg(fn, n), '{}') from (
     select fn, count(*) n from ai_calls, b where created_at >= d0 and created_at < d1 group by fn order by n desc) x) as ai_by_feature_day,
  (select json_agg(x order by day) from (
     select (created_at at time zone 'America/Chicago')::date as day, count(*) calls, count(distinct ip) ips
     from ai_calls where created_at >= (select d1 from b) - interval '7 days' and created_at < (select d1 from b)
     group by 1) x) as ai_last_7_days,
  -- saved studies
  (select count(*) from word_studies, b where created_at >= d0 and created_at < d1) as studies_new,
  (select count(*) from word_studies, b where created_at >= d0 and created_at < d1 and is_shared) as studies_new_shared,
  (select count(*) from word_studies) as studies_total,
  -- generated briefs cached
  (select count(*) from sod_briefs, b where created_at >= d0 and created_at < d1) as sod_briefs_new,
  (select count(*) from entity_briefs, b where created_at >= d0 and created_at < d1) as entity_briefs_new,
  -- email list and testers
  (select count(*) from email_signups, b where created_at >= d0 and created_at < d1) as email_signups_new,
  (select count(*) from email_signups) as email_signups_total,
  (select coalesce(json_agg(json_build_object('email', email, 'platform', platform, 'status', status, 'since', created_at::date) order by created_at), '[]')
     from tester_requests where status = 'received') as tester_requests_open,
  (select count(*) from tester_requests, b where created_at >= d0 and created_at < d1) as tester_requests_new;
