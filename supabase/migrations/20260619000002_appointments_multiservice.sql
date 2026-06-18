-- ================================================================
-- Migration: 20260619000002_appointments_multiservice
-- Multi-service bookings. A booking may now contain 1..N services.
--   service_ids       JSONB  — ['gel_hands','regular_feet']
--   services_summary  TEXT   — '💅 לק ג''ל + 🦶 לק רגיל (90 דק'')'
--
-- treatment_type / treatment_name remain for backward compat:
--   treatment_type = service_ids[0]  (primary)
--   treatment_name = services_summary (display)
--
-- The treatment_type CHECK constraint is dropped — service ids are
-- now dynamic (admin can create any service), so a fixed enum no
-- longer holds. Integrity is enforced by the services table + the
-- Edge Function instead.
-- ================================================================

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_treatment_check;
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_treatment_type_check;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_ids      JSONB;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS services_summary TEXT;

-- Backfill existing rows: single-service array + summary from name.
UPDATE appointments
SET    service_ids = jsonb_build_array(treatment_type)
WHERE  service_ids IS NULL AND treatment_type IS NOT NULL;

UPDATE appointments
SET    services_summary = treatment_name
WHERE  services_summary IS NULL AND treatment_name IS NOT NULL;
