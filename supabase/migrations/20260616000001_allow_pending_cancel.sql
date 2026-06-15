-- Extend change_appointment_status state machine:
-- allow pending → cancelled (client self-cancel before admin approval).
-- Slot release logic is already correct: ELSE 'available' covers this path.
CREATE OR REPLACE FUNCTION public.change_appointment_status(
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
  SELECT status, slot_id
  INTO   v_current_status, v_slot_id
  FROM   appointments
  WHERE  id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'booking_not_found');
  END IF;

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

  UPDATE slots
  SET    status       = CASE WHEN p_new_status = 'approved' THEN 'booked' ELSE 'available' END,
         last_updated = now()
  WHERE  id = v_slot_id;

  RETURN json_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', 'internal_error');
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_appointment_status(UUID, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
