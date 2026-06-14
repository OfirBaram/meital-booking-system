-- ================================================================
-- Fix get_viable_slots: use s.end_time for busy effective_end
-- ----------------------------------------------------------------
-- Bug: previous version queried appointments.duration_min (= 90 min
-- for gel_classic) to compute effective_end for booked/locked slots.
-- But slots.end_time already encodes the FULL blocked window
-- (treatment + 30-min buffer, e.g. 90+30 = 120 min).  Using
-- duration_min placed the left_wall 30 min too early, creating a
-- blind spot exactly in the buffer zone.
-- Fix: always use s.end_time as effective_end.
--
-- Also adds explain_viable_slots() for Edge Function logging:
-- returns every available slot with (viable, gap_before_min,
-- gap_after_min) so the smart path can log WHY a slot was removed.
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
month_slots AS (
  SELECT
    id,
    start_time,
    end_time,
    status,
    end_time AS effective_end   -- full blocked window (treatment + buffer)
  FROM public.slots s
  WHERE s.start_time >= p_month_start
    AND s.start_time <  p_month_end
),
day_bounds AS (
  SELECT
    (s.start_time AT TIME ZONE 'Asia/Jerusalem')::DATE AS jday,
    MIN(s.start_time) AS day_window_start,
    MAX(s.end_time)   AS day_window_end
  FROM month_slots s
  GROUP BY 1
),
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
-- explain_viable_slots: same logic, but returns ALL available slots
-- with their viability flag and gap sizes for Edge Function logging.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION explain_viable_slots(
  p_month_start  TIMESTAMPTZ,
  p_month_end    TIMESTAMPTZ,
  p_duration_min INT DEFAULT 90
)
RETURNS TABLE (
  slot_start     TIMESTAMPTZ,
  viable         BOOLEAN,
  gap_before_min INT,
  gap_after_min  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
WITH
month_slots AS (
  SELECT id, start_time, end_time, status, end_time AS effective_end
  FROM public.slots s
  WHERE s.start_time >= p_month_start
    AND s.start_time <  p_month_end
),
day_bounds AS (
  SELECT
    (s.start_time AT TIME ZONE 'Asia/Jerusalem')::DATE AS jday,
    MIN(s.start_time) AS day_window_start,
    MAX(s.end_time)   AS day_window_end
  FROM month_slots s GROUP BY 1
),
busy AS (
  SELECT start_time AS busy_start, effective_end AS busy_end
  FROM month_slots WHERE status NOT IN ('available')
)
SELECT
  ms.start_time AS slot_start,
  (
    ms.start_time > now()
    AND te.treatment_end <= db.day_window_end
    AND (ms.start_time - lw.left_wall = INTERVAL '0'
         OR ms.start_time - lw.left_wall >= INTERVAL '90 minutes')
    AND (rw.right_wall - te.treatment_end = INTERVAL '0'
         OR rw.right_wall - te.treatment_end >= INTERVAL '90 minutes')
  ) AS viable,
  EXTRACT(EPOCH FROM (ms.start_time - lw.left_wall))::INT / 60  AS gap_before_min,
  EXTRACT(EPOCH FROM (rw.right_wall - te.treatment_end))::INT / 60 AS gap_after_min
FROM month_slots ms
JOIN day_bounds db ON db.jday = (ms.start_time AT TIME ZONE 'Asia/Jerusalem')::DATE
CROSS JOIN LATERAL (
  SELECT GREATEST(db.day_window_start, COALESCE(
    (SELECT MAX(b.busy_end) FROM busy b
     WHERE b.busy_end <= ms.start_time AND b.busy_start >= db.day_window_start),
    db.day_window_start
  )) AS left_wall
) lw
CROSS JOIN LATERAL (
  SELECT ms.start_time + p_duration_min * INTERVAL '1 minute' AS treatment_end
) te
CROSS JOIN LATERAL (
  SELECT LEAST(db.day_window_end, COALESCE(
    (SELECT MIN(b.busy_start) FROM busy b
     WHERE b.busy_start >= te.treatment_end AND b.busy_start < db.day_window_end),
    db.day_window_end
  )) AS right_wall
) rw
WHERE ms.status = 'available'
ORDER BY ms.start_time
$$;

GRANT EXECUTE ON FUNCTION explain_viable_slots(TIMESTAMPTZ, TIMESTAMPTZ, INT)
  TO service_role;
