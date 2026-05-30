---
name: sms-notification-verification
description: >-
  Verify that the RIGHT person receives the RIGHT SMS in the Meital booking
  system, and untangle the common "is the customer actually notified?" confusion
  — especially when the owner tests with a single phone that is both the customer
  AND the admin. Use when someone reports approve/cancel/booking SMS arriving to
  the "wrong" person, duplicated, or "not working for the customer", before
  assuming a bug. Encodes the three SMS roles + recipients, the single-phone
  trap, how to read ground truth from communication_logs / the SMS-log panel,
  and the definitive two-phone test.
---

# Verifying SMS recipients (Meital)

## The trap: one test phone = multiple roles
The system sends SMS to **different roles**. If the tester uses one phone number as
both the customer and `ADMIN_PHONE`, every message lands on that one device and looks
duplicated/wrong. This is almost always confusion, not a bug — but **confirm before
concluding either way.**

| SMS | Sent by | Recipient |
|---|---|---|
| New-booking notice (one-tap approve/reject links) | `verify-and-book` | **ADMIN_PHONE** |
| Client status: approved / rejected / cancelled | `change-status` (dashboard) / `admin-action` (SMS link) | **the booking's client phone** (`bookings_view.phone`) |
| Failure alert (only on a client-SMS ERROR) | `_shared/notify.ts` `sendAndLogSms` | **ADMIN_PHONE** |

Recipient logic is fixed in code: client status SMS → `to: bk.phone`; admin SMS →
`ADMIN_PHONE`. They coincide only when the test client number == the admin number.

## Don't pre-judge — get the one fact that decides it
The question "did the customer get notified?" is answered by the **status of the
`ClientApproval`/`ClientRejection`/`ClientCancellation` row in `communication_logs`**:
- **SENT** to the customer's number → it works; any duplication is the single-phone trap.
- **ERROR** (+ a Twilio reason in `detail`) → real bug; the customer was not notified and
  the failure-alert fired to the admin.

Read it via the admin console **diary tab → SMS log** (`#js-sms-log`), or the
`communication_logs` table (`recipient_phone, context, status, detail`). The recipient
column tells you *which* number each SMS actually went to.

## The definitive test: TWO phones
Use a customer number **different** from the admin number. Book on Phone A (customer),
approve/cancel from the console, and confirm **Phone A** receives the status SMS and the
log shows **SENT to Phone A's number**. That separates the roles and removes all doubt.
A single-phone test can never prove customer delivery — insist on two numbers.

## If it's a real failure (ERROR)
Use the logged `detail` (the Twilio response). Most common root cause for a per-customer
failure is the **recipient number not being E.164** (`+9725XXXXXXXX`) when it reaches
`sendTwilioSms` — normalize `bk.phone` before sending (mirror `normalizePhone` in
`send-otp`/`verify-and-book`), keep it pure + unit-tested, then deploy and re-test with
two phones. Always `npm run verify:deploy` after deploying (see [[deploy-verification]]).

Related: [[meital-debugging]] (the "succeeded but nothing happened" side-effect trap).
