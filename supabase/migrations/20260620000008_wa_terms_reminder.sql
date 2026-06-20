-- Migration: 20260620000008_wa_terms_reminder
-- Tracks how many terms reminders were sent per WhatsApp conversation.
-- Used by wa-terms-reminder Edge Function to avoid spamming clients.

ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS terms_reminder_count    INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terms_reminder_sent_at  TIMESTAMPTZ;

-- View for admin: conversations still awaiting terms confirmation
CREATE OR REPLACE VIEW wa_terms_pending AS
SELECT
  wc.phone,
  c.full_name                                          AS client_name,
  wc.terms_reminder_count,
  wc.terms_reminder_sent_at,
  wc.last_inbound_at,
  a.id                                                 AS appointment_id,
  initcap(a.status)                                    AS appointment_status,
  to_char(s.start_time AT TIME ZONE 'Asia/Jerusalem', 'YYYY-MM-DD HH24:MI') AS appointment_time
FROM whatsapp_conversations wc
LEFT JOIN clients      c  ON c.phone = wc.phone
LEFT JOIN appointments a  ON a.client_id = c.id
                          AND a.status IN ('pending','approved')
                          AND a.terms_confirmed_at IS NULL
                          AND a.source = 'whatsapp'
LEFT JOIN slots        s  ON s.id = a.slot_id
WHERE wc.state = 'awaiting_terms';

GRANT SELECT ON wa_terms_pending TO service_role;
