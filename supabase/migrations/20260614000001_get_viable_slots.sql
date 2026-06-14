-- ================================================================
-- Migration: 20260614000001_get_viable_slots
-- Two SQL functions for the smart_scheduling feature flag:
--
--   get_viable_slots(month_start, month_end, duration_min)
--     Returns start_times of available slots that will NOT leave
--     a gap shorter than 90 min on either side when booked for
--     duration_min. Algorithm per slot S:
--       left_wall  = end of nearest prior busy treatment (or day start)
--       right_wall = start of nearest following busy slot (or day end)
--       gap_before = S.start - left_wall
--       gap_after  = right_wall - (S.start + duration_min)
--     Reject S if either gap is 0 < gap < 90 min.
--
--   check_gap_safety(slot_id, duration_min)
--     Single-slot guard called from verify-and-book before locking.
--     Delegates to get_viable_slots to catch the race-condition
--     window between calendar display and form submission.
-- ================================================================

CREATE OR REPLACE FUNCTION get_viable_slots(
  p_month_start  TIMESTAMPTZ,
  p_month_end    TIMESTAMPTZ,
  p_duration_min INT DEFAULT 90
)
RETURNS TABLE (slot_start TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
WITH
-- All slots in the requested UTC window with their effective treatment end
month_slots AS (
  SELECT
    s.id,
    s.start_time,
    s.end_time,
    s.status,
    CASE
      WHEN s.status IN ('pending', 'booked', 'locked') THEN
        s.start_time + COALESCE(
          (SELECT a.duration_min
           FROM   appointments a
           WHERE  a.slot_id = s.id
             AND  a.status NOT IN ('rejected', 'cancelled')
           ORDER  BY a.created_at DESC
           LIMIT  1),
          120
        ) * INTERVAL '1 minute'
      ELSE s.end_time
    END AS effective_end
  FROM public.slots s
  WHERE s.start_time >= p_month_start
    AND s.start_time <  p_month_end
),

-- Per-Jerusalem-day boundaries
day_bounds AS (
  SELECT
    (s.start_time AT TIME ZONE 'Asia/Jerusalem')::DATE AS jday,
    MIN(s.start_time) AS day_window_start,
    MAX(s.end_time)   AS day_window_end
  FROM month_slots s
  GROUP BY 1
),

-- Non-available slots with true treatment end
busy AS (
  SELECT start_time AS busy_start, effective_end AS busy_end
  FROM   month_slots
  WHERE  status NOT IN ('available')
)

SELECT ms.start_time AS slot_start
FROM month_slots ms
JOIN day_bounds db
  ON db.jday = (ms.start_time AT TIME ZONE 'Asia/Jerusalem')::DATE
CROSS JOIN LATERAL (
  SELECT GREATEST(
    db.day_window_start,
    COALESCE(
      (SELECT MAX(b.busy_end)
       FROM   busy b
       WHERE  b.busy_end  <= ms.start_time
         AND  b.busy_start >= db.day_window_start),
      db.day_window_start
    )
  ) AS left_wall
) lw
CROSS JOIN LATERAL (
  SELECT ms.start_time + p_duration_min * INTERVAL '1 minute' AS treatment_end
) te
CROSS JOIN LATERAL (
  SELECT LEAST(
    db.day_window_end,
    COALESCE(
      (SELECT MIN(b.busy_start)
       FROM   busy b
       WHERE  b.busy_start >= te.treatment_end
         AND  b.busy_start <  db.day_window_end),
      db.day_window_end
    )
  ) AS right_wall
) rw

WHERE
  ms.status = 'available'
  AND ms.start_time > now()
  AND te.treatment_end <= db.day_window_end
  AND (
    ms.start_time - lw.left_wall = INTERVAL '0'
    OR ms.start_time - lw.left_wall >= INTERVAL '90 minutes'
  )
  AND (
    rw.right_wall - te.treatment_end = INTERVAL '0'
    OR rw.right_wall - te.treatment_end >= INTERVAL '90 minutes'
  )
ORDER BY ms.start_time
$$;

GRANT EXECUTE ON FUNCTION get_viable_slots(TIMESTAMPTZ, TIMESTAMPTZ, INT)
  TO service_role;


-- ----------------------------------------------------------------
-- check_gap_safety: single-slot guard called from verify-and-book
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_gap_safety(
  p_slot_id      BIGINT,
  p_duration_min INT DEFAULT 90
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_win_s TIMESTAMPTZ;
  v_win_e TIMESTAMPTZ;
  v_ok    BOOLEAN;
BEGIN
  SELECT start_time INTO v_start
  FROM   public.slots
  WHERE  id = p_slot_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- 30-hour UTC window around the slot's date covers any Jerusalem DST offset
  v_win_s := v_start::DATE::TIMESTAMPTZ - INTERVAL '3 hours';
  v_win_e := v_win_s + INTERVAL '30 hours';

  SELECT EXISTS (
    SELECT 1
    FROM   get_viable_slots(v_win_s, v_win_e, p_duration_min) v
    WHERE  v.slot_start = v_start
  ) INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

GRANT EXECUTE ON FUNCTION check_gap_safety(BIGINT, INT)
  TO service_role;
