-- ================================================================
-- Migration: 20260616000000_client_portal
-- Self-service client portal:
--   1. reschedule_count + last_rescheduled_at on appointments
--   2. New communication_logs contexts (ClientSelfCancel, ClientReschedule)
--   3. swap_slot_for_reschedule() atomic RPC
-- ================================================================

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reschedule_count    INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_rescheduled_at TIMESTAMPTZ;

ALTER TABLE communication_logs
  DROP CONSTRAINT IF EXISTS comm_logs_context_check;

ALTER TABLE communication_logs
  ADD CONSTRAINT comm_logs_context_check CHECK (
    context IN (
      'OTP', 'AdminNotify',
      'ClientApproval', 'ClientRejection', 'ClientCancellation',
      'DailyReminder',
      'ClientSelfCancel', 'ClientReschedule'
    )
  );

-- Atomic slot-swap for client reschedule.
-- Locks new slot first (fail fast if taken), then appointment row.
CREATE OR REPLACE FUNCTION swap_slot_for_reschedule(
  p_appointment_id UUID,
  p_old_slot_id    BIGINT,
  p_new_slot_id    BIGINT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_status       TEXT;
  v_appt_status      TEXT;
  v_appt_slot_id     BIGINT;
  v_reschedule_count INT;
BEGIN
  SELECT status INTO v_new_status
  FROM   slots WHERE id = p_new_slot_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'new_slot_not_found');
  END IF;
  IF v_new_status <> 'available' THEN
    RETURN json_build_object('success', false, 'error', 'new_slot_not_available', 'status', v_new_status);
  END IF;

  SELECT status, slot_id, reschedule_count
  INTO   v_appt_status, v_appt_slot_id, v_reschedule_count
  FROM   appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'appointment_not_found');
  END IF;
  IF v_appt_status NOT IN ('pending', 'approved') THEN
    RETURN json_build_object('success', false, 'error', 'appointment_not_active');
  END IF;
  IF v_reschedule_count >= 1 THEN
    RETURN json_build_object('success', false, 'error', 'reschedule_limit_reached');
  END IF;
  IF v_appt_slot_id <> p_old_slot_id THEN
    RETURN json_build_object('success', false, 'error', 'slot_mismatch');
  END IF;

  UPDATE slots SET status = 'available', last_updated = now() WHERE id = p_old_slot_id;
  UPDATE slots
  SET    status       = CASE WHEN v_appt_status = 'approved' THEN 'booked' ELSE 'pending' END,
         last_updated = now()
  WHERE  id = p_new_slot_id;
  UPDATE appointments
  SET    slot_id            = p_new_slot_id,
         reschedule_count   = reschedule_count + 1,
         last_rescheduled_at = now()
  WHERE  id = p_appointment_id;

  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION swap_slot_for_reschedule(UUID, BIGINT, BIGINT) TO service_role;
