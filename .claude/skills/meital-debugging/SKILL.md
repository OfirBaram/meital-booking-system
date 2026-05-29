---
name: meital-debugging
description: >-
  Debug the Meital booking system, especially "it worked but nothing happened"
  bugs: SMS not arriving, approvals not notifying clients, admin links broken.
  Use when a side-effect (SMS, calendar, notification) silently fails even
  though the action reported success. Encodes the GAS↔Supabase split-brain trap
  and the live code path so you fix the function that actually runs in prod.
---

# Debugging the Meital booking system

## The #1 trap: GAS ↔ Supabase split-brain
The live database is **Supabase** (`appointments`, `slots`, `clients`, `bookings_view`).
GAS (`backend/gas-backend.js`) is legacy and its `Bookings_Log` **Google Sheet is
effectively empty for live bookings** — `verify-and-book` writes only to Supabase.

So any GAS handler that reads the Sheet by bookingId (`handleAdminAction`,
`handleChangeStatus` → `processApproval`/`processRejection`/`processCancellation`)
returns `booking_not_found` for real bookings. The admin console calls these as
**fire-and-forget side-effects** (`apiCall('changeStatus', …).catch(console.warn)`),
so the failure is swallowed and the user sees success while no SMS is sent.

**Rule:** SMS / notifications must be sent from the **Supabase Edge Function that
performs the action**, never from a GAS side-effect. As of v1.6.0:
- `change-status` sends the client SMS (reads `bookings_view`).
- `admin-action` (one-tap SMS link) sends the client SMS.
- `verify-and-book` sends the admin SMS.

## Triage checklist for "the SMS didn't arrive"
1. **Which layer ran?** Frontend calls `${SUPABASE_URL}/functions/v1/<fn>`. Find
   that function under `supabase/functions/<fn>/index.ts` — debug THAT, not GAS.
2. **Does that function actually send an SMS?** Grep for `sendTwilioSms` /
   `twilioCredsFromEnv`. If the function only does an RPC, the SMS is missing.
3. **Swallowed errors?** Look for `.catch(e => console.warn(...))` / fire-and-forget
   on the caller (`frontend/admin.js`). A silent catch hides the real failure.
4. **Secrets present at runtime?** Each function logs a boot diagnostic
   (`console.log('[fn] boot:', …)`) listing which secrets are set. Missing
   `HMAC_SECRET` / `TWILIO_*` / `ADMIN_PHONE` → no SMS. Check `supabase secrets list`.
5. **"undefined" in a message/URL?** A `Deno.env.get('X')!` on an unset var
   stringifies to `"undefined"`. Never interpolate a possibly-missing env var into
   user-facing text; guard it or build URLs from `SUPABASE_URL` (always present).
6. **Status casing** (see CLAUDE.md): SLOT status is lowercase (`available`),
   BOOKING status is Capitalized (`Pending`). Mixed casing breaks logic silently.

## Where message text lives (edit here, it's unit-tested)
`supabase/functions/_shared/messages.ts` — pure builders:
`hebrewDayLabel`, `fullDateLabel`, `buildClientStatusSms`, `buildAdminNewBookingSms`.
Tests: `tests/unit/notify-messages.test.js`, `tests/unit/admin-token.test.js`.
Keep new message logic here so it stays Node-testable (no esm.sh/Deno imports).

## Auth schemes (don't mix them up)
- **Dashboard → change-status:** shared `ADMIN_TOKEN` secret in the request body.
- **SMS link → admin-action:** per-booking HMAC `token = HMAC-SHA256(HMAC_SECRET, bookingId)`,
  verified with `verifyHmacToken`. `HMAC_SECRET` must match the one verify-and-book signs with.

## Deploy after editing a function (code change ≠ live)
`bash scripts/deploy-functions.sh` (deploys admin-action, change-status,
verify-and-book; checks secrets). Then smoke-test a real booking end to end.

## Editing files in this repo
The project path contains U+200F marks. Prefer Bash heredocs / the Python patch
tooling for JS/HTML (CLAUDE.md §11–§12). Run git only through the Bash tool.
