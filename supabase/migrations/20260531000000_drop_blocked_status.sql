-- ================================================================
-- Migration: 20260531000000_drop_blocked_status
--
-- Removes the legacy 'blocked' status from the slots table.
-- In the Supabase V2 flow, 'blocked' was never written — the
-- vacation-override feature used 'locked' (same as the booking
-- flow). The 'blocked' value is a leftover from the GAS/Sheets
-- era and is safe to drop.
--
-- Valid statuses after this migration:
--   available → pending (lock_slot_for_booking)
--   locked    → available (toggle) or booked (approval)
--   booked    → available (cancellation)
-- ================================================================

ALTER TABLE public.slots
  DROP CONSTRAINT IF EXISTS slots_status_check;

ALTER TABLE public.slots
  ADD CONSTRAINT slots_status_check
  CHECK (status IN ('available', 'pending', 'locked', 'booked'));
