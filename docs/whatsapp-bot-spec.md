# WhatsApp Bot — Technical Design Spec
> מיטל שבע ברעם — לק ג'ל בוטיק | עדכון: 2026-06-20

---

## 1. ארכיטקטורה — תרשים

```
WhatsApp User
     │  (HTTPS POST, x-www-form-urlencoded)
Twilio API  →  X-Twilio-Signature
     │
chat-handler/index.ts  (Supabase Edge Function, Deno)
     │
     ├─ handleWhatsApp()
     │    ├─ verifyTwilioSignature()         _shared/twilio-webhook.ts
     │    ├─ per-phone rate limiter           8 req/60s, token bucket
     │    ├─ load whatsapp_conversations
     │    ├─ deduplication (MessageSid)
     │    ├─ media shortcuts (PRICE_RE / TERMS_RE)  →  twimlMedia()
     │    ├─ terms gate (state=awaiting_terms)
     │    ├─ identity gate (name-ask for new users)
     │    ├─ circuit breaker / health check
     │    ├─ runConversation()               _shared/bot-core.ts
     │    │    ├─ checkFaq()                 _shared/faq-engine.ts
     │    │    ├─ buildSystemPrompt()         _shared/bot-config.ts
     │    │    └─ Anthropic claude-haiku-4-5-20251001
     │    │         └─ TOOL_REGISTRY (7 tools)
     │    └─ persistConversation()  →  whatsapp_conversations
     │
     └─ handleWeb()  (anon key, no state)
          └─ runConversation() channel='web'
```

---

## 2. קבצי ליבה

| קובץ | תפקיד |
|---|---|
| `chat-handler/index.ts` | routing, auth, rate limit, FSM, transport |
| `_shared/bot-core.ts` | לולאת agentic (transport-free): LLM + tools |
| `_shared/bot-config.ts` | system prompt + 7 כלים + TOOL_REGISTRY |
| `_shared/faq-engine.ts` | 50+ כללי FAQ, zero-LLM, first-match |
| `_shared/whatsapp.ts` | maskPhone, scrubPhones, renderForWhatsApp, trimHistory |
| `_shared/circuit-breaker.ts` | circuit breaker (injectable clock) |
| `_shared/twilio-webhook.ts` | HMAC-SHA1 signature verification |
| `_shared/sms.ts` | sendTwilioSms / sendTwilioWhatsApp / Freeform |
| `_shared/messages.ts` | buildAdminNewBookingSms, buildAdminApprovalWhatsApp |
| `_shared/notify.ts` | sendAndLogSms (logs to communication_logs) |
| `_shared/client-auth.ts` | signClientSession (HMAC token) |
| `wa-terms-reminder/index.ts` | תזכורות תקנון (POST / daily piggyback) |

---

## 3. זרימת הודעה מלאה

```
1.  Twilio POST  →  rawBody (x-www-form-urlencoded)
2.  verifyTwilioSignature(authToken, url, params)
    FAIL → 403 forbidden  (Twilio does NOT retry non-2xx)
3.  Parse:  From → normalizeIsraeliPhone() → phone
            Body → bodyText (max 1000 chars)
            MessageSid → dedup key
4.  waAllowed(phone)  [8 req/60s per phone, token bucket, per-worker]
    DENY → twiml('קיבלתי כמה הודעות...')  [200 so Twilio won't retry]
5.  createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
6.  SELECT whatsapp_conversations WHERE phone=?
7.  Dedup: conv.last_msg_sid === messageSid → twiml('') [silent ack]
8.  Media shortcuts (zero LLM):
    PRICE_RE.test(body) + TWILIO_PRICES_MEDIA_URL  →  twimlMedia(prices)
    TERMS_RE.test(body) + TWILIO_TERMS_MEDIA_URL   →  twimlMedia(terms)
    [skipped if state=awaiting_terms]
9.  Terms gate: conv.state === 'awaiting_terms'
    '1' / קראתי / אשרתי  →  mark terms_confirmed_at, state=null, ack
    else  →  remind (no LLM)
10. Resolve client (conv.client_id or lookup by phone)
11. Identity gate:
    isNewUser + !clientName  →  greeting + ask for name
    nameAsked + valid body   →  upsert clients  [candidateName: strip \r\n\t]
12. breaker.isOpen() OR isDegraded()
    → ensureOpenTicket (deduped) + handover message
13. runConversation(messages, { supabase, channel:'whatsapp', phone, clientId, clientName })
    a. checkFaq(lastUser)  [early exit if not BOOKING_INTENT]
    b. buildSystemPrompt(svcRows, 'whatsapp', clientName)
    c. Anthropic loop max 3 turns, 600 tokens:
       end_turn  → return text
       tool_use  → TOOL_REGISTRY.get(name).execute(input, ctx)
14. breaker.recordSuccess() + recordLatency(supabase, phone, ms)
15. persistConversation()  [history trimmed to 20 turns]
16. twiml(renderForWhatsApp(reply))
```

---

## 4. FSM — מצבי שיחה

