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

// Israeli mobile: +972 5X XXXXXXXX
const PHONE_RE = /^\+9725\d{8}$/

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

const DAILY_LIMIT        = parseInt(Deno.env.get('DAILY_SMS_LIMIT') ?? '45', 10)
const OTP_TTL_SECONDS    = 300
const RATE_LIMIT_SECONDS = 30

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { phone: rawPhone } = await req.json()

    const phone = normalizePhone(rawPhone)
    if (!phone || !PHONE_RE.test(phone)) {
      return json({ success: false, error: 'invalid_phone' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Self-cleanup: prune expired rows (non-blocking)
    supabase.from('otp_requests')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .then(() => {})

    // Rate limit: reject if any OTP was sent to this phone in the last 30 s
    const rateCutoff = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('otp_requests')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', rateCutoff)

    if ((recentCount ?? 0) > 0) {
      return json({ success: false, error: 'rate_limited', retryAfter: RATE_LIMIT_SECONDS }, 429)
    }

    // Daily quota: count rows created in last 24 h (failed sends were rolled back)
    const quotaCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: dailyCount } = await supabase
      .from('otp_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', quotaCutoff)

    if ((dailyCount ?? 0) >= DAILY_LIMIT) {
      return json({ success: false, error: 'quota_exceeded' }, 503)
    }

    // Generate 6-digit OTP and hash it
    const rawDigits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
    const otp       = rawDigits.toString().padStart(6, '0')
    const otpHash   = await sha256Hex(otp)
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString()

    const { data: inserted, error: insertError } = await supabase
      .from('otp_requests')
      .insert({ phone, otp_hash: otpHash, expires_at: expiresAt })
      .select('id')
      .single()

    if (insertError) throw insertError

    // Send OTP SMS via Twilio
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')!

    const smsBody = 'קוד האימות ' +
                    'שלך: ' + otp +
                    '. בתוקף ל-5 דקות.'

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: fromNumber, Body: smsBody }),
      },
    )

    if (!twilioRes.ok) {
      const detail = await twilioRes.text()
      console.error('[send-otp] Twilio error:', detail)
      // Roll back so this attempt is not counted against quota and user can retry
      await supabase.from('otp_requests').delete().eq('id', inserted.id)
      return json({ success: false, error: 'sms_failed' }, 502)
    }

    return json({ success: true })
  } catch (err) {
    console.error('[send-otp]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
