-- ================================================================
-- Meital Boutique Booking — WhatsApp conversation state
-- Migration: 20260620000000_whatsapp_conversations
-- ----------------------------------------------------------------
-- Per-conversation state for the WhatsApp channel. Loaded/saved by
-- chat-handler when transport = whatsapp. Twilio delivers a single
-- inbound message with NO history, so the server holds it here.
--
-- pending_slot_id + pending_expires_at back the autonomy "reaper":
-- a slot the bot tentatively holds is released if the client does
-- not confirm in time.
--
-- PII (phone + full chat history) -> RLS on, NO policies -> only the
-- service_role (which bypasses RLS) can read/write. anon is blocked.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  phone               TEXT         PRIMARY KEY,                  -- E.164, normalized ('whatsapp:' stripped)
  client_id           UUID         REFERENCES public.clients(id) ON DELETE SET NULL,
  history             JSONB        NOT NULL DEFAULT '[]'::jsonb, -- [{role,content}] - last N turns
  state               TEXT,                                     -- optional intent/FSM label
  pending_slot_id     BIGINT       REFERENCES public.slots(id)  ON DELETE SET NULL,
  pending_expires_at  TIMESTAMPTZ,                              -- reaper releases the held slot after this
  last_msg_sid        TEXT,                                     -- Twilio MessageSid - retry/idempotency dedupe
  last_inbound_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),      -- WhatsApp 24h-window tracking
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT wa_conv_history_is_array CHECK (jsonb_typeof(history) = 'array')
);

-- Reaper lookup: only conversations holding a slot that may expire (partial index - cheap).
CREATE INDEX IF NOT EXISTS idx_wa_conv_pending_expiry
  ON public.whatsapp_conversations (pending_expires_at)
  WHERE pending_slot_id IS NOT NULL;

-- Lookup by linked client (admin views / cross-channel reconciliation).
CREATE INDEX IF NOT EXISTS idx_wa_conv_client_id
  ON public.whatsapp_conversations (client_id);

-- RLS: NO policies created -> only service_role (bypasses RLS) can access. anon fully blocked.
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

-- Keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION public.touch_wa_conv_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conv_touch ON public.whatsapp_conversations;
CREATE TRIGGER trg_wa_conv_touch
  BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_wa_conv_updated_at();
