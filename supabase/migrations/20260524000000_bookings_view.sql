-- ================================================================
-- Migration: 20260524000000_bookings_view
-- Adds bookings_view — denormalized read model for the admin
-- dashboard. Consumed only by the list-bookings Edge Function
-- via the service-role key; no public/anon/authenticated access.
-- ================================================================

CREATE OR REPLACE VIEW bookings_view AS
SELECT
  a.id,
  c.full_name                                                        AS name,
  c.phone,
  a.treatment_type                                                   AS service,
  a.treatment_name                                                   AS "serviceName",
  to_char(s.start_time AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD') AS date,
  to_char(s.start_time AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI')    AS time,
  initcap(a.status)                                                  AS status,
  s.start_time                                                       AS timestamp,
  a.duration_min                                                     AS duration,
  a.admin_token,
  a.calendar_event_id
FROM       appointments  a
JOIN clients      c ON c.id  = a.client_id
JOIN slots        s ON s.id  = a.slot_id;

-- Prevent direct REST/anon access; Edge Function uses service-role.
REVOKE ALL ON bookings_view FROM anon, authenticated;
