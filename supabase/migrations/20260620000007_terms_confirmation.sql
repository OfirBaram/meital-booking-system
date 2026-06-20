-- Migration: 20260620000007_terms_confirmation
-- Adds terms_confirmed_at to appointments + exposes it in bookings_view.
-- Enables the WhatsApp terms-acknowledgement flow:
--   1. Admin approves → notify.ts sends terms message + sets
--      whatsapp_conversations.state = 'awaiting_terms'
--   2. Client sends "1" → chat-handler stamps terms_confirmed_at + clears state.

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS terms_confirmed_at TIMESTAMPTZ;

-- Update bookings_view to include source + terms_confirmed_at (supersedes 20260620000006)
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
  a.terms_confirmed_at
FROM       appointments  a
JOIN clients      c ON c.id  = a.client_id
JOIN slots        s ON s.id  = a.slot_id;

REVOKE ALL ON bookings_view FROM anon, authenticated;
GRANT  SELECT ON bookings_view TO service_role;