```
null (normal)
     │
     │  [admin approves WA booking → notify.ts sets state]
     ▼
awaiting_terms
     │
     ├─ [1 / קראתי / אשרתי]  →  null  (terms confirmed + mark DB)
     └─ [other text]           →  remind, no LLM  (stay in state)
```

---

## 5. כלי הבוט — TOOL_REGISTRY (7 כלים)

### check_availability  [web + WA]
```
input:  { days_ahead?: 1-60, day_of_week?: 0-6 }
output: { slots: [{date,time}][], count }
```
SELECT slots WHERE status='available', limit 15, Jerusalem tz day filter

### join_waitlist  [web + WA]
```
input:  { name, phone, service? }
output: { success, existing?, error? }
```
Calls waitlist-add Edge Function. **WA: phone = ctx.phone (verified), not model input**

### book_appointment  [WA only]
```
input:  { service_id, date, time, customer_name }
output: { success, confirmation?, error? }
```
Atomic try/finally flow:
1. validate (SVC_ID_RE + DATE_RE + TIME_RE)
2. resolve service (live catalogue / fallback)
3. lookup_slot_by_date_time RPC
4. check_gap_safety (if smart_scheduling flag on)
5. upsert client (phone = verified)
6. anti-abuse: max 3 pending per client
7. lock_slot_for_booking RPC  [slot held]
8. INSERT appointment (source='whatsapp', status='pending')
9. finally: if !committed → release slot
10. fire-and-forget: audit_log + admin SMS + admin WA approval links

### my_appointments  [WA only]
signClientSession(phone) → GET client-portal → { active, history }

### cancel_appointment  [WA only]
GET client-portal → active.id → POST client-cancel (48h policy enforced)

### reschedule_appointment  [WA only]
POST client-reschedule (max 1 per booking, 48h before)

### escalate_to_support  [WA only]
INSERT support_requests (identity from ctx, NOT from model)
Use for: complaints, refunds, special requests, explicit human request

---

## 6. Channel Access Control

| Channel | Supabase key | Tools available |
|---|---|---|
| web | anon | check_availability, join_waitlist |
| whatsapp | service_role | all 7 tools |

---

## 7. System Prompt — מבנה

```
1. SECURITY BOUNDARY  (always first — models prioritise start)
   forbidden: DB ops, secrets, impersonation, off-topic, cross-user data
   injection guard: only customer's own genuine request counts

2. PERSONA
   feminine voice — about herself AND to customer
   'אני / אצלי / הסטודיו שלי' — never 'אנחנו'

3. STUDIO CONTEXT  (dynamic per request)
   {{SERVICE_LIST}}  ← services table (fallback: DEFAULT_SERVICES)
   {{SVC_TOKENS}}   ← [SVC:id] chips
   {{SERVICE_IDS}}  ← valid IDs

4. LINK TOKENS   [WA] | [IG] | [SVC:...] | [BOOK:...]

5. OPERATIONAL RULES 1-16
   availability, booking flow, pricing redirect, gender,
   FOMO waitlist flow, no-slots flow, offense handling

6. WHATSAPP_CHANNEL_BLOCK  (WA only, appended last)
   no [BOOK]/[SVC] tokens on WA, book in-chat
   CLIENT_NAME injection (sanitized: strip \r\n\t<>\'\", max 50 chars)
   managing / cancelling / rescheduling instructions
   pending approval warning
```

**Prompt caching**: `cache_control: ephemeral` on system block → ~10% token cost on cache hit

---

## 8. FAQ Engine

File: `_shared/faq-engine.ts` — 50+ rules, first-match, zero LLM tokens

Active only when `!BOOKING_INTENT.test(lastUserMsg)`
BOOKING_INTENT pattern: תור / לקבוע / פנוי / זמינ / בטל / ביטול / לשנות / slot / cancel / reschedule...

| קטגוריה | כלול |
|---|---|
| safety / jailbreak | hack, inject, ignore instructions |
| greeting + thanks | היי / שלום / תודה |
| gift cards | שובר / גיפט קארד |
| no-service (strict) | בנייה / אקריל / extensions |
| services | מה קיים, פדיקור, הבדל לק/ג'ל |
| pricing | redirect to [WA] |
| location + hours | Hebrew + English |
| health | אלרגיה, הריון, הנקה, כאב |
| aftercare | כמה מחזיק, קלוף |
| Instagram | portfolio |

---

## 9. שכבות אבטחה

| שכבה | מנגנון |
|---|---|
| Transport auth | verifyTwilioSignature (HMAC-SHA1) |
| Rate limit WA | 8 req/60s per phone, token bucket |
| Rate limit web | 10 req/60s per IP |
| Deduplication | last_msg_sid |
| Identity WA | phone = Twilio-verified From field |
| Input gate web | validateMessages: alternation, role, length ≤1000, max 20 |
| candidateName | strip \r\n\t before DB upsert |
| clientName | strip \r\n\t<>\", max 50 before system prompt |
| Phone spoof | join_waitlist + escalate use ctx.phone, not model |
| Tool access | WHATSAPP_ONLY_TOOLS set withheld from web |
| DB injection | PostgREST parameterised queries only |
| TwiML XSS | xmlEscape() on all Message bodies |
| PII in logs | maskPhone (last 4) + scrubPhones on error strings |
| Secrets in logs | authToken / SERVICE_ROLE_KEY never logged |
| Off-topic guard | SECURITY BOUNDARY in system prompt |
| Data leakage | prompt rule: never reveal another person's data |
| Circuit breaker | 3 failures → human handover |
| WA_SKIP_SIG_CHECK | env-gated only, hardcode blocked by CI grep |

