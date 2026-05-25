-- ================================================================
-- Migration: 20260530000000_simplify_lock_slot
--
-- Replaces the complex lock_slot_for_booking function with a
-- minimal single-purpose version:
--   - Accepts p_slot_id as TEXT; casts to BIGINT inside SQL
--   - Updates only the status column of the slots table
--   - Returns BOOLEAN (true = slot was locked, false = already taken)
--
-- The previous version tried to INSERT into appointments inside the
-- same SQL function, which failed with "column does not exist" errors
-- when the live DB schema diverged from the migration definition.
--
-- Appointment creation is now handled in the Edge Function
-- (verify-and-book step 10) as a direct Supabase client INSERT
-- after the lock succeeds. If the appointment INSERT fails, the
-- Edge Function compensates by restoring the slot to 'available'.
--
-- DROP all existing overloads first so CREATE OR REPLACE does not
-- silently leave a stale (BIGINT, UUID, ...) version that Postgres
-- might prefer via implicit casting.
-- ================================================================

DROP FUNCTION IF EXISTS lock_slot_for_booking(BIGINT, UUID, UUID, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS lock_slot_for_booking(TEXT,   UUID, UUID, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS lock_slot_for_booking(BIGINT);
DROP FUNCTION IF EXISTS lock_slot_for_booking(TEXT);

CREATE FUNCTION lock_slot_for_booking(p_slot_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.slots
  SET    status = 'locked'
  WHERE  id     = p_slot_id::BIGINT
    AND  status = 'available';
  RETURN FOUND;
END;
$$;
