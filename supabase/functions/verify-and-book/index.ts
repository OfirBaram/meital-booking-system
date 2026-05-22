import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (digits.startsWith('05') && digits.length === 10)  return '+972' + digits.slice(1)
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

async function sendAdminSms(params: {
  adminPhone:  string
  accountSid:  string
  authToken:   string
  fromNumber:  string
  gasUrl:      string
  name:        string
  phone:       string
  serviceName: string
  date:        string
  time:        string
  bookingId:   string
  adminToken:  string
}): Promise<void> {
  const {
    adminPhone, accountSid, authToken, fromNumber, gasUrl,
    name, phone, serviceName, date, time, bookingId, adminToken,
  } = params

  const approveUrl = `${gasUrl}?action=approve&bookingId=${bookingId}&token=${adminToken}`
  const rejectUrl  = `${gasUrl}?action=reject&bookingId=${bookingId}&token=${adminToken}`

  const body =
    'הזמנה חדשה!\n' +
    name + ' (' + phone + ')\n' +
    serviceName + '\n' +
    date + ' ' + time + '\n' +
    'אשר: ' + approveUrl + '\n' +
    'דחה: ' + rejectUrl

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: adminPhone, From: fromNumber, Body: body }),
    },
  )

  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text()}`)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { otp, booking } = await req.json()

    // ── Input validation ────────────────────────────────────────────
    if (!OTP_RE.test(otp ?? '')) {
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const phone = normalizePhone(booking?.phone)
    if (
      !phone                                        ||
      !PHONE_RE.test(phone)                         ||
      !booking?.id                                  ||
      !(booking?.name?.trim()?.length >= 2)         ||
      !VALID_TREATMENTS.includes(booking?.service)  ||
      !DATE_RE.test(booking?.date ?? '')            ||
      !TIME_RE.test(booking?.time ?? '')            ||
      !Number.isInteger(booking?.duration)
    ) {
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── OTP validation ────────────────────────────────────────────
    const { data: otpRow } = await supabase
      .from('otp_requests')
      .select('id, otp_hash')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!otpRow) {
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    const submittedHash = await sha256Hex(otp)
    if (submittedHash !== otpRow.otp_hash) {
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    // Mark OTP used — atomic guard against replay / double-submit
    const { data: updated } = await supabase
      .from('otp_requests')
      .update({ used: true })
      .eq('id', otpRow.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .select('id')

    if (!updated || updated.length === 0) {
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    // ── Client upsert ───────────────────────────────────────────────
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .upsert({ phone, full_name: booking.name.trim() }, { onConflict: 'phone' })
      .select('id')
      .single()

    if (clientError) throw clientError

    // ── Slot lookup ─────────────────────────────────────────────────
    const { data: slotId, error: slotLookupError } = await supabase
      .rpc('lookup_slot_by_date_time', { p_date: booking.date, p_time: booking.time })

    if (slotLookupError) throw slotLookupError

    if (!slotId) {
      return json({ success: false, error: 'slot_not_available' }, 409)
    }

    // ── Admin token + atomic booking ──────────────────────────────────
    const adminToken = await hmacSha256Hex(Deno.env.get('HMAC_SECRET')!, booking.id)

    const { data: bookingResult, error: rpcError } = await supabase
      .rpc('lock_slot_for_booking', {
        p_slot_id:        slotId,
        p_client_id:      client.id,
        p_booking_id:     booking.id,
        p_treatment_type: booking.service,
        p_treatment_name: booking.serviceName,
        p_duration_min:   booking.duration,
        p_admin_token:    adminToken,
      })

    if (rpcError) throw rpcError

    if (!bookingResult.success) {
      // Defense in depth: the RPC now returns typed codes only (see
      // 20260527000000_lock_slot_safe_errors.sql), but we still whitelist
      // so a future regression to the SQL can never leak SQLERRM.
      const SAFE_CODES = new Set([
        'slot_not_available', 'slot_not_found',
        'booking_id_exists', 'invalid_reference', 'invalid_input',
      ])
      const code = SAFE_CODES.has(bookingResult.error) ? bookingResult.error : 'internal_error'
      const status =
        code === 'internal_error'                                  ? 500 :
        code === 'invalid_input' || code === 'invalid_reference'   ? 400 :
        409  // slot_not_available, slot_not_found, booking_id_exists
      return json({ success: false, error: code }, status)
    }

    // ── Admin SMS — fire-and-forget ────────────────────────────────────────
    sendAdminSms({
      adminPhone:  Deno.env.get('ADMIN_PHONE')!,
      accountSid:  Deno.env.get('TWILIO_ACCOUNT_SID')!,
      authToken:   Deno.env.get('TWILIO_AUTH_TOKEN')!,
      fromNumber:  Deno.env.get('TWILIO_FROM_NUMBER')!,
      gasUrl:      Deno.env.get('GAS_URL')!,
      name:        booking.name.trim(),
      phone,
      serviceName: booking.serviceName,
      date:        booking.date,
      time:        booking.time,
      bookingId:   booking.id,
      adminToken,
    }).catch(e => console.warn('[verify-and-book] admin SMS failed:', e.message))

    return json({ success: true, bookingId: booking.id, status: 'Pending' })
  } catch (err) {
    console.error('[verify-and-book]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