---

## 10. Observability

### Log grep patterns
```
[wa] inbound sid=...         every inbound message (masked phone)
[wa] signature rejected      forgery attempt
[wa] rate-limited phone=**** flood detection
[wa][CRITICAL] error-loop:   >5 failures/5min → wire an alert
[wa][CRITICAL] slow-brain    >10s LLM → wire an alert
[wa] handover                circuit breaker / degraded mode
[book_appointment] booked    new WA booking
[escalate_to_support]        support ticket opened
[chat-debug] ...             only when CHAT_DEBUG=true
```

### DB tables
| Table | תוכן |
|---|---|
| whatsapp_conversations | history, state, last_msg_sid, terms_reminder_* |
| support_requests | tickets (escalate + handover) |
| communication_logs | SMS/WA + BotLatency rows |
| audit_log | whatsapp_book + admin actions |

---

## 11. Resilience

**Circuit Breaker** (per-worker):
- 3 consecutive failures → OPEN (120s cooldown then half-open)
- OPEN: ensureOpenTicket (deduped) + handover message
- injectable clock → deterministic unit tests

**Error loop monitor** (per-worker):
- 5 errors / 5 min → `[wa][CRITICAL] error-loop` in logs

**Health check**: cached 60s, fail-OPEN (error → bot continues)

**Never 500 to Twilio**: all paths wrapped → twiml fallback

---

## 12. Terms Reminder

Function: `wa-terms-reminder` (POST) + piggybacked on `send-reminders` daily run

```
SELECT whatsapp_conversations
  WHERE state='awaiting_terms'
    AND terms_reminder_count < 2
    AND (last_reminder >20h ago OR never)
→ sendTwilioWhatsAppFreeform(phone, reminder_text, termsImageUrl)
→ UPDATE terms_reminder_count++, terms_reminder_sent_at=now()

terms_reminder_count >= 2 → admin SMS with overdue client names
```

---

## 13. סכמת DB (WhatsApp)

```sql
whatsapp_conversations (
  phone                   TEXT PRIMARY KEY,
  client_id               UUID REFERENCES clients(id),
  history                 JSONB,           -- [{role,content}] max 20 turns
  last_msg_sid            TEXT,            -- Twilio dedup
  last_inbound_at         TIMESTAMPTZ,
  state                   TEXT,            -- null | 'awaiting_terms'
  terms_reminder_count    INT DEFAULT 0,
  terms_reminder_sent_at  TIMESTAMPTZ
)

support_requests (
  id         UUID,
  phone      TEXT,
  client_id  UUID,
  reason     TEXT,    -- Hebrew summary for Meital
  snapshot   JSONB,   -- last 12 turns
  status     TEXT     -- 'open' | 'resolved'
)
```

---

## 14. Environment Variables

| Variable | שימוש |
|---|---|
| ANTHROPIC_API_KEY | LLM API |
| TWILIO_ACCOUNT_SID | Twilio API |
| TWILIO_AUTH_TOKEN | signature verification + SMS |
| TWILIO_FROM_NUMBER | SMS from number |
| TWILIO_WHATSAPP_FROM | WA from (whatsapp:+14155238886) |
| TWILIO_WEBHOOK_URL | exact URL in Twilio console |
| TWILIO_PRICES_MEDIA_URL | public URL — prices image |
| TWILIO_TERMS_MEDIA_URL | public URL — terms image |
| ADMIN_PHONE | מספר מיטל לאלרטים |
| HMAC_SECRET | client session + admin tokens |
| CHAT_DEBUG | 'true' = verbose logs (never in prod) |
| WA_SKIP_SIG_CHECK | 'true' = bypass sig (dev only, CI-blocked) |
| SUPABASE_URL | Supabase project URL |
| SUPABASE_ANON_KEY | web channel + tool sub-requests |
| SUPABASE_SERVICE_ROLE_KEY | WhatsApp channel |

---

## 15. מגבלות ידועות

| נושא | פרט |
|---|---|
| Rate limit / circuit breaker | per Deno worker — not shared across fleet |
| History | max 20 turns — long conversations lose early context |
| LLM turns | max 3 per message |
| Max reply | 600 tokens |
| Model | claude-haiku-4-5-20251001 (fast, cheap) |
| Deno .catch() | PostgrestBuilder is not a real Promise — use async IIFE |
| Twilio 24h window | template-free WA messages require 24h session |
| pg_cron | not used — terms reminders piggyback on GAS daily run |
