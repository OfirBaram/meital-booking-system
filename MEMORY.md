# 🧠 WhatsApp Channel — Project Memory & Runbook

> Maintenance runbook for the autonomous WhatsApp booking channel. Written for
> future-you (and any maintainer) ~a year out. If you read ONE doc before touching
> this feature, read this. Architecture spec lives in `CLAUDE.md`.

## 1. What it is
Customers book / inquire / cancel entirely over WhatsApp (Twilio), driven by the
SAME Claude-Haiku brain as the website chatbot. No website form, no manual triage.

## 2. Architecture (transport ↔ brain split)
```
Twilio ──webhook──▶ chat-handler (Deno Edge, verify_jwt=false)
                      │  X-Twilio-Signature present? ──▶ handleWhatsApp()   ◀── WhatsApp transport
                      │  else ─────────────────────────▶ web path (UNCHANGED)
                      ▼
              runConversation()  (_shared/bot-core.ts)   ◀── the ONE brain (web + WhatsApp)
                      ▼
              TOOL_REGISTRY (_shared/bot-config.ts): check_availability, join_waitlist,
                            escalate_to_support, book_appointment
```
- **State**: `whatsapp_conversations` (PK=phone, RLS service-role only) — history,
  `last_msg_sid` (dedupe), `client_id`. Twilio sends one msg with no history, so
  the server holds it.
- **Identity**: the verified WhatsApp phone is injected into `ToolContext` by
  `handleWhatsApp` — NEVER taken from the model (no spoofing of escalate/book).
- **Key files**: `chat-handler/index.ts` (transport), `_shared/bot-core.ts` (brain),
  `_shared/bot-config.ts` (tools+prompt), `_shared/twilio-webhook.ts` (HMAC),
  `_shared/whatsapp.ts` (pure helpers — testable), `_shared/health.ts`,
  `_shared/circuit-breaker.ts`, `admin-support/` (triage+health endpoint).

## 3. Resilience mechanisms (how nothing falls over)
| Mechanism | Where | What it guarantees |
|---|---|---|
| **Atomic lock** | `lock_slot_for_booking` (`WHERE status='available'`) | two people can't get the same slot; the loser gets `slot_not_available` |
| **try/finally** | `book_appointment` | a crash between lock and INSERT always releases the slot — no ghost lock |
| **Reaper** | `release_stale_locks()` (pg_cron, 5 min) | frees ONLY orphaned `locked` slots (`locked_at`>15min AND no active appointment). NEVER touches a real booking |
| **Dedupe** | `last_msg_sid` check | Twilio retries don't double-book / double-reply |
| **Circuit breaker** | `_shared/circuit-breaker.ts` | 3 consecutive failures → auto human-handover (2-min cooldown) |
| **Fail-safe** | `isDegraded()` (>5 open tickets) | bot stops auto-solving, routes all to a human, one deduped ticket per phone |
| **escalate_to_support** | tool | edge cases become tickets, not silent failures; customer gets instant reassurance |
| **PII scrub** | `maskPhone` / `scrubPhones` | phones never hit log lines (incl. Twilio error bodies) |

> ⚠️ **CRITICAL invariant**: `slots.status='locked'` is the NORMAL booked-pending
> state (set on every web + WhatsApp booking). ANY cleanup/reaper on `locked`
> MUST exclude slots with a `pending`/`approved` appointment, or it cancels real
> bookings. This bit us once — see migration `...0003`.

## 4. Maintenance notes (future-you)
### Cleaning logs / data retention
- `cleanup_old_whatsapp_data()` (pg_cron daily 03:30) purges `whatsapp_conversations`
  and `resolved` `support_requests` older than **90 days**. Adjust the interval
  in migration `...0004` if policy changes.
- Latency metrics live in `communication_logs` (`context='BotLatency'`); they age
  out with normal log hygiene. Slow responses are tagged `message_body='SLOW_RESPONSE'`.

### Deploying to production
1. Run migrations in order `...0000 → ...0004` (`supabase db push`).
2. `supabase functions deploy chat-handler` + `supabase functions deploy admin-support`.
3. Secrets via `supabase secrets set` ONLY (never in git/config.toml):
   `TWILIO_WHATSAPP_FROM` (real business number), `TWILIO_WEBHOOK_URL` (exact function URL),
   `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`, `TWILIO_FROM_NUMBER`, `HMAC_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PHONE`, `ANTHROPIC_API_KEY`.
4. Point the Twilio number webhook at `TWILIO_WEBHOOK_URL` (POST, byte-exact).
5. Out-of-24h messages (reminders) REQUIRE Meta-approved templates →
   `sendTwilioWhatsAppTemplate()`. In-window free-form → `sendTwilioWhatsApp()`.

### Handling failures (triage order)
- **Bot silent / erroring**: grep Supabase logs for `[wa][CRITICAL]` (error-loop or
  slow-brain). Check `ANTHROPIC_API_KEY`, Twilio status, DB.
- **"Signature rejected" (403)**: `TWILIO_WEBHOOK_URL` mismatch (must be byte-exact)
  or `TWILIO_AUTH_TOKEN` wrong. Fail-closed by design.
- **Slot stuck `locked`**: the reaper frees orphans in ≤15 min; a `locked` slot WITH
  a pending appointment is a real booking (correct).
- **Backlog**: `admin-support` action `health` → `openSupport`; >5 trips the fail-safe.
- **Booking confirmed but no calendar event**: WhatsApp bookings are `pending` like web —
  Meital approves in the dashboard; calendar/SMS fire on approval.

## 5. Tests & CI
- `deno test --allow-env supabase/functions/_tests/` — resilience suite (mocked
  Supabase/Anthropic): malformed-LLM-args, DB-timeout-on-INSERT, concurrent-booking,
  circuit breaker, render/trim/mask/scrub, Twilio signature.
- CI job `edge-tests` (`.github/workflows/ci.yml`) runs it on every PR. Add it as a
  required status check in branch protection.

## 6. Open / future
- Auto-approve (skip Meital's approval) — would wire calendar+client-SMS into book.
- Admin-console support card (backend `admin-support` ready; UI pending — must XSS-escape snapshots).
- MCP server (`mcp/whatsapp-mcp/`, scaffold) for Claude-Desktop operation.
- Fire-and-forget side effects (admin SMS, latency) use the proven verify-and-book
  pattern; consider `EdgeRuntime.waitUntil()` if edge workers start dropping them.
