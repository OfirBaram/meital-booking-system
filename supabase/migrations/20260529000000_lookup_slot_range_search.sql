-- ================================================================
-- Migration: 20260529000000_lookup_slot_range_search
--
-- Replaces the strict-equality lookup with a ±1-minute range search.
--
-- Why the range approach:
--   The strict equality in 20260528 works correctly for slots generated
--   via generate_slots() (which stores UTC via AT TIME ZONE 'Asia/Jerusalem').
--   However, if any slots were inserted manually without explicit timezone
--   handling, the stored UTC value may differ from what the reverse
--   conversion produces — causing a miss on exact equality.
--
-- How the range is computed:
--   1. Concatenate p_date + ' ' + p_time as a naive TIMESTAMP
--   2. Apply AT TIME ZONE 'Asia/Jerusalem' → converts the Jerusalem-local
--      time to UTC for comparison against the stored TIMESTAMPTZ column
--   3. Accept any slot within ±1 minute of that UTC instant
--
-- IMPORTANT: the AT TIME ZONE conversion is mandatory here.
--   Without it, '2026-05-25 09:00'::TIMESTAMP is treated as UTC by
--   the session, but correctly generated slots are stored at
--   '2026-05-25 06:00:00 UTC' (Jerusalem UTC+3 in summer).
--   Omitting AT TIME ZONE would search around 09:00 UTC and never
--   find those slots.
--
-- The ORDER BY + LIMIT 1 ensures a deterministic result when two
-- slots happen to fall within the ±1-minute window (shouldn't occur
-- in normal operation, but guards against DST overlap edge cases).
-- ================================================================

CREATE OR REPLACE FUNCTION lookup_slot_by_date_time(
  p_date TEXT,   -- 'YYYY-MM-DD' in Jerusalem local time
  p_time TEXT    -- 'HH:MM'      in Jerusalem local time
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM   slots
  WHERE  start_time >= ((p_date || ' ' || p_time)::TIMESTAMP AT TIME ZONE 'Asia/Jerusalem') - INTERVAL '1 minute'
    AND  start_time <  ((p_date || ' ' || p_time)::TIMESTAMP AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '1 minute'
    AND  status = 'available'
  ORDER BY start_time
  LIMIT 1
$$;

-- ── Sanity check (run manually in SQL Editor to verify) ──────────
-- Replace the timestamp below with one that matches an available slot
-- in your slots table. Expected result: the slot's id (not null).
--
-- SELECT lookup_slot_by_date_time(
--   to_char(start_time AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD'),
--   to_char(start_time AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI')
-- )
-- FROM slots
-- WHERE status = 'available'
-- LIMIT 1;
--
-- This query feeds the function its own values — result must equal
-- the id from the outer SELECT. If it returns null, the timezone
-- conversion is mismatched.
-- ────────────────────────────────────────────────────────────────
