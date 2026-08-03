-- ─────────────────────────────────────────────────────────────────────────────
-- chat_conversations — transcripts of the WEBSITE chat.
--
-- Until now the web channel of chat-handler was entirely stateless: it answered
-- and forgot. There was no server-side record anywhere of what visitors ask the
-- bot, so "what do people want to know?" was unanswerable and there was no way
-- to tell a good answer from a bad one.
--
-- Deliberately a separate table from whatsapp_conversations: that one is keyed
-- on `phone` (PRIMARY KEY), which a web visitor does not have. Here the key is
-- the same `session_id` the analytics pipeline already uses (sessionStorage
-- 'mn_sid'), which is what lets a transcript be joined to the site_events funnel
-- for the same visit — what she asked, where she came from, whether she went on
-- to WhatsApp.
--
-- PRIVACY: message text is redacted before it ever reaches this table (see
-- _shared/redact.ts) — phone numbers and e-mail addresses are replaced with
-- placeholders. Rows are purged after 90 days by cleanup_old_whatsapp_data(),
-- matching every other table here that holds personal data.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  session_id     TEXT         PRIMARY KEY,
  history        JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{role,content}] redacted
  message_count  INTEGER      NOT NULL DEFAULT 0,            -- user turns only
  page           TEXT,
  referrer       TEXT,
  device         TEXT,
  country        TEXT,                                        -- from the edge, when available
  first_seen     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT chat_conv_history_is_array CHECK (jsonb_typeof(history) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_last_seen ON public.chat_conversations (last_seen DESC);

-- RLS on with NO policies: service_role only, exactly like whatsapp_conversations
-- and site_events. The web channel runs on the anon key, so the write must go
-- through a service-role client inside the Edge Function — anon cannot reach this.
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_conversations FROM anon, authenticated;

COMMENT ON TABLE public.chat_conversations IS
  'Website chat transcripts, keyed by analytics session_id. Text is PII-redacted at write time. Purged after 90 days.';

-- ── Topic classification ─────────────────────────────────────────────────────
-- Deliberately regex, not an LLM: this runs over every stored turn on every
-- dashboard load, it must be free and deterministic, and the categories are the
-- same closed set the FAQ engine already recognises. Hebrew is matched without
-- anchors because the questions arrive as free text.
CREATE OR REPLACE FUNCTION public.classify_chat_topic(msg TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN msg ~ 'מחיר|עולה|כמה זה|תעריף|כסף|price|cost'                      THEN 'מחיר'
    WHEN msg ~ 'פנוי|זמין|מתי אפשר|תור|לקבוע|להזמין|appointment|book'        THEN 'זמינות ותורים'
    WHEN msg ~ 'איפה|כתובת|מיקום|להגיע|חניה|ניווט|where|address|parking'     THEN 'מיקום'
    WHEN msg ~ 'שעות|פתוח|סגור|מתי את עובדת|hours|open'                      THEN 'שעות פעילות'
    WHEN msg ~ 'גבות|שפם|ווקס|brows|wax'                                     THEN 'גבות ושפם'
    WHEN msg ~ 'ג''ל|לק|ציפורנ|מניקור|שירות|טיפול|gel|nail|manicure'         THEN 'שירותים'
    WHEN msg ~ 'תשלום|אשראי|מזומן|ביט|פייבוקס|payment|cash'                  THEN 'תשלום'
    WHEN msg ~ 'ביטול|לבטל|לשנות|להזיז|cancel|reschedule'                    THEN 'ביטול ושינוי'
    WHEN msg ~ 'כמה מחזיק|מתקלף|תחזוקה|אחרי הטיפול|care'                     THEN 'תחזוקה ועמידות'
    ELSE 'אחר'
  END;
$$;

-- ── Reporting views ──────────────────────────────────────────────────────────
-- What people actually ask, most-asked first.
CREATE OR REPLACE VIEW public.chat_topics AS
SELECT
  public.classify_chat_topic(turn->>'content')  AS topic,
  count(*)                                       AS questions,
  count(DISTINCT c.session_id)                   AS sessions,
  max(c.last_seen)                               AS last_asked
FROM public.chat_conversations c
CROSS JOIN LATERAL jsonb_array_elements(c.history) AS turn
WHERE turn->>'role' = 'user'
GROUP BY 1
ORDER BY 2 DESC;

-- One row per day: volume, depth, and how many conversations were one-and-done.
CREATE OR REPLACE VIEW public.chat_daily AS
SELECT
  (first_seen AT TIME ZONE 'Asia/Jerusalem')::date       AS day,
  count(*)                                                AS conversations,
  sum(message_count)                                      AS messages,
  round(avg(message_count), 1)                            AS avg_messages,
  count(*) FILTER (WHERE message_count = 1)               AS single_question,
  count(*) FILTER (WHERE device = 'mobile')               AS mobile
FROM public.chat_conversations
GROUP BY 1
ORDER BY 1 DESC;

ALTER VIEW public.chat_topics SET (security_invoker = true);
ALTER VIEW public.chat_daily  SET (security_invoker = true);
REVOKE ALL ON public.chat_topics FROM anon, authenticated;
REVOKE ALL ON public.chat_daily  FROM anon, authenticated;

-- ── Retention ────────────────────────────────────────────────────────────────
-- Extends the existing nightly job (pg_cron 'cleanup-old-whatsapp-data', 03:30)
-- rather than adding a second schedule. site_events is added at the same time:
-- it had NO retention at all and was growing without bound.
CREATE OR REPLACE FUNCTION public.cleanup_old_whatsapp_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv integer;
  v_sup  integer;
  v_chat integer;
  v_evt  integer;
BEGIN
  DELETE FROM public.whatsapp_conversations
   WHERE last_inbound_at < now() - interval '90 days';
  GET DIAGNOSTICS v_conv = ROW_COUNT;

  DELETE FROM public.support_requests
   WHERE status = 'resolved' AND resolved_at < now() - interval '90 days';
  GET DIAGNOSTICS v_sup = ROW_COUNT;

  DELETE FROM public.chat_conversations
   WHERE last_seen < now() - interval '90 days';
  GET DIAGNOSTICS v_chat = ROW_COUNT;

  -- Analytics events are not personal data, but the table is append-only on
  -- every page view and nothing purged it. A year is plenty for trend reporting.
  DELETE FROM public.site_events
   WHERE created_at < now() - interval '365 days';
  GET DIAGNOSTICS v_evt = ROW_COUNT;

  IF v_conv > 0 OR v_sup > 0 OR v_chat > 0 OR v_evt > 0 THEN
    RAISE LOG 'cleanup_old_whatsapp_data: % conversations, % tickets, % chats, % events purged',
      v_conv, v_sup, v_chat, v_evt;
  END IF;
  RETURN v_conv + v_sup + v_chat + v_evt;
END;
$$;
