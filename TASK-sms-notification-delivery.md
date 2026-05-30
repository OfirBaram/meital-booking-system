# Task: SMS Notifications Not Sent on Approval/Cancellation (Blocker)

> Branch: `fix/sms-notifications-delivery` (off `main`)
> Status: **investigation complete, fix not yet implemented** — resume point below.
> Reported: 2026-05-30

## The report
Clients receive **no SMS** when an admin confirms or cancels their appointment.
Three asks:
1. Investigate + fix the root cause.
2. Add a delivery-status indicator (SMS sent / failed) in the Admin Console.
3. Give the admin production visibility into failed client notifications.

## Investigation — what actually runs in prod
Live DB is **Supabase**. The admin approve/cancel path is:
- Dashboard button -> `frontend/admin.js` `_commitSheetAction()` -> POST
  `${SUPABASE_URL}/functions/v1/change-status`.
- One-tap SMS link -> `supabase/functions/admin-action/index.ts`.

Both functions are **wired correctly**:
- `change_appointment_status` RPC returns `{success:true}` (verified in
  `supabase/migrations/20260525000000_change_status.sql`).
- On success they read `bookings_view` and call `sendTwilioSms()`.
  (`bookings_view` exposes the quoted `"serviceName"` column correctly.)

So the v1.6.0 wiring is intact. The defect is in **failure handling + visibility**.

## Root cause (systemic)
1. **Failures are silently swallowed.** In `change-status` and `admin-action`,
   `notifyClient()` runs inside a `try/catch` that only `console.error(...)`s.
   The status change is treated as authoritative, so the admin **always sees
   success** even when Twilio rejected the message.
2. **No SMS result is ever persisted.** A `communication_logs` table exists
   (statuses `SENT`/`MOCK`/`ERROR`; see
   `supabase/migrations/20260522000000_initial_schema.sql`) AND an admin SMS-log
   panel is already built (`supabase/functions/sms-log/index.ts` ->
   `loadSmsLog()`/`renderSmsLog()` in `frontend/admin.js`, `#js-sms-log` in
   `admin.html`). **But NO Edge Function ever INSERTs into that table.**
   `change-status`, `admin-action`, `verify-and-book`, `send-otp` all just call
   Twilio and `console.log` the result. => the SMS-log panel is permanently
   **empty**; zero delivery visibility. (This is the production concern.)
3. **Likely operational trigger:** `CLAUDE.md` (2026-05-29) still lists Twilio as
   "awaiting paid upgrade". A Twilio **trial** account can only SMS **verified**
   numbers, so real client numbers are rejected at the API, the error is
   swallowed, and nothing is logged. Console shows account named
   "My first Twilio account", single US number `+18145266292` -> trial hints.
   **Not yet confirmed against the live account.**

## Planned fix (unifies all three asks)
A shared logging helper wraps every send and persists the result; the console
surfaces it.
1. **`supabase/functions/_shared/`**: add a `logSms()` helper (or extend `sms.ts`)
   that, around each `sendTwilioSms()`, INSERTs a `communication_logs` row:
   `SENT` on 2xx, `ERROR` + Twilio's actual error detail on failure, `MOCK` when
   secrets absent. Map `context` to the existing CHECK enum
   (`ClientApproval`/`ClientRejection`/`ClientCancellation`/`AdminNotify`/`OTP`/
   `DailyReminder`) and set `appointment_id`.
2. Call it from `change-status`, `admin-action`, `verify-and-book`, `send-otp`.
3. **Admin Console indicator** (UI decision still open — see questions):
   - Option A (recommended): per-booking delivery badge in the bookings list /
     day-sheet **and** make the existing SMS-log panel populate.
   - Option B: per-booking badge only.
   - Option C: global SMS-log panel only.
4. Tests: unit-test the log-row builder (Node/Vitest, keep pure parts in
   `_shared/messages.ts` style); E2E for the admin indicator behind the route
   mocks. Respect the Frontend Deployment Gate (admin-dashboard.spec must be
   green).
5. Deploy: `bash scripts/deploy-functions.sh` after editing functions
   (code change != live).

## Open questions (blocking implementation)
1. **Twilio account type — trial or paid?** Determines whether the code fix
   alone unblocks delivery or an account upgrade is also required.
   - Check: Console banner (Upgrade button / trial balance), or
     `GET /Accounts/{SID}.json` -> `type` == `Trial`|`Full`, or deploy the repo's
     `twilio-diag` function which reports account type.
   - Also: trial requires destination numbers under Verified Caller IDs; and a
     US From number -> Israeli (+972) clients may be carrier-filtered even when
     paid (consider Alphanumeric Sender ID / messaging service).
2. **Where should the delivery indicator live?** Per-booking badge, global
   panel, or both (recommended).

## Useful references
- Live SMS senders: `change-status`, `admin-action`, `verify-and-book`, `send-otp`.
- Twilio helper: `supabase/functions/_shared/sms.ts`.
- Message builders (unit-tested, pure): `supabase/functions/_shared/messages.ts`.
- SMS-log read path: `supabase/functions/sms-log/index.ts` + `frontend/admin.js`
  `loadSmsLog()`.
- One-shot Twilio credential/account check: `supabase/functions/twilio-diag`.
- Deploy: `scripts/deploy-functions.sh`.
