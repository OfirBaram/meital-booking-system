# WhatsApp Booking Admin Notification Fix

## Problem
When a customer books an appointment via WhatsApp, the admin console doesn't receive the notification (SMS/WhatsApp), so:
1. Admin doesn't know about the new booking
2. Admin can't approve or reject it
3. Customer doesn't get approval/rejection response

## Root Causes Fixed

### 1. Missing ADMIN_PHONE Guard (Critical)
**Issue:** If `ADMIN_PHONE` environment variable wasn't set in Supabase, the admin SMS notification would be sent to an empty phone number, causing a silent failure.

**Fix:** Added explicit check before sending admin SMS:
```typescript
const adminPhone = toDialable(Deno.env.get('ADMIN_PHONE'))
if (!adminPhone) {
  console.warn('[book_appointment] admin-sms-skip: ADMIN_PHONE not configured')
  return
}
```

### 2. Missing WhatsApp Admin Notification Guards
**Issue:** WhatsApp notification to admin had no guards for missing environment variables, causing silent failures.

**Fix:** Added explicit checks for:
- Twilio credentials
- `TWILIO_WHATSAPP_FROM`
- `ADMIN_PHONE`
- `SUPABASE_URL`
- Admin token

### 3. Insufficient Logging
**Issue:** Failures in the approval flow weren't logged properly, making debugging difficult.

**Fix:** Added detailed logging to:
- `admin-action`: Status change RPC and client notifications
- `change-status`: RPC execution and notification sending

## Changes Made

### Files Modified
- `supabase/functions/_shared/bot-config.ts`: Added ADMIN_PHONE and WhatsApp guard checks
- `supabase/functions/admin-action/index.ts`: Added logging for approval flow
- `supabase/functions/change-status/index.ts`: Added logging for status changes

### Files Added
- `tests/integration/whatsapp-booking-integration.test.js`: Integration test for the full flow
- `tests/e2e/whatsapp-booking-admin-approval.spec.js`: E2E test template
- `test-whatsapp-booking.js`: Manual test script

## Testing the Fix

### Prerequisites
1. Supabase project running (local or remote)
2. Environment variables configured:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `ADMIN_PHONE` (required for SMS notifications)
   - `TWILIO_*` (required for SMS/WhatsApp)
   - `HMAC_SECRET` (required for admin tokens)

### Test Scripts

#### 1. Integration Test (Recommended)
```bash
cd tests/integration
node whatsapp-booking-integration.test.js
```

This test:
1. Creates a test customer
2. Gets an available slot
3. Creates a booking (simulating WhatsApp booking)
4. Verifies booking appears in admin list
5. Verifies admin notification was logged
6. Admin approves the booking
7. Verifies client notification was sent

#### 2. Manual Test Script
```bash
node test-whatsapp-booking.js
```

#### 3. E2E Test (Playwright)
```bash
npx playwright test tests/e2e/whatsapp-booking-admin-approval.spec.js
```

## Deployment Checklist

- [ ] Verify `ADMIN_PHONE` is set in Supabase environment variables
- [ ] Verify Twilio credentials are set (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`)
- [ ] If using WhatsApp for admin notifications, verify `TWILIO_WHATSAPP_FROM` is set
- [ ] If using WhatsApp templates, verify `TWILIO_TEMPLATE_APPROVED`, `TWILIO_TEMPLATE_REJECTED`, etc. are set
- [ ] Deploy updated functions: `bash scripts/deploy-functions.sh`
- [ ] Test the full flow with a real WhatsApp booking

## Troubleshooting

### Admin doesn't receive SMS notification
Check Supabase logs for:
- `[book_appointment] admin-sms-skip: ADMIN_PHONE not configured`
- `[book_appointment] admin sms: <error message>`

**Solution:** Set `ADMIN_PHONE` in Supabase Edge Function secrets

### Admin doesn't receive WhatsApp notification
Check logs for:
- `[book_appointment] admin-wa-skip: twilio creds missing`
- `[book_appointment] admin-wa-skip: TWILIO_WHATSAPP_FROM not configured`
- `[book_appointment] admin wa: <error message>`

**Solution:** Set missing Twilio configuration variables

### Client doesn't receive approval notification
Check logs for:
- `[admin-action] client-notify-fail`
- `[change-status] client-sms-fail`
- `[notify] wa-template failed`

**Solution:** 
1. Verify client's phone is correct
2. Verify Twilio templates are configured (if using WhatsApp)
3. Check Twilio logs for delivery failures

### Booking doesn't appear in admin list
Check:
1. Booking was created (check `appointments` table)
2. Client exists (check `clients` table)
3. Slot exists (check `slots` table)
4. `bookings_view` includes the booking

## Expected Flow (After Fix)

1. **Customer books via WhatsApp**
   - Bot requests service → date/time → customer name
   - Customer picks a service, date, and time
   - Bot calls `book_appointment` tool
   - Appointment is created with status `pending`
   - **Admin SMS is sent** (if `ADMIN_PHONE` is set) ✅
   - **Admin WhatsApp is sent** (if WhatsApp credentials are set) ✅
   - Bot returns confirmation: "מעולה! 🙏 בקשת התור שלך התקבלה ומחכה לאישור מיטל"

2. **Admin sees booking and approves**
   - Admin logs in to dashboard
   - Booking appears in "Pending" tab
   - Admin clicks "Approve"
   - Status changes to "Approved"
   - **Client receives approval notification via WhatsApp** (or SMS fallback) ✅

3. **Client receives approval and confirms terms**
   - Client gets WhatsApp message: "התור שלך אושר!" + terms link
   - Client sends "1" to confirm terms reading
   - Status updated to `terms_confirmed`
   - Ready for the appointment ✅

## Files Changed Summary

```
supabase/functions/_shared/bot-config.ts
  - Added ADMIN_PHONE guard for SMS notification
  - Added 5 guards for WhatsApp notification (creds, waFrom, adminWa, base, adminToken)
  - Improved logging with specific skip reasons

supabase/functions/admin-action/index.ts
  - Added logging for RPC execution
  - Added logging for client notifications
  - Better error messages with booking IDs

supabase/functions/change-status/index.ts
  - Added logging for RPC execution
  - Better error logging with booking IDs

tests/integration/whatsapp-booking-integration.test.js
  - New integration test covering full flow

tests/e2e/whatsapp-booking-admin-approval.spec.js
  - New E2E test template using Playwright

test-whatsapp-booking.js
  - Manual test script with detailed logging
```

## Next Steps

1. Deploy the fixes to production
2. Run integration tests to verify
3. Monitor Supabase logs for any issues
4. Collect feedback from users
5. Iterate if needed
