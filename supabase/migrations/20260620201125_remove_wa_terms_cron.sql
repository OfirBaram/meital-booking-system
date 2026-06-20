-- Migration: remove_wa_terms_cron (2026-06-20)
-- Removes the wa-terms-reminder daily pg_cron job created in 20260620184104.
--
-- Why removed:
--   * Placeholder secret in cron.job = silent daily auth failure.
--   * CLAUDE.md: "NEVER embed secrets in SQL (cron.job table is queryable)."
--   * Terms reminders are piggybacked in send-reminders (GAS daily @08:00).
--   * wa-terms-reminder Edge Function still available for manual admin triggers
--     via POST with admin session header from the Pulse tab.
--
-- Idempotent: safe to run even if the job was already removed.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wa-terms-reminder-daily') THEN
    PERFORM cron.unschedule('wa-terms-reminder-daily');
  END IF;
END $$;
