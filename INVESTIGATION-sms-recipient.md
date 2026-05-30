# Investigation: client approve/cancel SMS — is the customer really notified?

> Branch: `investigate/sms-recipient-delivery` (off `main`)
> Status: **RESOLVED — H1 confirmed (no bug). NO CODE CHANGED.**
> Opened + closed: 2026-05-30. Skill: [[sms-notification-verification]].

## OUTCOME (2026-05-30) — H1 confirmed, NOT a bug
Ground truth from the SMS-log: the **`ClientCancellation` row shows ✅ SENT to
`0542290881`** — Twilio delivered the customer notification successfully. Because
`0542290881` is both the test customer's number AND `ADMIN_PHONE`, one device received
both the admin "approve/cancel link" SMS and the customer "cancelled" SMS, which *looked*
like a malfunction. Recipient logic is correct; nothing to fix. A real customer (a
different number) receives only the customer SMS. Optional once-off: the two-phone test
below for absolute peace of mind, but the ✅ SENT row already proves delivery.

## The report (Ofir, 2026-05-30)
Doing approve/cancel from the calendar "all works." But when testing, on a **single
phone `0542290881`**, he receives *both* an "approve/cancel" SMS *and* a "your
appointment was cancelled" SMS, and is unsure whether the **customer** actually gets
their notification. He suspects the single-phone test is confusing him. Wants a clear
test plan + a fix plan if it's real.

## OPEN SUB-ISSUE (2026-05-30): customer gets "approved" SMS right after OTP
**Report:** sometimes, just after a customer enters the OTP, they receive an
"approved" SMS — with no admin action. A new booking must stay **Pending**.

**Code facts (verified):**
- `verify-and-book` (runs on OTP submit) inserts the appointment as `status:'pending'`
  and sends ONLY the admin notification SMS. No client status SMS, no auto-approve.
- No DB trigger / no auto-approve exists (checked migrations).
- The ONLY senders of a client approval SMS are `change-status` (console) and
  `admin-action` (the one-tap link in the admin SMS).

**Leading hypothesis — GET link prefetch auto-approves (`admin-action`).**
`admin-action` performs the approval on a **bare GET** (token in the URL). The admin
notification SMS (sent during `verify-and-book`) contains that approve link. Many
messaging apps / link-preview bots **prefetch URLs**, which would hit the approve link
and auto-approve the booking with no human tap → client gets "approved" SMS seconds
after the OTP. Worse on the single-phone test (link SMS lands on the previewing phone),
but a real production risk for any admin phone that previews links.

**Alt hypothesis:** delayed/out-of-order SMS from a previous booking's approval (benign).

**Decisive test (pending Ofir):** with a CLEAN DB, book once, enter OTP, **tap nothing**,
wait ~1 min. Then check the new booking's status in the console:
- **Approved (without tapping)** → confirms GET-prefetch auto-approve → REAL bug, fix.
- **Pending** (no approved SMS) → working; earlier sighting was a delayed SMS.

**Fix — IMPLEMENTED on this branch (commit on `investigate/sms-recipient-delivery`).**
`admin-action` is now non-mutating on GET: a GET (incl. any prefetch) renders a branded
Hebrew **confirm page** with a POST form; `change_appointment_status` runs ONLY on the
POST that the button submits (HMAC token carried in the form action). Prefetch/preview
bots issue GET only, so they can no longer auto-approve. Admin flow is now: tap SMS link
→ confirm page → tap "אשר/דחה עכשיו". Chosen defensively regardless of the test outcome,
because a state-mutating GET is wrong on its own.

**Still to do:** deploy + `npm run verify:deploy`, then verify live —
`curl <approve link>` (GET) must show the confirm page and leave the booking **Pending**;
only the button (POST) approves. NOT deployed yet (awaiting go-ahead / the decisive test).
No clean Vitest unit is possible (the file calls `Deno.serve` at top level); verify via
the live curl + a real two-step approve.

## Background — three different SMS, three different recipients
The system sends SMS for different roles. On a single test phone they all pile onto one
device, which is the likely source of confusion.

| SMS | Sent by | Recipient | Hebrew text (approx) |
|---|---|---|---|
| New-booking notice (one-tap approve/reject links) | `verify-and-book` | **ADMIN_PHONE** | "📅 הזמנה חדשה… ✅ לאישור ❌ לדחייה" |
| Client status (approved/rejected/cancelled) | `change-status` (dashboard) / `admin-action` (SMS link) | **the booking's client phone** (`bookings_view.phone`) | "✅ ההזמנה שלך אושרה" / "❌ התור שלך בוטל" |
| Failure alert (NEW) | `_shared/notify.ts` `sendAndLogSms`, only on a **client-SMS ERROR** | **ADMIN_PHONE** | "⚠️ לקוחה לא קיבלה הודעת SMS… כדאי ליצור קשר ידני" |

Recipient logic (verified in code): client SMS → `to: bk.phone` (the client), admin SMS
→ `ADMIN_PHONE`. They are only the *same device* when the test client number equals the
admin number — which is exactly Ofir's case (`0542290881`).

