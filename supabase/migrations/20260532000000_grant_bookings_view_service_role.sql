-- ================================================================
-- Migration: 20260532000000_grant_bookings_view_service_role
--
-- The bookings_view from 20260524000000 exists in the migration log
-- but not in the live database (was dropped via the dashboard).
-- Additionally, the original migration never granted SELECT to
-- service_role, so PostgREST excluded it from its schema cache —
-- causing the list-bookings Edge Function to return HTTP 500 even
-- after the view is recreated.
--
-- This migration:
--   1. Recreates the view (idempotent via CREATE OR REPLACE)
--   2. Revokes direct REST access from anon/authenticated
--   3. Grants SELECT to service_role so PostgREST sees it
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
JOIN       clients       c ON c.id = a.client_id
JOIN       slots         s ON s.id = a.slot_id;

-- Block direct REST/anon access; Edge Function reads via service-role only.
REVOKE ALL ON bookings_view FROM anon, authenticated;

-- Service-role must have SELECT so PostgREST includes it in the schema cache.
GRANT SELECT ON bookings_view TO service_role;
