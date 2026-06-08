import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildAdminNewBookingSms } from '../_shared/messages.ts'
import { sendAndLogSms } from '../_shared/notify.ts'
import { toDialable } from '../_shared/phone.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const PHONE_RE         = /^\+9725\d{8}$/
const VALID_TREATMENTS = ['gel_classic', 'gel_feet']
const DATE_RE          = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE          = /^\d{2}:\d{2}$/
const OTP_RE           = /^\d{6}$/

function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length === 12) return '+' + digits
  if (digits.startsWith('05')  && digits.length === 10)  return '+972' + digits.slice(1)
  return null
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// deno-lint-ignore no-explicit-any
async function sendAdminSms(supabase: any, params: {
  adminPhone:    string
  accountSid:    string
  authToken:     string
  fromNumber:    string
  name:          string
  phone:         string
  serviceName:   string
  date:          string
  time:          string
  bookingId:     string
}): Promise<void> {
  const {
    adminPhone, accountSid, authToken, fromNumber,
    name, phone, serviceName, date, time, bookingId,
  } = params

  // LINK-FREE on purpose: carriers content-filter link-heavy admin SMS (see
  // buildAdminNewBookingSms). The admin approves/rejects from the dashboard.
  const body = buildAdminNewBookingSms({ name, phone, serviceName, date, time })

  const creds = accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null
  await sendAndLogSms(supabase, {
    to: adminPhone, body, context: 'AdminNotify', creds, appointmentId: bookingId,
  })
}

// ── Boot diagnostic ───────────────────────────────────────────────────
// Admin approve/reject links now point at the admin-action Edge Function on
// this same Supabase project (SUPABASE_URL), so GAS_URL is no longer used.
const _BOOT = {
  SUPABASE_URL:              !!Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  HMAC_SECRET:               !!Deno.env.get('HMAC_SECRET'),
  ADMIN_PHONE:               !!Deno.env.get('ADMIN_PHONE'),
  TWILIO_ACCOUNT_SID:        !!Deno.env.get('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN:         !!Deno.env.get('TWILIO_AUTH_TOKEN'),
  TWILIO_FROM_NUMBER:        !!Deno.env.get('TWILIO_FROM_NUMBER'),
}
console.log('[verify-and-book] boot:', JSON.stringify(_BOOT))

const _REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'HMAC_SECRET',
  'ADMIN_PHONE', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
] as const
const _MISSING = _REQUIRED.filter(k => !Deno.env.get(k))
if (_MISSING.length > 0) {
  console.error('[verify-and-book] MISSING REQUIRED SECRETS:', _MISSING.join(', '))
}

