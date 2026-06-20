-- ================================================================
-- Slot Reaper — release slots stuck in 'locked' (a tentative hold the
-- booking flow never confirmed) back to 'available'. Runs every 5 min
-- via pg_cron. A slot is reaped when locked AND untouched for >15 min.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ATOMIC by construction: a single UPDATE locks each matching row, flips it,
-- and commits in one statement — no read-modify-write race, no partial state.
-- SECURITY DEFINER so the cron role always has write rights on slots.
CREATE OR REPLACE FUNCTION public.release_stale_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.slots
     SET status = 'available', last_updated = now()
   WHERE status = 'locked'
     AND last_updated < now() - interval '15 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE LOG 'release_stale_locks: freed % stale slot(s)', v_count;
  END IF;
  RETURN v_count;
END;
$$;

-- Idempotent (re)schedule: drop any prior job of the same name, then schedule.
DO $$
BEGIN
  PERFORM cron.unschedule('release-stale-locks');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- job does not exist yet — fine
END $$;

SELECT cron.schedule(
  'release-stale-locks',
  '*/5 * * * *',
  $$ SELECT public.release_stale_locks(); $$
);
