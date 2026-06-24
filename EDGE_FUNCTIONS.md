# Edge Functions Reference — Meital Booking System

> 31 Supabase Edge Functions (Deno runtime). Deploy all: `bash scripts/deploy-functions.sh`
>
> **Auth types:**
> - 🔓 Public — no auth required
> - 🔑 Admin session — requires `x-admin-session` header (HMAC token, 24h TTL) **or** HttpOnly cookie `admin_session`
> - 🪙 Admin token — requires static `adminToken` in body (legacy, GAS-style)
> - 👤 Client session — requires `x-client-session` bearer token (1h, issued by `client-auth`)
> - 🔐 HMAC link — one-tap link with per-booking `admin_token` (HMAC-SHA256)

---

## Booking Flow (Customer-facing)

| Function | Auth | Method | Key Input | Key Output | Notes |
|---|---|---|---|---|---|
| `get-slots` | 🔓 | POST | `date: YYYY-MM-DD`, `service: gel_hands\|regular_feet\|gel_combo` | `{ slots: ["HH:MM", ...] }` | Checks `smart_scheduling` feature flag → calls `get_viable_slots()` RPC if ON |
| `send-otp` | 🔓 | POST | `phone: +972...` | `{ success, retryAfter? }` | Rate limit: 1/30s per phone, daily quota guard. Logs to `otp_requests` |
| `verify-and-book` | 🔓 | POST | `{ otp, booking: { phone, name, service, date, time, nailNotes? } }` | `{ success, bookingId }` | Locks slot → creates appointment → sends admin SMS. Checks `check_gap_safety()` if smart_scheduling ON |
| `check-active-booking` | 🔓 | POST | `{ phone }` | `{ hasBooking, booking? }` | Used by "my booking" banner on frontend |
| `waitlist-add` | 🔓 | POST | `{ phone, name, service?, preferredDate? }` | `{ success }` | Adds to `waitlist` table |

---

## Admin — Authentication

| Function | Auth | Method | Key Input | Key Output | Notes |
|---|---|---|---|---|---|
| `admin-sign-in` | 🪙 | POST | `{ adminToken }` | `{ success, sessionToken }` + HttpOnly cookie | Issues `<expiryHex>.<hmacHex>` session token, 24h TTL |
| `admin-sign-out` | 🔓 | POST | — | `{ success }` | Expires cookie. No auth needed (worst case = sign out a valid session) |

---

## Admin — Bookings & Slots

| Function | Auth | Actions / Input | Key Output | Notes |
|---|---|---|---|---|
| `list-bookings` | 🔑 | `{ action: 'list', status?, dateFrom?, dateTo? }` | `{ bookings: [...] }` | Filters by status, date range |
| `change-status` | 🔑 | `{ bookingId, targetStatus, suppressSms?, customSmsBody? }` | `{ success }` | Sends SMS to client (Approved/Rejected/Cancelled). Logs to `audit_log` |
| `admin-action` | 🔐 | GET/POST `?action=approve\|reject&bookingId=...&token=...` | HTML confirmation page | One-tap link from admin SMS. GET = preview page, POST = execute. HMAC verified |
| `admin-slots` | 🔑 | `getSlots` / `toggleSlot` / `addSlot` / `deleteSlot` | `{ slots: [...] }` | Manage `slots` table. toggleSlot flips available↔blocked |
| `generate-slots` | 🪙 | `{ adminToken, startDate, endDate, template }` | `{ success, created }` | Bulk slot generation from weekly template |
| `auto-block-slots` | 🪙 | `{ adminToken, events: [{start,end}] }` | `{ blocked }` | Called by GAS Calendar sync trigger |

---

## Admin — Data & Analytics

