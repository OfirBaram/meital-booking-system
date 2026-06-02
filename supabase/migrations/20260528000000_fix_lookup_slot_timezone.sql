-- ================================================================
-- Migration: 20260528000000_fix_lookup_slot_timezone
--
-- Replaces the production lookup_slot_by_date_time which used a
-- hardcoded +3h offset. Problems with the old version:
--
--   1. Operator precedence: `start_time AT TIME ZONE 'UTC' + INTERVAL '3 hours'`
--      is parsed as `start_time AT TIME ZONE ('UTC' + INTERVAL '3 hours')`
--      — a type error that only passes because PostgreSQL coerces it
--      in an unexpected way.
--
--   2. DST hazard: Israel is UTC+3 in summer (IDT) and UTC+2 in winter
--      (IST). Hardcoding +3 returns wrong results from October to March.
--      A slot at 12:00 UTC in January = 14:00 Jerusalem (UTC+2), but
--      the old function adds 3h → 15:00, failing to match '14:00'.
--
--   3. Parameter types: old version used DATE and TIME parameters.
--      The Edge Function sends plain text strings (e.g. '2026-05-28',
--      '14:00'). Explicit TEXT params with internal casts are safer.
--
-- Fix: use AT TIME ZONE 'Asia/Jerusalem' — PostgreSQL applies the
-- correct DST rule for each specific timestamp, year-round.
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
  WHERE  DATE(start_time AT TIME ZONE 'Asia/Jerusalem')              = p_date::date
    AND  TO_CHAR(start_time AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI') = p_time
    AND  status = 'available'
  LIMIT 1
$$;

-- ── Quick sanity check (run manually to verify) ──────────────────────
-- If your slots table has a row at 11:00 UTC on 2026-05-28, this
-- should return that slot's id (not NULL):
--
-- SELECT lookup_slot_by_date_time('2026-05-28', '14:00');
--
-- And this should return NULL (wrong time):
--
-- SELECT lookup_slot_by_date_time('2026-05-28', '11:00');
-- ────────────────────────────────────────────────────────────────────
