-- ================================================================
-- Migration: 20260609000000_fix_pending_cancel_transition
--
-- BUG: pending → cancelled was not a valid transition in the
-- change_appointment_status() state machine.  When admin cancelled
-- a Pending booking the RPC returned invalid_transition and the
-- appointment stayed 'pending' in the DB.  check-active-booking
-- then found the stale row and blocked the customer from re-booking.
--
-- FIX: add pending → cancelled to the allowed transitions.
-- Slot behaviour is already correct for this path: the CASE in the
-- UPDATE already releases any non-approved status back to 'available',
-- so a locked slot is properly freed when a pending booking is
-- cancelled.
-- ================================================================

CREATE OR REPLACE FUNCTION change_appointment_status(
  p_booking_id UUID,
  p_new_status TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_slot_id        BIGINT;
BEGIN
  -- Lock the appointment row for the duration of this transaction.
  SELECT status, slot_id
  INTO   v_current_status, v_slot_id
  FROM   appointments
  WHERE  id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  -- State machine: only these transitions are permitted.
  --   pending  -> approved | rejected | cancelled
  --   approved -> cancelled
  IF NOT (
    (v_current_status = 'pending'  AND p_new_status IN ('approved', 'rejected', 'cancelled')) OR
    (v_current_status = 'approved' AND p_new_status = 'cancelled')
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error',   'invalid_transition',
      'from',    v_current_status,
      'to',      p_new_status
    );
  END IF;

  UPDATE appointments
  SET    status = p_new_status
  WHERE  id     = p_booking_id;

  -- approved locks the slot; rejected/cancelled releases it back to available.
  UPDATE slots
  SET    status       = CASE WHEN p_new_status = 'approved' THEN 'booked' ELSE 'available' END,
         last_updated = now()
  WHERE  id = v_slot_id;

  RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'internal_error');
END;
$$;