## Two hypotheses — do NOT pre-judge
- **H1 — test artifact (most likely).** `0542290881` is both the client and `ADMIN_PHONE`,
  so one phone correctly receives the admin link SMS **and** the client status SMS. The
  customer notification *is* working; it just looks doubled. Supports H1: the earlier
  approve smoke test succeeded ("SMS arrived + badge ✅"), and calendar actions "all work".
- **H2 — real failure (must rule out).** The client status SMS is actually ERRORing for the
  client send (e.g. a number/format/Twilio issue), so the **customer is not notified**, and
  the NEW failure-alert fires to ADMIN_PHONE — which on one phone looks like "I got a message
  about the customer's cancellation." If true, this is a genuine stopper.

The two are distinguished by **one fact: the status of the `ClientApproval`/`ClientCancellation`
row in `communication_logs`** (SENT vs ERROR). We built the SMS-log exactly for this.

## STEP 1 — Get ground truth (fastest, do this first)
Admin console → **diary tab → SMS log** (`#js-sms-log`). Find the rows from the test:
- `✅ … · ClientCancellation · התור שלך בוטל` → **SENT to the customer = working → H1, close.**
- `❌ … · ClientCancellation · …` + a red reason line → **ERROR = H2, real bug.** Record the reason.
- Note the **recipient number** on the client-status row: it must be the *customer's* number.

(The same data lives in the `communication_logs` table: `recipient_phone, context, status, detail`.)

## STEP 2 — Two-phone test (removes all doubt)
Use a customer number **different** from `0542290881`.

| # | Action | Phone A = customer (different number) | Phone B = admin `0542290881` |
|---|---|---|---|
| 1 | Book on Phone A, enter OTP | gets OTP | — |
| 2 | Booking created | — | gets "new booking" + approve/cancel links |
| 3 | Admin **approves** in console | gets "✅ אושרה" immediately | — |
| 4 | Book again, admin **cancels** | gets "❌ בוטל" immediately | — |
| 5 | Check SMS-log panel | — | rows show ✅ SENT to Phone A's number |
| 6 | (bonus) tap approve link in admin SMS | customer gets status SMS | confirmation page |

**PASS = Phone A (≠ admin) receives the approve/cancel SMS, and the log shows SENT to A.**

## Decision tree
- **Log row = SENT to the customer number** (and/or 2-phone test passes) → **H1 confirmed.
  No bug. Close this branch.** Optional doc note that single-phone testing doubles messages.
- **Log row = ERROR**, or 2-phone Phone A gets nothing → **H2 confirmed. Real bug.** Proceed
  to the fix plan with the captured Twilio reason.

## Fix plan — ONLY if H2 is confirmed
Root-cause with the logged `detail` (the Twilio error) in hand:
1. **Reproduce** against the failing number/case; read the exact Twilio response (status + body).
2. **Likely suspects, in order:**
   - Number formatting reaching Twilio: client phone must be E.164 (`+9725XXXXXXXX`). Check how
     `bookings_view.phone` is stored vs. what `sendTwilioSms` sends (`to: bk.phone`). If the
     stored value isn't E.164, normalize before send (mirror `normalizePhone` from
     `send-otp`/`verify-and-book`).
   - Twilio per-destination issue (e.g. 21610 unsubscribed, 21211 invalid To) — content of `detail`.
   - A real exception in `change-status`/`admin-action` `notifyClient` before the send.
3. **Where to change:** the send path is `_shared/notify.ts` `sendAndLogSms` (+ `sms.ts`); the
   recipient comes from `notifyClient` in `change-status/index.ts` and `admin-action/index.ts`.
   Keep any phone-normalization pure and unit-test it (like `_shared/messages.ts`).
4. **Tests:** add a unit test for the normalization/builder; extend
   `tests/e2e/sms-delivery-status.spec.js` for the failing case. Keep the suite green
   (Frontend Deployment Gate).
5. **Ship:** `bash scripts/deploy-functions.sh` then `npm run verify:deploy` (push ≠ deploy);
   re-run the 2-phone test to confirm the customer now receives it.

## Code reference map
- Client SMS send: `supabase/functions/change-status/index.ts` `notifyClient` → `sendAndLogSms`.
- One-tap SMS link path: `supabase/functions/admin-action/index.ts` `notifyClient`.
- Admin new-booking SMS: `supabase/functions/verify-and-book/index.ts` `sendAdminSms`.
- Send + log + failure-alert: `supabase/functions/_shared/notify.ts`.
- Twilio HTTP: `supabase/functions/_shared/sms.ts`.
- Read model / log viewer: `supabase/functions/list-bookings` (smsStatus), `sms-log`;
  frontend `renderSmsLog` (`frontend/admin-render.js`), `#js-sms-log` (diary tab).
- Message texts: `supabase/functions/_shared/messages.ts`.

## Resume instructions (next session)
1. Read STEP 1 result (Ofir reads the SMS-log panel; paste the cancellation row here).
2. If SENT → close as H1. If ERROR → take `detail`, run the Fix plan, branch stays as the fix branch.
3. Always finish with deploy + `npm run verify:deploy` + a real 2-phone re-test.