| Function | Auth | Actions | Key Output | Notes |
|---|---|---|---|---|
| `admin-clients` | 🔑 | `getClients` (search), `getClientHistory` (clientId) | `{ clients }` / `{ history }` | Client list + per-client booking history |
| `admin-flags` | 🔑 | `getFlags` / `setFlag { key, enabled }` | `{ flags }` / `{ success }` | Feature flags CRUD. Writes `audit_log`. Used by Pulse → הגדרות מערכת |
| `admin-site-config` | 🔑 | `listConfig` / `updateConfig` / `listServices` / `upsertService` / `deleteService` / `reorderServices` / `resetColors` / `resetConfigKey` | varies | Dynamic site config (colors, services, content) |
| `sms-log` | 🔑 | `{ adminToken }` | `{ logs: [...] }` | Read `communication_logs` — SMS/WhatsApp history |
| `twilio-stats` | 🔑 | `{ adminToken }` | `{ sent, delivered, failed, thisWeek }` | Twilio message stats via REST API |
| `send-reminders` | 🔑 | `{ adminToken }` | `{ results }` | Manual trigger for 24h reminder SMS (idempotent) |
| `admin-support` | 🔑 | `list` / `resolve { ticketId }` / `health` | tickets / ok / queue stats | Support ticket management. resolve sends WhatsApp to client |
| `admin-waitlist` | 🔑 | `getWaitlist` / `markContacted` / `markBooked` / `dismiss` | `{ waitlist }` | Waitlist management |

---

## Client Self-Service (authenticated)

| Function | Auth | Method | Key Input | Key Output | Notes |
|---|---|---|---|---|---|
| `client-auth` | 🔓→👤 | POST | `{ phone, otp }` | `{ success, sessionToken }` | Verifies OTP → issues 1h client session token |
| `client-portal` | 👤 | POST | header: `x-client-session` | `{ booking, history }` | Active booking + past appointments |
| `client-cancel` | 👤 | POST | `{ appointmentId }` | `{ success }` | 48h policy enforced. Frees slot, sends confirmation |
| `client-reschedule` | 👤 | POST | `{ appointmentId, newSlotId }` | `{ success }` | Atomic slot swap (once per booking). 48h policy |

---

## Site Config & Chat

| Function | Auth | Notes |
|---|---|---|
| `get-site-config` | 🔓 | Public read of site config (colors, services, content). Short-cached. |
| `chat-handler` | 🔓 | AI chatbot + WhatsApp webhook. Routes on `X-Twilio-Signature` header presence. Uses `_shared/bot-core.ts` |
| `wa-terms-reminder` | 🔑 | Send WhatsApp 24h template window reminder to client before booking expires |

---

## Diagnostics (dev only)

| Function | Auth | Notes |
|---|---|---|
| `otp-tester` | 🔓+diag-key | Debug: check OTP state for a phone. Header: `x-diag-key`. **Never expose in production flows** |

---

## Shared Modules (`supabase/functions/_shared/`)

| File | Exports |
|---|---|
| `auth.ts` | `validateAdminSession`, `signAdminSession`, `sessionCookieHeader`, `clearSessionCookieHeader` |
| `client-auth.ts` | `signClientSession`, `verifyClientSession`, `extractBearerToken` |
| `cors.ts` | `adminCors` (echo-back origin for credentials), `PUBLIC_CORS`, `SEC_HEADERS` |
| `crypto.ts` | `verifyHmacToken`, `hmacHex` |
| `messages.ts` | `buildAdminNewBookingSms`, `buildClientStatusSms`, `fullDateLabel` |
| `notify.ts` | `sendAndLogSms`, `sendClientStatusNotification`, `statusToContext`, `buildSmsLogRow` |
| `phone.ts` | `toDialable` (normalises Israeli numbers to E.164) |
| `sms.ts` | `twilioCredsFromEnv`, `sendTwilioWhatsAppFreeform` |
| `bot-core.ts` | `runConversation` (shared web + WhatsApp brain) |
| `bot-config.ts` | `TOOL_REGISTRY`, `toolsForChannel` |

---

## Deployment

```bash
# Deploy ALL functions at once:
bash scripts/deploy-functions.sh

# Deploy one function:
supabase functions deploy <name> --project-ref <ref>
```

> **Critical (Deno):** Never use `.catch()` on `PostgrestBuilder` — use async IIFE:
> ```ts
> ;(async () => { try { await supabase.from('t').insert({}) } catch(e) { console.error(e) } })()
> ```
