/**
 * otp-tester — TEMPORARY diagnostic function.
 *
 * Performs the exact same hash-and-lookup logic as verify-and-book
 * WITHOUT sending any SMS or creating any booking.
 *
 * DELETE after debugging:
 *   supabase functions delete otp-tester
 *
 * Security gate: requires header  x-diag-key: <value of DIAG_KEY secret>
 * Set DIAG_KEY in Supabase Dashboard → Settings → Edge Function Secrets.
 * Use any long random string, e.g.:  openssl rand -hex 32
 *
 * Usage:
 *   curl -X POST https://<ref>.supabase.co/functions/v1/otp-tester \
 *     -H "Content-Type: application/json" \
 *     -H "x-diag-key: <your-diag-key>" \
 *     -d '{"phone":"0542290881","otp":"123456"}'
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-diag-key',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Identical helpers to send-otp / verify-and-book ──────────────────────

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

// ── Request handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // ── Auth gate ────────────────────────────────────────────────────────────
  const diagKey = (Deno.env.get('DIAG_KEY') ?? '').trim()
  if (!diagKey) {
    return json({ error: 'DIAG_KEY secret not set — add it in Supabase Secrets' }, 500)
  }
  if (req.headers.get('x-diag-key') !== diagKey) {
    return json({ error: 'unauthorized' }, 401)
  }

  // ── Parse input ──────────────────────────────────────────────────────────
  let rawPhone: string
  let rawOtp: string
  try {
    const body = await req.json()
    rawPhone = body.phone ?? ''
    rawOtp   = body.otp   ?? ''
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    input: { raw_phone: rawPhone, otp_length: rawOtp.length },
  }

  // ── Step 1: phone normalization ──────────────────────────────────────────
  const phone = normalizePhone(rawPhone)
  const PHONE_RE = /^\+9725\d{8}$/

  report['step1_normalization'] = {
    normalized: phone,
    passes_regex: phone ? PHONE_RE.test(phone) : false,
    verdict: (phone && PHONE_RE.test(phone)) ? 'OK' : 'FAIL — phone would be rejected at input validation',
  }

  if (!phone || !PHONE_RE.test(phone)) {
    report['conclusion'] = 'BLOCKED at step 1 — phone normalization failed'
    return json(report, 400)
  }

  // ── Step 2: OTP format ───────────────────────────────────────────────────
  const OTP_RE = /^\d{6}$/
  report['step2_otp_format'] = {
    value_length:  rawOtp.length,
    passes_regex:  OTP_RE.test(rawOtp),
    verdict: OTP_RE.test(rawOtp) ? 'OK' : 'FAIL — OTP must be exactly 6 digits',
  }

  if (!OTP_RE.test(rawOtp)) {
    report['conclusion'] = 'BLOCKED at step 2 — OTP format invalid'
    return json(report, 400)
  }

  // ── Step 3: Supabase client ──────────────────────────────────────────────
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    report['conclusion'] = 'BLOCKED at step 3 — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing'
    return json(report, 500)
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
  const supabase = createClient(supabaseUrl, serviceKey)

  // ── Step 4: DB lookup — ALL rows for this phone (not just valid ones) ────
  // This lets us distinguish: never sent / expired / used / valid
  const { data: allRows, error: allRowsError } = await supabase
    .from('otp_requests')
    .select('id, phone, otp_hash, expires_at, used, created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(10)

  if (allRowsError) {
    report['step4_db_lookup'] = { error: allRowsError.message, code: allRowsError.code }
    report['conclusion'] = 'BLOCKED at step 4 — DB query failed (check RLS policies on otp_requests)'
    return json(report, 500)
  }

  const now = new Date()
  const annotatedRows = (allRows ?? []).map(row => ({
    id:         row.id,
    phone:      row.phone,
    created_at: row.created_at,
    expires_at: row.expires_at,
    used:       row.used,
    state:      row.used
                  ? 'used'
                  : new Date(row.expires_at) < now
                    ? 'expired'
                    : 'valid',
    hash_prefix: (row.otp_hash as string).slice(0, 8),
  }))

  report['step4_all_rows_for_phone'] = {
    count:   annotatedRows.length,
    rows:    annotatedRows,
    verdict: annotatedRows.length === 0
               ? 'FAIL — no rows at all. send-otp either failed silently or stored a different phone string'
               : 'OK — rows found',
  }

  if (annotatedRows.length === 0) {
    report['conclusion'] = 'BLOCKED at step 4 — no OTP rows for this phone in the database'
    return json(report, 200)
  }

  // ── Step 5: find the valid row (mirrors verify-and-book exactly) ─────────
  const nowIso   = now.toISOString()
  const validRow = (allRows ?? []).find(r => !r.used && r.expires_at > nowIso) ?? null

  report['step5_valid_row'] = {
    found:      validRow !== null,
    row_id:     validRow?.id ?? null,
    expires_at: validRow?.expires_at ?? null,
    verdict:    validRow ? 'OK — valid row exists' : 'FAIL — no valid (non-expired, non-used) row found',
  }

  if (!validRow) {
    const states = annotatedRows.map(r => r.state)
    report['conclusion'] = 'BLOCKED at step 5 — no valid OTP row. States of existing rows: ' + states.join(', ')
    return json(report, 200)
  }

  // ── Step 6: hash the submitted OTP and compare ───────────────────────────
  const submittedHash = await sha256Hex(rawOtp)
  const storedHash    = validRow.otp_hash as string
  const hashMatch     = submittedHash === storedHash

  report['step6_hash_comparison'] = {
    submitted_hash_prefix: submittedHash.slice(0, 8),
    stored_hash_prefix:    storedHash.slice(0, 8),
    full_match:            hashMatch,
    verdict: hashMatch
               ? 'OK — hashes match. This OTP is correct.'
               : 'FAIL — hash mismatch. The OTP you entered does not match what was stored. ' +
                 'Either the wrong code was entered, or a resend replaced this row.',
  }

  // ── Final conclusion ─────────────────────────────────────────────────────
  if (hashMatch) {
    report['conclusion'] =
      'ALL STEPS PASSED — OTP is valid and would be accepted by verify-and-book. ' +
      'If verify-and-book still returns 500, the failure is in step 6 (client upsert), ' +
      'step 7 (slot lookup RPC), or step 8 (lock_slot_for_booking RPC). ' +
      'Check the verify-and-book logs for step:client-upsert-fail, step:slot-lookup-fail, or step:lock-rpc-null.'
  } else {
    report['conclusion'] =
      'OTP hash mismatch — this is the invalid_otp 400, not a 500. ' +
      'Check that you are entering the code from the most recent SMS.'
  }

  return json(report, 200)
})
