-- ================================================================
-- support_requests — tickets the bot opens when it cannot resolve a
-- request itself. Meital triages/resolves them in the admin console;
-- resolving notifies the client (see admin-support Edge Function).
-- PII (phone + chat snapshot) -> RLS on, NO policies -> service_role only.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.support_requests (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                TEXT,                                    -- E.164; null if unknown (e.g. web)
  client_id            UUID         REFERENCES public.clients(id) ON DELETE SET NULL,
  reason               TEXT         NOT NULL DEFAULT '',        -- short summary for Meital
  snapshot             JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- recent [{role,content}] turns
  status               TEXT         NOT NULL DEFAULT 'open',
  resolved_at          TIMESTAMPTZ,
  resolved_notified_at TIMESTAMPTZ,                            -- set once the client has been told
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT support_status_check   CHECK (status IN ('open', 'resolved')),
  CONSTRAINT support_snapshot_array CHECK (jsonb_typeof(snapshot) = 'array')
);

-- Admin console lists open tickets first; partial index keeps that read cheap.
CREATE INDEX IF NOT EXISTS idx_support_open
  ON public.support_requests (created_at)
  WHERE status = 'open';

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;  -- service_role only

CREATE OR REPLACE FUNCTION public.touch_support_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_support_touch ON public.support_requests;
CREATE TRIGGER trg_support_touch
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_updated_at();

-- Allow logging the resolution notice without breaking the context CHECK.
ALTER TABLE communication_logs DROP CONSTRAINT IF EXISTS comm_logs_context_check;
ALTER TABLE communication_logs ADD CONSTRAINT comm_logs_context_check CHECK (
  context IN (
    'OTP', 'AdminNotify',
    'ClientApproval', 'ClientRejection', 'ClientCancellation',
    'DailyReminder',
    'ClientSelfCancel', 'ClientReschedule',
    'SupportResolved'
  )
);
