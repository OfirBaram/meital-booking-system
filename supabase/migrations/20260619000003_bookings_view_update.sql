-- ================================================================
-- Migration: 20260619000003_bookings_view_update
-- Surface service_ids + services_summary on bookings_view so the
-- admin dashboard, SMS functions and reminders can show the full
-- multi-service description. serviceName falls back to
-- treatment_name when a legacy row has no services_summary.
--
-- New columns are appended at the END: CREATE OR REPLACE VIEW
-- cannot insert/reorder columns mid-list.
-- ================================================================

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
  a.service_ids
FROM       appointments  a
JOIN clients      c ON c.id  = a.client_id
JOIN slots        s ON s.id  = a.slot_id;

REVOKE ALL ON bookings_view FROM anon, authenticated;
GRANT  SELECT ON bookings_view TO service_role;
