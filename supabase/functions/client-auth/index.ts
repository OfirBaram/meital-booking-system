// client-auth: verifies OTP and issues a 1h client session token.
// POST { phone, otp } -> { success: true, token } | { success: false, error }

import { createClient }      from 'npm:@supabase/supabase-js@2'
import { SEC_HEADERS }       from '../_shared/cors.ts'
import { signClientSession } from '../_shared/client-auth.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, ...SEC_HEADERS, 'Content-Type': 'application/json' },
  })
}

const PHONE_RE = /^\+9725\d{8}$/
const OTP_RE   = /^\d{6}$/

function normalizePhone(raw: string): string | null {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('972') && d.length === 12) return '+' + d
  if (d.startsWith('05')  && d.length === 10)  return '+972' + d.slice(1)
  return null
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { phone: rawPhone, otp: rawOtp } = await req.json()
    const phone = normalizePhone(rawPhone)
    if (!phone || !PHONE_RE.test(phone)) return json({ success: false, error: 'invalid_phone' }, 400)
    if (!rawOtp || !OTP_RE.test(String(rawOtp))) return json({ success: false, error: 'invalid_otp_format' }, 400)

    const supabase   = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const hmacSecret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!hmacSecret) { console.error('[client-auth] HMAC_SECRET missing'); return json({ success: false, error: 'internal_error' }, 500) }

    const { data: otpRow, error: otpErr } = await supabase
      .from('otp_requests')
      .select('id, otp_hash')
      .eq('phone', phone)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (otpErr) { console.error('[client-auth] otp-lookup:', otpErr.message); return json({ success: false, error: 'internal_error' }, 500) }
    if (!otpRow) return json({ success: false, error: 'otp_not_found_or_expired' }, 400)

    const hash = await sha256Hex(String(rawOtp))
    if (hash !== otpRow.otp_hash) {
      console.log('[client-auth] otp-mismatch suffix=****' + phone.slice(-4))
      return json({ success: false, error: 'invalid_otp' }, 400)
    }

    await supabase.from('otp_requests').update({ used: true }).eq('id', otpRow.id)

    const sessionToken = await signClientSession(phone, hmacSecret)
    console.log('[client-auth] success suffix=****' + phone.slice(-4))
    return json({ success: true, token: sessionToken })
  } catch (err) {
    console.error('[client-auth] unhandled:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
