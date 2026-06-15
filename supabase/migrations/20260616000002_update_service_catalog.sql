-- Migration: update treatment_type CHECK constraint to new service catalog
-- Old services: gel_classic (90m), gel_feet (120m)
-- New services: gel_hands (60m), regular_feet (30m), gel_combo (90m)
-- Legacy IDs kept in constraint so historical appointment rows remain valid.

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_treatment_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_treatment_type_check
  CHECK (treatment_type IN (
    'gel_hands',
    'regular_feet',
    'gel_combo',
    'gel_classic',   -- legacy: existing bookings in DB
    'gel_feet'       -- legacy: existing bookings in DB
  ));

-- Update feature_flags description if it references old service names (optional)
-- No data migration needed — display names are resolved at read-time from frontend maps
