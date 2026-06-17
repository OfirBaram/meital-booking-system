// client-reschedule: atomic slot-swap initiated by the authenticated client.
// Policy: >48h before current appointment, reschedule_count < 1 (one change per booking).
// POST { booking_id, new_date: "YYYY-MM-DD", new_time: "HH:MM" }

import { createClient }                                      from 'npm:@supabase/supabase-js@2'
import { SEC_HEADERS }                                       from '../_shared/cors.ts'
import { verifyClientSession, extractBearerToken }           from '../_shared/client-auth.ts'
import { sendAndLogSms }                                     from '../_shared/notify.ts'
import { twilioCredsFromEnv }                                from '../_shared/sms.ts'
import { toDialable }                                        from '../_shared/phone.ts'
import { buildClientRescheduleSms, buildAdminRescheduleSms } from '../_shared/messages.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-session',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, ...SEC_HEADERS, 'Content-Type': 'application/json' },
  })
}

const TZ       = 'Asia/Jerusalem'
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE  = /^\d{2}:\d{2}$/
const MIN_RESCHEDULE_HOURS = 48

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const hmacSecret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    const rawToken   = extractBearerToken(req)
    if (!rawToken) return json({ success: false, error: 'missing_token' }, 401)

    const phone = await verifyClientSession(rawToken, hmacSecret)
    if (!phone) return json({ success: false, error: 'invalid_or_expired_token' }, 401)

    const { booking_id: bookingId, new_date: newDate, new_time: newTime } = await req.json()
    if (!bookingId || !DATE_RE.test(newDate ?? '') || !TIME_RE.test(newTime ?? '')) {
      return json({ success: false, error: 'missing_or_invalid_fields' }, 400)
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('id, status, slot_id, reschedule_count, treatment_type, treatment_name, clients!inner(phone, full_name), slots!inner(start_time)')
      .eq('id', bookingId)
      .maybeSingle()

    if (apptErr || !appt) return json({ success: false, error: 'booking_not_found' }, 404)

    // deno-lint-ignore no-explicit-any
    const cl = appt.clients as any
    if (cl.phone !== phone) return json({ success: false, error: 'forbidden' }, 403)
    if (!['pending', 'approved'].includes(appt.status)) return json({ success: false, error: 'booking_not_active' }, 400)
    if (appt.reschedule_count >= 1) return json({ success: false, error: 'reschedule_limit_reached' }, 400)

    // deno-lint-ignore no-explicit-any
    const currentStart = (appt.slots as any).start_time as string
    const hoursUntil   = (new Date(currentStart).getTime() - Date.now()) / 3_600_000
    if (hoursUntil <= MIN_RESCHEDULE_HOURS) {
      return json({ success: false, error: 'too_late_to_reschedule', hours_until: Math.round(hoursUntil) }, 400)
    }

    // Resolve slot ID via existing DST-safe RPC
    const { data: newSlotId, error: lookupErr } = await supabase
      .rpc('lookup_slot_by_date_time', { p_date: newDate, p_time: newTime })
    if (lookupErr) { console.error('[client-reschedule] lookup:', lookupErr.message); return json({ success: false, error: 'internal_error' }, 500) }
    if (!newSlotId) return json({ success: false, error: 'new_slot_not_available' }, 409)

    const { data: newSlotRow } = await supabase.from('slots').select('start_time').eq('id', newSlotId).maybeSingle()
    if (!newSlotRow) return json({ success: false, error: 'new_slot_not_found' }, 404)

    const { data: rpc, error: rpcErr } = await supabase.rpc('swap_slot_for_reschedule', {
      p_appointment_id: bookingId, p_old_slot_id: appt.slot_id, p_new_slot_id: newSlotId,
    })
    if (rpcErr) { console.error('[client-reschedule] swap:', rpcErr.message); return json({ success: false, error: 'internal_error' }, 500) }
    if (!rpc?.success) {
      return json({ success: false, error: rpc?.error ?? 'rpc_failed' }, rpc?.error === 'new_slot_not_available' ? 409 : 400)
    }

    ;(async () => {
      try {
        await supabase.from('audit_log').insert({
          action: 'client_self_reschedule', booking_id: bookingId, slot_id: newSlotId,
          prev_val: String(appt.slot_id), new_val: String(newSlotId),
          ip: req.headers.get('x-forwarded-for') ?? 'unknown',
          user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
        })
      } catch (e) { console.error('[client-reschedule] audit:', e instanceof Error ? e.message : String(e)) }
    })()

    const newStart = newSlotRow.start_time as string
    const fields = {
      serviceName: appt.treatment_name,
      oldDate: DATE_FMT.format(new Date(currentStart)), oldTime: TIME_FMT.format(new Date(currentStart)),
      newDate: DATE_FMT.format(new Date(newStart)),     newTime: TIME_FMT.format(new Date(newStart)),
    }
    const creds   = twilioCredsFromEnv()
    const adminPh = toDialable(Deno.env.get('ADMIN_PHONE'))

    await sendAndLogSms(supabase, { to: phone, body: buildClientRescheduleSms(fields), context: 'ClientReschedule', creds, appointmentId: bookingId, alertAdminPhone: adminPh, clientLabel: cl.full_name })
    if (adminPh) {
      await sendAndLogSms(supabase, { to: adminPh, body: buildAdminRescheduleSms(cl.full_name, fields), context: 'AdminNotify', creds, appointmentId: bookingId })
    }

    console.log('[client-reschedule] success bookingId=' + bookingId + ' newSlot=' + newSlotId)
    return json({ success: true, new_date: fields.newDate, new_time: fields.newTime })
  } catch (err) {
    console.error('[client-reschedule] unhandled:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
