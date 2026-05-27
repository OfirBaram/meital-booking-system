-- ================================================================
-- Migration: 20260533000000_grant_rpc_execute
--
-- Recreates change_appointment_status (was missing from live DB
-- despite migration 20260525 being recorded as applied) and grants
-- EXECUTE on all custom RPCs to service_role so PostgREST exposes
-- them via supabase.rpc().
-- ================================================================

-- Recreate the function (idempotent via CREATE OR REPLACE)
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
    (v_current_status = 'pending'  AND p_new_status IN ('approved', 'rejected')) OR
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

-- Grant EXECUTE to service_role for all custom RPCs
GRANT EXECUTE ON FUNCTION public.change_appointment_status(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_slot_for_booking(TEXT)           TO service_role;
GRANT EXECUTE ON FUNCTION public.lookup_slot_by_date_time(TEXT, TEXT)  TO service_role;

-- Trigger PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
