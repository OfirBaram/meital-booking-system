import { createClient }                                 from 'npm:@supabase/supabase-js@2'
import { buildClientStatusSms, type ClientStatus }     from '../_shared/messages.ts'
import { twilioCredsFromEnv }                           from '../_shared/sms.ts'
import { sendAndLogSms, statusToContext, sendClientStatusNotification } from '../_shared/notify.ts'
import { toDialable }                                   from '../_shared/phone.ts'
import { validateAdminSession }                         from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS }                       from '../_shared/cors.ts'

const ALLOWED: string[] = ['Approved', 'Rejected', 'Cancelled']

// deno-lint-ignore no-explicit-any
async function notifyClient(supabase: any, bookingId: string, targetStatus: string, customBody?: string | null): Promise<void> {
  // Default (no custom body) → channel-aware notify (WhatsApp template for
  // WhatsApp bookings, else SMS). A custom admin SMS body keeps the SMS path below.
  if (!customBody) {
    await sendClientStatusNotification(supabase, bookingId, targetStatus.toLowerCase() as ClientStatus)
    return
  }
  const needsSlotFields = !customBody
  const { data: bk, error } = await supabase
    .from('bookings_view')
    .select(needsSlotFields ? 'name, phone, serviceName, date, time' : 'name, phone')
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !bk) {
    console.warn('[change-status] notify-skip: booking lookup failed', error?.message ?? 'not found')
    return
  }

  const status  = targetStatus.toLowerCase() as ClientStatus
  const context = statusToContext(status)
  if (!context) {
    console.warn('[change-status] notify-skip: unmapped status ' + status)
    return
  }

  const body = customBody || buildClientStatusSms(status, {
    serviceName: bk.serviceName,
    date:        bk.date,
    time:        bk.time,
  })

  const creds  = twilioCredsFromEnv()
  const result = await sendAndLogSms(supabase, {
    to: bk.phone, body, context, creds, appointmentId: bookingId,
    alertAdminPhone: toDialable(Deno.env.get('ADMIN_PHONE')), clientLabel: bk.name,
  })
  console.log('[change-status] client-sms result=' + result + ' status=' + status + ' to=****' + String(bk.phone).slice(-4))
}

Deno.serve(async (req) => {
  const cors = adminCors(req)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, ...SEC_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  try {
    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!await validateAdminSession(req, secret)) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const { bookingId, targetStatus, suppressSms, customSmsBody } = await req.json()

    if (!bookingId || !ALLOWED.includes(targetStatus)) {
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Capture the previous status for the audit log.
    const { data: prev } = await supabase
      .from('appointments')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle()

    const { data, error } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId,
      p_new_status: targetStatus.toLowerCase(),
    })

    if (error) throw error

    // Append-only audit record (fire-and-forget — never fails the primary action).
    supabase.from('audit_log').insert({
      action:     'change_status',
      booking_id: bookingId,
      prev_val:   prev?.status ?? null,
      new_val:    targetStatus.toLowerCase(),
      ip:         req.headers.get('x-forwarded-for') ?? 'unknown',
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
    }).then(() => {/* intentional no-op */}).catch((e: Error) =>
      console.error('[change-status] audit-insert failed', e.message)
    )

    if (data?.success === true && !suppressSms) {
      try {
        await notifyClient(supabase, bookingId, targetStatus, customSmsBody || null)
      } catch (smsErr) {
        console.error('[change-status] client-sms-fail:', smsErr instanceof Error ? smsErr.message : String(smsErr))
      }
    }

    return json(data)
  } catch (err) {
    console.error('[change-status]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
