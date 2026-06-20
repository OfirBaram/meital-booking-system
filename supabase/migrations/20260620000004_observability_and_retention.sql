-- ================================================================
-- Observability + Data-retention (Bulletproof phase)
--   1. allow 'BotLatency' rows in communication_logs (per-message timing metric)
--   2. cleanup_old_whatsapp_data(): purge conversations + resolved tickets >90d
--      (privacy / PII hygiene), scheduled daily via pg_cron.
-- ================================================================

-- 1. Observability context -------------------------------------------------
ALTER TABLE communication_logs DROP CONSTRAINT IF EXISTS comm_logs_context_check;
ALTER TABLE communication_logs ADD CONSTRAINT comm_logs_context_check CHECK (
  context IN (
    'OTP', 'AdminNotify',
    'ClientApproval', 'ClientRejection', 'ClientCancellation',
    'DailyReminder',
    'ClientSelfCancel', 'ClientReschedule',
    'SupportResolved',
    'BotLatency'
  )
);

-- 2. Data-retention --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv integer;
  v_sup  integer;
BEGIN
  DELETE FROM public.whatsapp_conversations
   WHERE last_inbound_at < now() - interval '90 days';
  GET DIAGNOSTICS v_conv = ROW_COUNT;

  DELETE FROM public.support_requests
   WHERE status = 'resolved' AND resolved_at < now() - interval '90 days';
  GET DIAGNOSTICS v_sup = ROW_COUNT;

  IF v_conv > 0 OR v_sup > 0 THEN
    RAISE LOG 'cleanup_old_whatsapp_data: % conversations, % resolved tickets purged', v_conv, v_sup;
  END IF;
  RETURN v_conv + v_sup;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-old-whatsapp-data');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('cleanup-old-whatsapp-data', '30 3 * * *',
  $$ SELECT public.cleanup_old_whatsapp_data(); $$);
