-- ================================================================
-- Step F — direct WhatsApp booking support + reaper hardening.
--
-- CRITICAL FIX: lock_slot_for_booking() sets a slot to 'locked' on EVERY
-- booking (web + bot). The Step E reaper freed any 'locked' slot older than
-- 15 min by last_updated — which would have released REAL pending bookings.
-- This migration:
--   1. adds slots.locked_at (stamped when a slot is locked)
--   2. makes lock_slot_for_booking() stamp locked_at = now()
--   3. rewrites release_stale_locks() to free ONLY orphaned locks:
--      locked > 15 min AND with NO active (pending/approved) appointment.
-- ================================================================

-- 1. locked_at column ------------------------------------------------------
ALTER TABLE public.slots ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 2. lock_slot_for_booking now stamps locked_at (web + bot both benefit) -----
DROP FUNCTION IF EXISTS lock_slot_for_booking(TEXT);
CREATE FUNCTION lock_slot_for_booking(p_slot_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.slots
     SET status = 'locked', locked_at = now()
   WHERE id = p_slot_id::BIGINT
     AND status = 'available';
  RETURN FOUND;
END;
$$;

-- 3. Reaper: free ONLY orphaned locks. A 'locked' slot that still has a
--    pending/approved appointment is a REAL booking — never reap it.
CREATE OR REPLACE FUNCTION public.release_stale_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.slots s
     SET status = 'available', locked_at = NULL, last_updated = now()
   WHERE s.status   = 'locked'
     AND s.locked_at IS NOT NULL
     AND s.locked_at < now() - interval '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a
        WHERE a.slot_id = s.id
          AND a.status IN ('pending', 'approved')
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE LOG 'release_stale_locks: freed % orphaned lock(s)', v_count;
  END IF;
  RETURN v_count;
END;
$$;