// ── Request handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { otp, booking } = await req.json()

    // ── Step 1: input validation ────────────────────────────────────
    if (!OTP_RE.test(otp ?? '')) {
      console.warn('[verify-and-book] step:input-fail otp_format_invalid')
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const phone = normalizePhone(booking?.phone)
    const inputOk =
      !!phone                                       &&
      PHONE_RE.test(phone)                          &&
      !!booking?.id                                 &&
      (booking?.name?.trim()?.length >= 2)          &&
      VALID_TREATMENTS.includes(booking?.service)   &&
      DATE_RE.test(booking?.date ?? '')             &&
      TIME_RE.test(booking?.time ?? '')             &&
      Number.isInteger(booking?.duration)

    if (!inputOk) {
      console.warn('[verify-and-book] step:input-fail booking_fields_invalid phone_ok=' + !!phone)
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    console.log('[verify-and-book] step:input-ok phone_suffix=****' + phone.slice(-4) + ' date=' + booking.date + ' time=' + booking.time)

    // ── Step 2: Supabase client ─────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.error('[verify-and-book] step:client-fail missing secrets at request time')
      return json({ success: false, error: 'internal_error' }, 500)
    }
    const supabase = createClient(supabaseUrl, serviceKey)

    // ── Step 3: fetch the latest valid OTP row ─────────────────────
    const now = new Date().toISOString()
    const { data: otpRow, error: fetchError } = await supabase
      .from('otp_requests')
      .select('id, otp_hash, expires_at, used')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      console.error('[verify-and-book] step:otp-fetch-fail', fetchError.message, '| code:', fetchError.code)
      throw fetchError
    }

    if (!otpRow) {
      // Count ALL rows for this phone to distinguish "never sent" from "expired/used"
      const { count } = await supabase
        .from('otp_requests')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
      console.warn(
        '[verify-and-book] step:lookup-result' +
        ' phone=****' + phone.slice(-4) +
        ' found=false' +
        ' total_rows_for_phone=' + count
      )
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    console.log(
      '[verify-and-book] step:lookup-result' +
      ' phone=****' + phone.slice(-4) +
      ' found=true' +
      ' otp_id=' + otpRow.id +
      ' expires_at=' + otpRow.expires_at +
      ' hash_prefix=' + otpRow.otp_hash.slice(0, 8)
    )

    // ── Step 4: hash comparison ─────────────────────────────────────
    // sha256Hex is identical in send-otp and verify-and-book:
    //   crypto.subtle SHA-256 → Uint8Array → hex string with padStart(2,'0')
    const submittedHash = await sha256Hex(otp)
    const hashMatch     = submittedHash === otpRow.otp_hash

    if (!hashMatch) {
      // Log first 8 chars only — enough to see obvious mismatches, not guessable
      console.warn(
        '[verify-and-book] step:hash-mismatch' +
        ' submitted_prefix=' + submittedHash.slice(0, 8) +
        ' stored_prefix='    + otpRow.otp_hash.slice(0, 8)
      )
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    console.log('[verify-and-book] step:hash-match')

    // ── Step 5: atomic mark-used (replay attack guard) ─────────────
    // Re-checks used=false and expires_at > now() so a double-submit
    // or expired-between-check race cannot re-use a consumed OTP.
    const { data: updated, error: updateError } = await supabase
      .from('otp_requests')
      .update({ used: true })
      .eq('id', otpRow.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('id')

    if (updateError) {
      console.error('[verify-and-book] step:mark-used-fail', updateError.message, '| code:', updateError.code)
      throw updateError
    }

    if (!updated || updated.length === 0) {
      // This branch fires if: (a) OTP was already consumed by a parallel request,
      // or (b) OTP expired in the ~1ms gap between the SELECT and this UPDATE.
      console.warn('[verify-and-book] step:mark-used-zero-rows otp_id=' + otpRow.id + ' likely_cause=race_or_expiry')
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    console.log('[verify-and-book] step:otp-consumed otp_id=' + updated[0].id)

    // ── Step 6: upsert client ───────────────────────────────────────
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({ phone, full_name: booking.name.trim() }, { onConflict: 'phone' })
      .select('id')
      .single()

    if (clientError) {
      console.error('[verify-and-book] step:client-upsert-fail', clientError.message)
      throw clientError
    }
    console.log('[verify-and-book] step:client-ok client_id=' + client.id)

    // ── Step 7: slot lookup ─────────────────────────────────────────
    console.log('[verify-and-book] step:slot-lookup-args p_date="' + String(booking.date) + '" p_time="' + String(booking.time) + '" date_type=' + typeof booking.date + ' time_type=' + typeof booking.time)
    const { data: slotData, error: slotLookupError } = await supabase
      .rpc('lookup_slot_by_date_time', { p_date: String(booking.date), p_time: String(booking.time) })

    if (slotLookupError) {
      console.error('[verify-and-book] step:slot-lookup-fail', slotLookupError.message)
      throw slotLookupError
    }

    // The SQL function may be defined as RETURNS bigint (scalar → null when not found)
    // or RETURNS SETOF bigint (set → [] when not found). An empty array is truthy in JS
    // so !slotData misses it, causing [] to reach lock_slot_for_booking as a bigint → crash.
    // Normalise both shapes to a single scalar value or null.
    const slotId = Array.isArray(slotData)
      ? (slotData.length > 0 ? slotData[0] : null)
      : slotData

    if (!slotId) {
      const { data: sampleSlots } = await supabase
        .from('slots')
        .select('id, start_time, status')
        .eq('status', 'available')
        .order('start_time')
        .limit(3)
      console.warn(
        '[verify-and-book] step:slot-not-found' +
        ' date=' + booking.date +
        ' time=' + booking.time +
        ' raw=' + JSON.stringify(slotData) +
        ' sample_available_slots=' + JSON.stringify(sampleSlots)
      )
      return json({ success: false, error: 'slot_not_available' }, 409)
    }
    console.log('[verify-and-book] step:slot-found slot_id=' + slotId)

    // ── Step 8: generate admin token ───────────────────────────────
    const hmacSecret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!hmacSecret) {
      console.error('[verify-and-book] step:hmac-secret-missing HMAC_SECRET is not set — cannot generate admin token')
      return json({ success: false, error: 'internal_error' }, 500)
    }
    const adminToken = await hmacSha256Hex(hmacSecret, booking.id)

    // ── Step 9: lock the slot ───────────────────────────────────────
    const { data: locked, error: lockError } = await supabase
      .rpc('lock_slot_for_booking', { p_slot_id: String(slotId) })

    if (lockError) {
      console.error('[verify-and-book] step:lock-rpc-fail', lockError.message)
      throw lockError
    }

    if (!locked) {
      console.warn('[verify-and-book] step:slot-taken slot_id=' + slotId)
      return json({ success: false, error: 'slot_not_available' }, 409)
    }
    console.log('[verify-and-book] step:slot-locked slot_id=' + slotId)

    // ── Step 10: create appointment record ──────────────────────────
    const { error: apptError } = await supabase
      .from('appointments')
      .insert({
        id:             booking.id,
        client_id:      client.id,
        slot_id:        slotId,
        treatment_type: booking.service,
        treatment_name: booking.serviceName,
        duration_min:   booking.duration,
        is_verified:    true,
        status:         'pending',
        admin_token:    adminToken,
      })

    if (apptError) {
      console.error('[verify-and-book] step:appt-insert-fail', apptError.message)
      // Compensate: restore the slot so it can be rebooked
      await supabase
        .from('slots')
        .update({ status: 'available', last_updated: new Date().toISOString() })
        .eq('id', slotId)
        .then(() => console.log('[verify-and-book] step:slot-unlocked slot_id=' + slotId))
      throw apptError
    }

    console.log('[verify-and-book] step:booking-created booking_id=' + booking.id)

    // ── Step 9: admin SMS (fire-and-forget) ─────────────────────────
    // Link-free heads-up; admin approves/rejects in the dashboard. admin_token
    // is still stored on the appointment so the admin-action link path remains
    // usable, it's just no longer pushed via SMS (carrier link filtering).
    sendAdminSms(supabase, {
      adminPhone:    toDialable(Deno.env.get('ADMIN_PHONE')),
      accountSid:    Deno.env.get('TWILIO_ACCOUNT_SID')!,
      authToken:     Deno.env.get('TWILIO_AUTH_TOKEN')!,
      fromNumber:    Deno.env.get('TWILIO_FROM_NUMBER')!,
      name:          booking.name.trim(),
      phone,
      serviceName: booking.serviceName,
      date:        booking.date,
      time:        booking.time,
      bookingId:   booking.id,
    }).catch(e => console.warn('[verify-and-book] admin-sms-fail:', e.message))

    console.log('[verify-and-book] step:complete booking_id=' + booking.id)
    return json({ success: true, bookingId: booking.id, status: 'Pending' })

  } catch (err) {
    const msg   = err instanceof Error ? err.message         : String(err)
    const stack = err instanceof Error ? (err.stack ?? '—')  : '—'
    console.error('[verify-and-book] unhandled-error:', msg, '| stack:', stack)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
