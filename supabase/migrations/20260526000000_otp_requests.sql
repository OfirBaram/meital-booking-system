-- ================================================================
-- Migration: 20260526000000_otp_requests
-- Adds otp_requests table (replaces GAS CacheService for OTP storage)
-- and lookup_slot_by_date_time() helper.
-- Used exclusively by the send-otp and verify-and-book Edge Functions.
-- ================================================================

CREATE TABLE otp_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT        NOT NULL,
  otp_hash    TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by phone for rate-limit and OTP validation queries
CREATE INDEX idx_otp_requests_phone ON otp_requests (phone, created_at DESC);

-- Service-role only; no direct client access
REVOKE ALL ON otp_requests FROM anon, authenticated;

-- ----------------------------------------------------------------
-- lookup_slot_by_date_time
-- Finds an available slot matching a Jerusalem-local date + time.
-- Returns slot id, or NULL if none found.
-- Called by verify-and-book before lock_slot_for_booking.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION lookup_slot_by_date_time(
  p_date TEXT,
  p_time TEXT
)
RETURNS BIGINT
LANGUAGE sql
STABLE
AS $$
  SELECT id
  FROM   slots
  WHERE  DATE(start_time AT TIME ZONE 'Asia/Jerusalem') = p_date::date
    AND  TO_CHAR(start_time AT TIME ZONE 'Asia/Jerusalem', 'HH24:MI') = p_time
    AND  status = 'available'
  LIMIT 1
$$;
