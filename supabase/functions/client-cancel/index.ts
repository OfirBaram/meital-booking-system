// client-cancel: self-service cancellation (>48h policy enforced server-side).
// POST { booking_id } (Authorization: Bearer <client_token>)

import { createClient }                            from 'npm:@supabase/supabase-js@2'
import { SEC_HEADERS }                             from '../_shared/cors.ts'
import { verifyClientSession, extractBearerToken } from '../_shared/client-auth.ts'
import { sendAndLogSms }                           from '../_shared/notify.ts'
import { twilioCredsFromEnv }                      from '../_shared/sms.ts'
import { toDialable }                              from '../_shared/phone.ts'
import { buildClientSelfCancelSms, buildAdminSelfCancelSms } from '../_shared/messages.ts'

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

const TZ       = 'Asia/Jerusalem'
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const MIN_CANCEL_HOURS = 48

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const hmacSecret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    const rawToken   = extractBearerToken(req)
    if (!rawToken) return json({ success: false, error: 'missing_token' }, 401)

    const phone = await verifyClientSession(rawToken, hmacSecret)
    if (!phone) return json({ success: false, error: 'invalid_or_expired_token' }, 401)

    const { booking_id: bookingId } = await req.json()
    if (!bookingId) return json({ success: false, error: 'missing_booking_id' }, 400)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, status, treatment_name, clients!inner(phone, full_name), slots!inner(start_time)')
      .eq('id', bookingId)
      .maybeSingle()

    if (apptErr || !appt) return json({ success: false, error: 'booking_not_found' }, 404)

    // deno-lint-ignore no-explicit-any
    const cl = appt.clients as any
    if (cl.phone !== phone) return json({ success: false, error: 'forbidden' }, 403)
    if (!['pending', 'approved'].includes(appt.status)) return json({ success: false, error: 'booking_not_active' }, 400)

    // deno-lint-ignore no-explicit-any
    const startTime  = (appt.slots as any).start_time as string
    const hoursUntil = (new Date(startTime).getTime() - Date.now()) / 3_600_000
    if (hoursUntil <= MIN_CANCEL_HOURS) {
      return json({ success: false, error: 'too_late_to_cancel', hours_until: Math.round(hoursUntil) }, 400)
    }

    const { data: rpc, error: rpcErr } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId, p_new_status: 'cancelled',
    })
    if (rpcErr) { console.error('[client-cancel] rpc:', rpcErr.message); return json({ success: false, error: 'internal_error' }, 500) }
    if (!rpc?.success) return json({ success: false, error: rpc?.error ?? 'rpc_failed' }, 400)

    ;(async () => {
      try {
        await supabase.from('audit_log').insert({
          action: 'client_self_cancel', booking_id: bookingId,
          prev_val: appt.status, new_val: 'cancelled',
          ip: req.headers.get('x-forwarded-for') ?? 'unknown',
          user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
        })
      } catch (e) { console.error('[client-cancel] audit:', e instanceof Error ? e.message : String(e)) }
    })()

    const fields  = { serviceName: appt.treatment_name, date: DATE_FMT.format(new Date(startTime)), time: TIME_FMT.format(new Date(startTime)) }
    const creds   = twilioCredsFromEnv()
    const adminPh = toDialable(Deno.env.get('ADMIN_PHONE'))

    await sendAndLogSms(supabase, { to: phone, body: buildClientSelfCancelSms(fields), context: 'ClientSelfCancel', creds, appointmentId: bookingId, alertAdminPhone: adminPh, clientLabel: cl.full_name })
    if (adminPh) {
      await sendAndLogSms(supabase, { to: adminPh, body: buildAdminSelfCancelSms(cl.full_name, fields), context: 'AdminNotify', creds, appointmentId: bookingId })
    }

    console.log('[client-cancel] success bookingId=' + bookingId)
    return json({ success: true })
  } catch (err) {
    console.error('[client-cancel] unhandled:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
