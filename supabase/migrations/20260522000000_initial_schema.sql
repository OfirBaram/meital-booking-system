-- ================================================================
-- Meital Boutique Booking - Supabase Initial Schema
-- Migration: 20260522000000_initial_schema
-- ================================================================

-- ----------------------------------------------------------------
-- 1. slots
--    One row per bookable time window.
--    start_time stored UTC; displayed in Jerusalem tz by the app.
--    UNIQUE on start_time prevents double-booking at the DB level
--    and is the ON CONFLICT key used by the migration importer.
-- ----------------------------------------------------------------
CREATE TABLE slots (
  id           BIGSERIAL    PRIMARY KEY,
  start_time   TIMESTAMPTZ  NOT NULL,
  end_time     TIMESTAMPTZ  NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'available',
  last_updated TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT slots_start_time_unique UNIQUE (start_time),
  CONSTRAINT slots_status_check CHECK (
    status IN ('available', 'pending', 'locked', 'booked', 'blocked')
  )
);

CREATE INDEX idx_slots_start_time ON slots (start_time);
CREATE INDEX idx_slots_status     ON slots (status);

-- ----------------------------------------------------------------
-- 2. clients
--    One row per unique phone number (E.164, e.g. +972501234567).
--    Created or upserted on every OTP send - no registration step.
-- ----------------------------------------------------------------
CREATE TABLE clients (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT         NOT NULL,
  full_name  TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT clients_phone_unique UNIQUE (phone)
);

CREATE INDEX idx_clients_phone ON clients (phone);

-- ----------------------------------------------------------------
-- 3. appointments
--    One row per booking that passed OTP verification.
--    id is a UUID generated client-side (crypto.randomUUID) and
--    sent in the booking payload - it becomes the primary key.
--    admin_token: HMAC-SHA256 hex used for approve/reject URLs.
-- ----------------------------------------------------------------
CREATE TABLE appointments (
  id                 UUID         PRIMARY KEY,
  client_id          UUID         NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  slot_id            BIGINT       NOT NULL REFERENCES slots(id)    ON DELETE RESTRICT,
  treatment_type     TEXT         NOT NULL,
  treatment_name     TEXT         NOT NULL,
  duration_min       INTEGER      NOT NULL DEFAULT 90,
  is_verified        BOOLEAN      NOT NULL DEFAULT false,
  status             TEXT         NOT NULL DEFAULT 'pending',
  admin_token        TEXT,
  calendar_event_id  TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT appointments_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT appointments_treatment_check CHECK (
    treatment_type IN ('gel_classic', 'gel_feet')
  )
);

CREATE INDEX idx_appointments_client_id ON appointments (client_id);
CREATE INDEX idx_appointments_slot_id   ON appointments (slot_id);
CREATE INDEX idx_appointments_status    ON appointments (status);

-- ----------------------------------------------------------------
-- 4. communication_logs
--    Audit trail for every SMS sent (or attempted).
--    appointment_id nullable - OTP messages have no appointment yet.
-- ----------------------------------------------------------------
CREATE TABLE communication_logs (
  id               BIGSERIAL    PRIMARY KEY,
  appointment_id   UUID         REFERENCES appointments(id) ON DELETE SET NULL,
  channel          TEXT         NOT NULL DEFAULT 'sms',
  recipient_phone  TEXT         NOT NULL,
  context          TEXT         NOT NULL,
  status           TEXT         NOT NULL,
  message_body     TEXT         NOT NULL DEFAULT '',
  detail           TEXT         NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT comm_logs_status_check CHECK (
    status IN ('SENT', 'MOCK', 'ERROR')
  ),
  CONSTRAINT comm_logs_context_check CHECK (
    context IN ('OTP', 'AdminNotify', 'ClientApproval', 'ClientRejection',
                'ClientCancellation', 'DailyReminder')
  )
);

CREATE INDEX idx_comm_logs_appointment_id ON communication_logs (appointment_id);
CREATE INDEX idx_comm_logs_created_at     ON communication_logs (created_at);

-- ----------------------------------------------------------------
-- 5. lock_slot_for_booking  (atomic RPC)
--    Replaces the GAS LockService pattern.
--    SELECT FOR UPDATE locks the slot row for the transaction -
--    only one winner per slot, no race condition.
--    Returns JSON: { "success": true/false, "error": "..." }
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION lock_slot_for_booking(
  p_slot_id        BIGINT,
  p_client_id      UUID,
  p_booking_id     UUID,
  p_treatment_type TEXT,
  p_treatment_name TEXT,
  p_duration_min   INTEGER,
  p_admin_token    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot_status TEXT;
BEGIN
  SELECT status INTO v_slot_status
  FROM   slots
  WHERE  id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  IF v_slot_status <> 'available' THEN
    RETURN json_build_object(
      'success', false,
      'error',   'slot_not_available',
      'status',  v_slot_status
    );
  END IF;

  UPDATE slots
  SET    status = 'pending', last_updated = now()
  WHERE  id = p_slot_id;

  INSERT INTO appointments (
    id, client_id, slot_id,
    treatment_type, treatment_name, duration_min,
    is_verified, status, admin_token
  ) VALUES (
    p_booking_id, p_client_id, p_slot_id,
    p_treatment_type, p_treatment_name, p_duration_min,
    true, 'pending', p_admin_token
  );

  RETURN json_build_object('success', true, 'booking_id', p_booking_id);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
