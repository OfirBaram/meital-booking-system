-- Migration: update treatment_type CHECK constraint to new service catalog
-- Old services: gel_classic (90m), gel_feet (120m)
-- New services: gel_hands (60m), regular_feet (30m), gel_combo (90m)
-- Legacy IDs kept so historical appointment rows remain valid.

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_treatment_check;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_treatment_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_treatment_check
  CHECK (treatment_type IN (
    'gel_hands',
    'regular_feet',
    'gel_combo',
    'gel_classic',
    'gel_feet'
  ));

-- No data migration needed — display names resolved at read-time from frontend maps
