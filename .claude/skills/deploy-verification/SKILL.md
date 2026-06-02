---
name: deploy-verification
description: >-
  Verify Supabase Edge Functions are actually DEPLOYED after any backend change
  to this repo — push != deploy. Use after editing anything under
  supabase/functions/ (including _shared/), when a side-effect "succeeded but
  nothing happened" (SMS/notification not arriving while the action reports OK),
  or before claiming a backend fix is live. Encodes the 2026-05-30 deploy-gap
  incident, the deploy-drift guard (npm run verify:deploy), and the SMS
  notify->log->display contract so a function change can never silently fail to
  reach production again.
---

# Deploy verification — push ≠ deploy

## The incident this exists for (2026-05-30)
Clients stopped getting approve/cancel SMS. The code was **correct** — the
v1.6.0 fix (commit `5a320dd`, 2026-05-29) added the client SMS to `change-status`
and created `admin-action`. But the **live** functions were never redeployed:
`change-status` was running 05-27 code (no SMS) and `admin-action` had never been
deployed at all. Twilio was a **red herring** — the account is paid and OTP SMS
already worked. The root cause was purely a deployment gap.

Two traps made it invisible:
- **No mocked test catches this.** Unit/E2E run against source or route mocks, so
  a correct-but-undeployed function looks green. The only thing that catches it is
  comparing source to what is *live*.
- **Failures were swallowed.** The notify call was in a `try/catch` that only
  `console.error`-ed, and nothing was written to `communication_logs`, so the
  admin saw success and the SMS-log panel stayed empty.

## Mandatory step after ANY supabase/functions change
Before you say a backend change is done/live:

```bash
npm run verify:deploy          # scripts/verify-deploy.mjs
```

It compares each function's last git commit (and `_shared/`'s, for importers)
against the live `supabase functions list` and **exits non-zero on drift**. If it
reports drift:

```bash
bash scripts/deploy-functions.sh   # deploys ALL functions, then re-verifies
npm run verify:deploy              # must now be clean
```

`deploy-functions.sh` deploys **every** function under `supabase/functions/`
(not a hand-maintained list) precisely so a new function can't be forgotten the
way `admin-action` was.

Quick manual cross-check when the script can't run: `supabase functions list`
and compare each `UPDATED_AT` to the date of the commit that changed that
function. A function whose source commit is newer than its deploy time is stale.

## The SMS notify → log → display contract (don't break the chain)
Client/admin SMS is sent **and recorded** by `_shared/notify.ts`
(`sendAndLogSms`): every attempt writes a `communication_logs` row —
`SENT` / `ERROR` (+ Twilio detail) / `MOCK` (secrets absent). Wired into
`change-status`, `admin-action`, `verify-and-book` (AdminNotify), `send-otp` (OTP).
When a **client-facing** send ERRORs, it also fires a best-effort heads-up SMS to
`ADMIN_PHONE` (`buildAdminFailureAlertSms`) so the admin can call the client —
excluded for OTP/AdminNotify to avoid noise/recursion.
The admin console surfaces it two ways:
- per-booking badge — `list-bookings` attaches `smsStatus`; rendered by
  `buildCard` (`frontend/admin-render.js`, `data-qa="sms-status"`).
- SMS-log panel — `sms-log` function -> `renderSmsLog`; ERROR rows show the reason
  (`data-qa="log-detail"`).

Tests that lock it:
- `tests/unit/notify-log.test.js` — pure `statusToContext` / `buildSmsLogRow`.
- `tests/e2e/sms-delivery-status.spec.js` — badge, log panel + reason, approve->badge.

Keep new message/log logic in the **pure** `_shared/*.ts` (no `esm.sh`/`Deno.*`)
so it stays Node/Vitest-testable, like `messages.ts`.

## Project quirks (so edits don't silently fail)
- The repo path contains U+200F marks. Editing JS/HTML/TS works with the Edit/Write
  tools **as long as you Read the file first this session** (the resolver matches
  the path you read). Heredocs that embed lots of single quotes can trip the shell;
  prefer Edit/Write or the Python patch tool (`skills/utils/ai_tools.py`).
- Run git via the Bash tool. The supabase CLI is a `.cmd` shim on Windows — call
  it through a shell (the script uses `execSync`), not Node's `execFileSync`.
- Status casing: SLOT lowercase (`available`), BOOKING capitalized (`Approved`).

## CI
`.github/workflows/ci.yml` has a `deploy-drift` job that runs `npm run verify:deploy`.
It self-skips unless the repo secret `SUPABASE_ACCESS_TOKEN` is set (so forks
aren't blocked). Add that token to enforce drift protection on every PR.

See also: [[meital-debugging]] for the GAS↔Supabase split-brain that often hides
behind a "succeeded but nothing happened" report.
