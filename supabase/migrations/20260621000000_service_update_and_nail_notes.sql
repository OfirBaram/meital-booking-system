-- ================================================================
-- Migration: 20260621000000_service_update_and_nail_notes
-- * Remove regular_feet + gel_combo (no more feet services)
-- * Add brows_wax (eyebrows + upper lip wax, 15 min)
-- * Add nail_notes JSONB to appointments (gel pre-screening)
-- * Update bookings_view to surface nail_notes + source
-- ================================================================

-- Services catalog -----------------------------------------------
DELETE FROM services WHERE id IN ('regular_feet', 'gel_combo');

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
  active       = EXCLUDED.active,
  updated_at   = now();

UPDATE services SET sort_order = 0 WHERE id = 'gel_hands';

-- Nail pre-screening ---------------------------------------------
-- Structured answers for gel manicure bookings. Null for brows_wax.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS nail_notes JSONB;

-- bookings_view: drop + recreate with nail_notes + source --------
DROP VIEW IF EXISTS bookings_view;

CREATE VIEW bookings_view AS
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
  a.nail_notes,
  a.source
FROM       appointments  a
JOIN clients      c ON c.id  = a.client_id
JOIN slots        s ON s.id  = a.slot_id;

REVOKE ALL ON bookings_view FROM anon, authenticated;
GRANT  SELECT ON bookings_view TO service_role;
