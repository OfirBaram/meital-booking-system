-- ================================================================
-- Migration: 20260523000000_generate_slots
-- Adds:
--   1. slot_templates — persistent weekly schedule template
--   2. generate_slots() — timezone-aware slot generation RPC
-- ================================================================

-- ----------------------------------------------------------------
-- 1. slot_templates
--    One row per weekday (0=Sun … 6=Sat).
--    start_times is a TEXT[] of "HH:MM" strings in Jerusalem local
--    time (e.g. {"09:00","11:00","14:00"}).
--    Fri (5) and Sat (6) are seeded inactive per business rules.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_templates (
  id          BIGSERIAL  PRIMARY KEY,
  day_of_week INT        NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  day_name    TEXT       NOT NULL,
  start_times TEXT[]     NOT NULL DEFAULT '{}',
  active      BOOLEAN    NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT slot_templates_dow_unique UNIQUE (day_of_week)
);

-- Seed a blank inactive template for all 7 days (idempotent)
INSERT INTO slot_templates (day_of_week, day_name, start_times, active) VALUES
  (0, 'ראשון',  '{}', false),
  (1, 'שני',    '{}', false),
  (2, 'שלישי',  '{}', false),
  (3, 'רביעי',  '{}', false),
  (4, 'חמישי',  '{}', false),
  (5, 'שישי',   '{}', false),
  (6, 'שבת',    '{}', false)
ON CONFLICT (day_of_week) DO NOTHING;

-- ----------------------------------------------------------------
-- 2. generate_slots(p_start_date, p_end_date, p_template)
--
--    p_template  JSONB array:
--      [{ "dayOfWeek": 0, "startTimes": ["09:00","11:30"], "active": true }, …]
--
--    Jerusalem timezone is handled entirely by PostgreSQL via
--    AT TIME ZONE 'Asia/Jerusalem' — DST-safe.
--
--    Duplicate slots are silently skipped via ON CONFLICT DO NOTHING
--    on the slots.start_time UNIQUE constraint.
--
--    Returns: { "success": true, "added": <count> }
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_slots(
  p_start_date DATE,
  p_end_date   DATE,
  p_template   JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cur_date  DATE;
  v_dow       INT;
  v_row       JSONB;
  v_time_str  TEXT;
  v_start_ts  TIMESTAMPTZ;
  v_end_ts    TIMESTAMPTZ;
  v_added     INT := 0;
BEGIN
  IF p_end_date < p_start_date THEN
    RETURN json_build_object('success', false, 'error', 'end_date must be >= start_date');
  END IF;

  IF p_end_date - p_start_date > 365 THEN
    RETURN json_build_object('success', false, 'error', 'date range exceeds 365 days');
  END IF;

  v_cur_date := p_start_date;

  WHILE v_cur_date <= p_end_date LOOP
    -- EXTRACT(DOW …): 0=Sunday … 6=Saturday (matches JS getDay())
    v_dow := EXTRACT(DOW FROM v_cur_date)::INT;

    SELECT elem INTO v_row
    FROM   jsonb_array_elements(p_template) AS elem
    WHERE  (elem->>'dayOfWeek')::INT = v_dow
      AND  (elem->>'active')::BOOLEAN IS TRUE
    LIMIT  1;

    IF v_row IS NOT NULL THEN
      FOR v_time_str IN
        SELECT jsonb_array_elements_text(v_row -> 'startTimes')
      LOOP
        v_time_str := trim(v_time_str);
        CONTINUE WHEN v_time_str !~ '^\d{1,2}:\d{2}$';

        -- PostgreSQL converts Jerusalem local → UTC automatically (DST-aware)
        v_start_ts := (v_cur_date::TEXT || ' ' || v_time_str)::TIMESTAMP
                       AT TIME ZONE 'Asia/Jerusalem';
        v_end_ts   := v_start_ts + INTERVAL '2 hours';

        INSERT INTO slots (start_time, end_time, status)
        VALUES (v_start_ts, v_end_ts, 'available')
        ON CONFLICT (start_time) DO NOTHING;

        IF FOUND THEN v_added := v_added + 1; END IF;
      END LOOP;
    END IF;

    v_cur_date := v_cur_date + INTERVAL '1 day';
  END LOOP;

  RETURN json_build_object('success', true, 'added', v_added);
END;
$$;
