-- Migration: wa_terms_reminder_cron (2026-06-20)
-- This migration created a pg_cron daily trigger for wa-terms-reminder.
--
-- STATUS: Immediately superseded by 20260620184200_remove_wa_terms_cron.sql
-- REASON:
--   1. The cron job header used a placeholder secret that fails auth on every run.
--   2. CLAUDE.md rule: NEVER embed secrets in SQL (cron.job table is queryable).
--   3. Terms reminders are piggybacked in send-reminders (GAS daily @08:00).
--   4. wa-terms-reminder remains callable manually via admin session.
--
-- For NEW environments: this migration + the next run in sequence;
-- the cron job is created then immediately removed. Net result = no cron job.

SELECT cron.schedule(
  'wa-terms-reminder-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/wa-terms-reminder',
    headers := '{"Content-Type":"application/json","x-cron-secret":"__PLACEHOLDER__"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
