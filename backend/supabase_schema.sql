-- ═══════════════════════════════════════════════════════════════
-- Meital Boutique Booking — Supabase PostgreSQL Schema
-- Run in Supabase Dashboard → SQL Editor (idempotent, safe to re-run)
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── clients ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      TEXT        NOT NULL UNIQUE,          -- E.164, e.g. +972521234567
  full_name  TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);

-- ── slots ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS slots (
  id           BIGSERIAL   PRIMARY KEY,
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'available'
                           CHECK (status IN ('available','locked','booked','blocked','cancelled')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT slots_time_order CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_slots_status_start ON slots(status, start_time);
CREATE INDEX IF NOT EXISTS idx_slots_start_time   ON slots(start_time);

-- ── appointments ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id         UUID        NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  slot_id           BIGINT      NOT NULL REFERENCES slots(id)    ON DELETE RESTRICT,
  treatment_type    TEXT        NOT NULL,                        -- e.g. gel_classic
  treatment_name    TEXT        NOT NULL,                        -- Hebrew display name
  duration_min      INT         NOT NULL DEFAULT 90,
  otp_code          TEXT,                                        -- cleared after verification
  is_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_token       TEXT,                                        -- HMAC-SHA256 for approve/reject links
  calendar_event_id TEXT,                                        -- Google Calendar event ID
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_slot   ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- Auto-bump updated_at on every UPDATE
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS appointments_updated_at ON appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ── communication_logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS communication_logs (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id  UUID        REFERENCES appointments(id) ON DELETE SET NULL,
  channel         TEXT        NOT NULL DEFAULT 'sms'
                              CHECK (channel IN ('sms','whatsapp')),
  recipient_phone TEXT        NOT NULL,
  context         TEXT        NOT NULL,  -- OTP / AdminNotify / ClientApproval / etc.
  status          TEXT        NOT NULL
                              CHECK (status IN ('SENT','MOCK','ERROR','SKIPPED')),
  message_body    TEXT,
  detail          TEXT,                  -- Twilio SID on success; error message on failure
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comm_logs_appointment ON communication_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_comm_logs_created     ON communication_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Atomic slot booking
-- Uses SELECT FOR UPDATE inside a single PostgreSQL transaction —
-- exactly one concurrent caller wins; all others receive slot_not_available.
-- Called by GAS handleVerifyAndBookV2 via SupabaseService.rpc().
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION lock_slot_for_booking(
  p_slot_id        BIGINT,
  p_client_id      UUID,
  p_booking_id     UUID,
  p_treatment_type TEXT,
  p_treatment_name TEXT,
  p_duration_min   INT,
  p_admin_token    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_status TEXT;
BEGIN
  -- Row-level lock: concurrent callers queue here until the winner commits
  SELECT status INTO v_status
  FROM   slots
  WHERE  id = p_slot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  IF v_status <> 'available' THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_available', 'current', v_status);
  END IF;

  UPDATE slots
  SET    status = 'locked', last_updated = NOW()
  WHERE  id = p_slot_id;

  INSERT INTO appointments (
    id, client_id, slot_id,
    treatment_type, treatment_name, duration_min,
    is_verified, status, admin_token
  ) VALUES (
    p_booking_id, p_client_id, p_slot_id,
    p_treatment_type, p_treatment_name, p_duration_min,
    TRUE, 'pending', p_admin_token
  );

  RETURN json_build_object('success', true, 'booking_id', p_booking_id, 'slot_id', p_slot_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- RPC: Release a locked slot (rejection / OTP timeout)
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION release_slot(p_slot_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE slots
  SET    status = 'available', last_updated = NOW()
  WHERE  id = p_slot_id AND status IN ('locked', 'cancelled');

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'slot_not_releasable');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- New Script Properties required in GAS (in addition to existing ones):
--   SUPABASE_URL  — https://<project-ref>.supabase.co
--   SUPABASE_KEY  — service_role key (keep secret; never in frontend)
-- ═══════════════════════════════════════════════════════════════════
