# Meital Booking — MVP Deployment Guide

> Branch: `infra/supabase-migration`  
> Last updated: 2026-05-27

## Architecture Overview

| Layer | Tech | Status |
|-------|------|--------|
| Client booking flow | Supabase Edge Functions | ✅ Migrated |
| Admin dashboard (read/write slots, bookings, clients) | Supabase Edge Functions | ✅ Migrated |
| Admin side-effects (SMS, Calendar events) | Google Apps Script (GAS) | ⚠️ Still on GAS — intentional for MVP |
| SMS reminders batch | GAS | ⚠️ Still on GAS |

The critical path (client sees calendar → books → OTP → confirmed) is 100% on Supabase.
GAS is only invoked fire-and-forget for SMS/Calendar side-effects after a Supabase write succeeds.

---

## Required Supabase Secrets

Set all of these **before** deploying functions:

```
supabase secrets set \
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  TWILIO_FROM_NUMBER=+972xxxxxxxxx \
  ADMIN_PHONE=+972xxxxxxxxx \
  HMAC_SECRET=<random 32+ char string> \
  ADMIN_TOKEN=<random 32+ char hex string> \
  DAILY_SMS_LIMIT=45 \
  DIAG_KEY=<random string — for otp-tester diagnostic function>
```

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase — do NOT set them manually.

---

## Deployment Order of Operations

### Step 1 — Link to remote project (once per machine)

```bash
supabase login
supabase link --project-ref callmnxlcganwugxwiym
```

### Step 2 — Set secrets (if not already set)

```bash
supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=... \
  ADMIN_PHONE=... HMAC_SECRET=... ADMIN_TOKEN=... DAILY_SMS_LIMIT=45 DIAG_KEY=...
```

Verify secrets are present (will list names only, not values):

```bash
supabase secrets list
```

### Step 3 — Run database migrations

```bash
supabase db push
```

This applies all migrations under `supabase/migrations/` in filename order.

### Step 4 — Deploy Edge Functions

Deploy all functions at once:

```bash
supabase functions deploy admin-clients
supabase functions deploy admin-slots
supabase functions deploy change-status
supabase functions deploy generate-slots
supabase functions deploy get-slots
supabase functions deploy list-bookings
supabase functions deploy otp-tester
supabase functions deploy send-otp
supabase functions deploy sms-log
supabase functions deploy verify-and-book
```

Or loop in bash:

```bash
for fn in admin-clients admin-slots change-status generate-slots get-slots \
           list-bookings otp-tester send-otp sms-log verify-and-book; do
  supabase functions deploy $fn
done
```

### Step 5 — Verify deployment

```bash
supabase functions list
```

All 11 functions should show `Active`.

---

## Post-Deploy Smoke Test

### 1. Slot calendar (public — no auth)

```bash
curl "https://callmnxlcganwugxwiym.supabase.co/functions/v1/get-slots?year=2026&month=6" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbGxtbnhsY2dhbnd1Z3h3aXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMjMwMDAsImV4cCI6MjA5NDY5OTAwMH0.79kCMds3YptSKwxnUKO09GoybggSwWG1aaYlUxJlsQ8"
```

Expected: `{"success":true,"slots":{...}}`

### 2. Admin login

Open `frontend/admin.html` in a browser and log in with `ADMIN_TOKEN`.
Verify the Bookings tab loads without JS console errors.

---

## Known Remaining GAS Dependencies (not blocking MVP)

| Feature | Still on GAS | Reason |
|---------|-------------|--------|
| SMS on approval/rejection | `apiCall('changeStatus', ...)` fire-and-forget | GAS sends SMS + creates Calendar event |
| 24h reminder batch | `sendReminders` via GAS | No Edge Function yet |
| Manual SMS send | `sendManualSMS` via GAS | Admin-only, low priority |
| Auto-SMS config | `getAutoSms` / `setAutoSms` via GAS | Admin-only, low priority |

These use a **dual-write pattern**: Supabase writes the status first, then GAS handles downstream
effects asynchronously. If GAS fails, Supabase is still consistent and admin is warned via toast.

---

## Secret Name Reference

| Secret | Used by |
|--------|---------|
| `SUPABASE_URL` | auto-injected by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | auto-injected by Supabase |
| `ADMIN_TOKEN` | admin-clients, admin-slots, change-status, generate-slots, list-bookings, sms-log |
| `TWILIO_ACCOUNT_SID` | send-otp, verify-and-book |
| `TWILIO_AUTH_TOKEN` | send-otp, verify-and-book |
| `TWILIO_FROM_NUMBER` | send-otp, verify-and-book |
| `ADMIN_PHONE` | verify-and-book, change-status, admin-action |
| `HMAC_SECRET` | verify-and-book (signs admin tokens) |
| `DAILY_SMS_LIMIT` | send-otp (default: 45) |
| `DIAG_KEY` | otp-tester (diagnostic endpoint gate) |
