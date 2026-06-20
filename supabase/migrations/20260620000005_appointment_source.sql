-- ================================================================
-- appointments.source — which channel created the booking ('web' | 'whatsapp').
-- Nullable: existing rows + web bookings stay NULL (= web/legacy). This is the
-- glue for channel-aware notifications/reminders (send the approval / 24h reminder
-- back on the channel the customer actually booked from).
-- ================================================================
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS source TEXT;
