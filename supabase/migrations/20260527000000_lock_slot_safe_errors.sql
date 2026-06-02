-- ================================================================
-- Migration: 20260527000000_lock_slot_safe_errors
--
-- Phase 5 hardening: lock_slot_for_booking no longer returns raw
-- SQLERRM to the client. Known exception classes are mapped to
-- typed error codes; the original message stays server-side via
-- RAISE WARNING so debugging is still possible from Postgres logs.
--
-- Replaces the EXCEPTION WHEN OTHERS branch in the initial schema
-- (20260522000000) which leaked Postgres internals (constraint
-- names, table names, the literal SQL text) to any RPC caller.
-- ================================================================

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

EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING '[lock_slot_for_booking] unique_violation: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'booking_id_exists');

  WHEN foreign_key_violation THEN
    RAISE WARNING '[lock_slot_for_booking] foreign_key_violation: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'invalid_reference');

  WHEN check_violation THEN
    RAISE WARNING '[lock_slot_for_booking] check_violation: %', SQLERRM;
    RETURN json_build_object('success', false, 'error', 'invalid_input');

  WHEN OTHERS THEN
    RAISE WARNING '[lock_slot_for_booking] unexpected [%]: %', SQLSTATE, SQLERRM;
    RETURN json_build_object('success', false, 'error', 'internal_error');
END;
$$;
