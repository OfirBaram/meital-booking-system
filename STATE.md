# Project State (Last Updated: 2026-05-20)

## Infrastructure

| Parameter | Value |
|---|---|
| Active Deployment | https://script.google.com/macros/s/AKfycbw32cmN1CPb6q91eSOyU3GaP-lm9FAHMrYSc9goyOKFpxeROJMl6oFg2Q_WpxMiFzsfUw/exec |
| `IS_TEST_MODE` | `false` (production mode) |
| `IS_SUPABASE_ENABLED` | `true` |
| `IS_MOCK_MODE` (frontend) | `false` |
| Last Smoke Test | SUCCESS 2026-05-20 (@62 verified) |
| Twilio | TRIAL — upgrade to Paid required before go-live |

## Phase 6 Go-Live Status

| Step | Status | Notes |
|---|---|---|
| IS_TEST_MODE = false | DONE | Already in code |
| IS_SUPABASE_ENABLED = true | DONE | Active |
| Daily reminders trigger | DONE | sendDailyRemindersV2 (Supabase) @ 08:00 |
| Calendar sync trigger | DONE | syncCalendarToSlots @ 01:00 |
| Twilio Paid upgrade | PENDING (manual) | Must be done by Ofir |
| clasp deploy after next change | DONE | @62 deployed (v2 reminders with supabase fallback) |
| Live end-to-end smoke test | PENDING | Requires real Israeli phone + Paid Twilio |

## Active Workflows

- Current Branch: `feature/reminder-v2-supabase` (pending merge)
- Main Branch: `main`
- Project Goal: Sync docs with reality, then complete Phase 6 Twilio upgrade

## Branch Hygiene Note

There are 20+ local branches (many stale). Consider pruning after Phase 6 is confirmed live.

## How to Run Smoke Test

```bash
export ADMIN_TOKEN=<token-from-script-properties>
python smoke_test.py
```
