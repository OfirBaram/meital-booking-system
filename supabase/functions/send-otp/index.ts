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

const PHONE_RE = /^\+9725\d{8}$/

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

// ── Boot diagnostic ──────────────────────────────────────────────────
// Runs once when the Deno isolate starts. Logs which secrets are present
// (true/false only -- never logs actual values). If any required secret
// is absent, this tells you before the first request arrives.
const _BOOT = {
  SUPABASE_URL:              !!Deno.env.get('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  TWILIO_ACCOUNT_SID:        !!Deno.env.get('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN:         !!Deno.env.get('TWILIO_AUTH_TOKEN'),
  TWILIO_FROM_NUMBER:        !!Deno.env.get('TWILIO_FROM_NUMBER'),
  DAILY_SMS_LIMIT:           Deno.env.get('DAILY_SMS_LIMIT') ?? 'not set (default: 45)',
}
console.log('[send-otp] boot:', JSON.stringify(_BOOT))

const _REQUIRED = [
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
] as const
const _MISSING = _REQUIRED.filter(k => !_BOOT[k])
if (_MISSING.length > 0) {
  console.error('[send-otp] MISSING REQUIRED SECRETS:', _MISSING.join(', '))
}

const OTP_TTL_SECONDS    = 300
const RATE_LIMIT_SECONDS = 30

// ── Request handler ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── Step 1: parse + validate phone ──────────────────────────────
    const { phone: rawPhone } = await req.json()
    const phone = normalizePhone(rawPhone)
    if (!phone || !PHONE_RE.test(phone)) {
      return json({ success: false, error: 'invalid_phone' }, 400)
    }
    console.log('[send-otp] step:phone-ok suffix=****' + phone.slice(-4))

    // ── Step 2: create Supabase client ───────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.error('[send-otp] step:client-fail SUPABASE_URL or SERVICE_KEY missing at request time')
      return json({ success: false, error: 'internal_error' }, 500)
    }
    const supabase = createClient(supabaseUrl, serviceKey)
    console.log('[send-otp] step:client-ok')

    // Self-cleanup: prune expired rows fire-and-forget
    supabase.from('otp_requests')
      .delete().lt('expires_at', new Date().toISOString())
      .then(() => {})

    // ── Step 3: rate-limit check ─────────────────────────────────────
    const rateCutoff = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString()
    const { count: recentCount, error: rateError } = await supabase
      .from('otp_requests')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .gte('created_at', rateCutoff)

    if (rateError) {
      console.error('[send-otp] step:rate-check-fail', rateError.message, '| code:', rateError.code)
      throw rateError
    }
    console.log('[send-otp] step:rate-check-ok recentCount=' + recentCount)

    if ((recentCount ?? 0) > 0) {
      return json({ success: false, error: 'rate_limited', retryAfter: RATE_LIMIT_SECONDS }, 429)
    }

    // ── Step 4: daily quota check ────────────────────────────────────
    const DAILY_LIMIT = parseInt(Deno.env.get('DAILY_SMS_LIMIT') ?? '45', 10)
    const quotaCutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { count: dailyCount, error: quotaError } = await supabase
      .from('otp_requests')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', quotaCutoff)

    if (quotaError) {
      console.error('[send-otp] step:quota-check-fail', quotaError.message, '| code:', quotaError.code)
      throw quotaError
    }
    console.log('[send-otp] step:quota-check-ok dailyCount=' + dailyCount + ' limit=' + DAILY_LIMIT)

    if ((dailyCount ?? 0) >= DAILY_LIMIT) {
      return json({ success: false, error: 'quota_exceeded' }, 503)
    }

    // ── Step 5: generate OTP and insert row ──────────────────────────
    const rawDigits = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
    const otp       = rawDigits.toString().padStart(6, '0')
    const otpHash   = await sha256Hex(otp)
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString()

    const { data: inserted, error: insertError } = await supabase
      .from('otp_requests')
      .insert({ phone, otp_hash: otpHash, expires_at: expiresAt })
      .select('id')
      .single()

    if (insertError) {
      console.error('[send-otp] step:otp-insert-fail', insertError.message, '| code:', insertError.code)
      throw insertError
    }
    console.log('[send-otp] step:otp-inserted id=' + inserted.id)

    // ── Step 6: send SMS via Twilio ──────────────────────────────────
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      console.error('[send-otp] step:twilio-config-fail one or more Twilio secrets missing at request time')
      await supabase.from('otp_requests').delete().eq('id', inserted.id)
      return json({ success: false, error: 'internal_error' }, 500)
    }

    const smsBody   = 'קוד האימות שלך: ' + otp + '. בתוקף ל-5 דקות.'

    // Pre-flight log: confirm exact To/From going to Twilio.
    // Twilio error 21211 = "To" number invalid. Common causes:
    //   (a) Trial account: destination must be verified at twilio.com/console/phone-numbers/verified
    //   (b) fromNumber format wrong: must be E.164 (e.g. +14155551234 or your purchased number)
    //   (c) Alphanumeric sender ID requires country approval for Israel
    console.log('[send-otp] step:twilio-preflight to_suffix=****' + phone.slice(-4) + ' from_suffix=****' + fromNumber.slice(-4))

    const twilioRes = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: fromNumber, Body: smsBody }),
      },
    )
    console.log('[send-otp] step:twilio-response status=' + twilioRes.status)

    if (!twilioRes.ok) {
      const detail = await twilioRes.text()
      console.error('[send-otp] step:twilio-fail status=' + twilioRes.status + ' body=' + detail.slice(0, 300))
      await supabase.from('otp_requests').delete().eq('id', inserted.id)
      return json({ success: false, error: 'sms_failed' }, 502)
    }

    console.log('[send-otp] step:complete')
    return json({ success: true })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-otp] unhandled-error:', msg)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
