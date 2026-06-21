-- Migration: 20260621000000_service_update_and_nail_notes
-- Changes:
--   1. Remove regular_feet and gel_combo from services
--   2. Add brows_wax (עיצוב גבות ושפם, 15 min)
--   3. Update sort_order for gel_hands
--   4. Add nail_notes JSONB column to appointments
--   5. Recreate bookings_view to expose nail_notes

-- 1. Remove discontinued services
DELETE FROM services WHERE id IN ('regular_feet', 'gel_combo');

-- 2. Add brows_wax service
INSERT INTO services (id, name_he, desc_he, duration_min, icon, sort_order, active)
VALUES (
  'brows_wax',
  'עיצוב גבות ושפם',
  'עיצוב גבות ועיצוב שפם בשיטת ווקס — תוצאה נקייה, מסוגננת ומדויקת.',
  15,
  '✨',
  1,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name_he      = EXCLUDED.name_he,
  desc_he      = EXCLUDED.desc_he,
  duration_min = EXCLUDED.duration_min,
  icon         = EXCLUDED.icon,
  sort_order   = EXCLUDED.sort_order,
  active       = EXCLUDED.active;

-- 3. Ensure gel_hands is sort_order 0
UPDATE services SET sort_order = 0 WHERE id = 'gel_hands';

-- 4. Add nail_notes JSONB column to appointments (idempotent)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS nail_notes JSONB;

-- 5. Recreate bookings_view to include nail_notes and source
CREATE OR REPLACE VIEW bookings_view AS
SELECT
  a.id,
  c.full_name                                                        AS name,
  c.phone,
  a.treatment_type                                                   AS service,
  COALESCE(a.services_summary, a.treatment_name)                     AS "serviceName",
  to_char(s.start_time AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD') AS date,
  to_char(s.start_time AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI')    AS time,
  initcap(a.status)                                                  AS status,
  s.start_time                                                       AS timestamp,
  a.duration_min                                                     AS duration,
  a.admin_token,
  a.calendar_event_id,
  a.services_summary,
  a.service_ids,
  a.source,
  a.nail_notes
FROM       appointments  a
JOIN clients      c ON c.id  = a.client_id
JOIN slots        s ON s.id  = a.slot_id;

REVOKE ALL ON bookings_view FROM anon, authenticated;
GRANT  SELECT ON bookings_view TO service_role;
