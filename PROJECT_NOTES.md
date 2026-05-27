# Meital Boutique Booking — Project Notes

> Living reference for architecture decisions, confirmed findings, and operational facts.
> Updated: 2026-05-27

---

## Architecture

| Layer | Technology | Branch / Status |
|-------|-----------|-----------------|
| Client booking flow | Supabase Edge Functions (Deno) | `infra/supabase-migration` — MVP ready |
| Admin dashboard (read/write) | Supabase Edge Functions | `infra/supabase-migration` — MVP ready |
| Admin side-effects (SMS, Calendar) | Google Apps Script | Still on GAS — intentional for MVP |
| SMS reminders batch | Google Apps Script | Still on GAS |
| Frontend | Vanilla JS + Tailwind CSS | `main` |

**Critical path** (client books → OTP → confirmed) is 100% on Supabase.  
GAS is fire-and-forget for SMS/Calendar after a Supabase write succeeds.

---

## Deployed Edge Functions (11 total)

All deployed to project `callmnxlcganwugxwiym` as of 2026-05-27:

| Function | Purpose |
|----------|---------|
| `get-slots` | Returns available calendar slots for a given month |
| `send-otp` | Generates and sends a 6-digit OTP via Twilio SMS |
| `verify-and-book` | Verifies OTP, upserts client, locks slot, writes appointment |
| `change-status` | Approves / rejects / cancels an appointment (admin only) |
| `list-bookings` | Returns bookings_view for the admin dashboard |
| `admin-slots` | Slot management: generate, block, list (admin only) |
| `admin-clients` | Client search and booking history (admin only) |
| `generate-slots` | Bulk slot generation from a weekly template (admin only) |
| `sms-log` | Reads the sms_log table (admin only) |
| `otp-tester` | Diagnostic: checks OTP DB state without sending SMS |
| `twilio-diag` | Diagnostic: validates Twilio credentials and account status |

---

## Confirmed Findings

### Hebrew encoding — NOT a bug (2026-05-27)
Supabase Edge Functions (Deno) + supabase-js v2 store and retrieve Hebrew characters
with perfect codepoint fidelity. Confirmed via `encoding-diag` function: "אופיר בראם"
stored as `U+05D0 U+05D5 U+05E4 U+05D9 U+05E8 U+0020 U+05D1 U+05E8 U+05D0 U+05DD`,
read back identically.

What looked like corruption in earlier smoke tests was the Windows terminal (cp1255 code
page) sending non-UTF-8 bytes in `curl -d` bodies. Real browser clients always send
UTF-8 — production bookings with Hebrew names are fine.

**Rule:** When testing Hebrew strings with `curl` on Windows, always use `\uXXXX` JSON
escape sequences in the `-d` body, never raw Hebrew characters.

### supabase secrets list — shows digests, not values
`supabase secrets list` displays SHA-256 digests of secret values, not the plaintext.
There is no CLI way to read a secret back. Keep a separate record of secret values.

### change_appointment_status RPC — was missing from live DB
Despite migration `20260525000000` being recorded as applied, the function was absent
from the live database. Fixed by migration `20260533000000_grant_rpc_execute.sql` which
recreates it idempotently and adds `GRANT EXECUTE TO service_role` for all 3 custom RPCs.

---

## Secrets Reference

| Secret | Actual value location |
|--------|----------------------|
| `ADMIN_TOKEN` | Set to a secure 64-char hex string (see previous session) |
| `DIAG_KEY` | `diag-test-key-2026` (reset 2026-05-27) |
| `TWILIO_*` | Twilio trial account — must upgrade to paid before production |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected by Supabase; never set manually |

---

## Skills Directory

Reusable scripts live in `skills/` (organized) vs one-off historical patches in `scripts/`.

| Path | Purpose |
|------|---------|
| `skills/db/list_supabase_tables.py` | Lists all tables in the Supabase project via PostgREST + information_schema |
| `skills/utils/ai_tools.py` | Safe file-patch utility for Claude Code (patch_file, verify_contains) |
| `skills/setup/` | Placeholder for future one-time setup scripts |

---

## Remaining Gates for Production Go-Live

1. **Twilio upgrade** — switch from trial to paid; acquire an Israeli sender number (+972 alphanumeric or local number)
2. **End-to-end test with a real Israeli phone** — full booking lifecycle: OTP → approve → confirm SMS
3. **Merge `infra/supabase-migration` → `main`** — only after gate 1 & 2 pass
