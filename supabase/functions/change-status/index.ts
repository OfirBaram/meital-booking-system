import { createClient }                                 from 'npm:@supabase/supabase-js@2'
import { buildClientStatusSms, type ClientStatus }     from '../_shared/messages.ts'
import { twilioCredsFromEnv, sendTwilioWhatsAppFreeform } from '../_shared/sms.ts'
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
  const { data: bk, error } = await supabase
    .from('bookings_view')
    .select('name, phone, source')
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

  const creds  = twilioCredsFromEnv()
  const waFrom = (Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '').trim()

  // WhatsApp-sourced bookings → send the admin's custom text via WhatsApp freeform.
  // Freeform works within the 24-hour session window (typical for same-day reviews).
  if (bk.source === 'whatsapp' && waFrom && creds) {
    try {
      await sendTwilioWhatsAppFreeform(bk.phone, customBody, creds, waFrom)
      ;(async () => {
        try {
          await supabase.from('communication_logs').insert({
            channel: 'whatsapp', recipient_phone: bk.phone, context, status: 'SENT',
            message_body: customBody.slice(0, 1000), appointment_id: bookingId,
          })
        } catch (logErr) {
          console.error('[change-status] wa-freeform log-fail:', logErr instanceof Error ? logErr.message : String(logErr))
        }
      })()
      console.log('[change-status] client-wa-freeform SENT status=' + status + ' to=****' + String(bk.phone).slice(-4))
      return
    } catch (waErr) {
      console.error('[change-status] wa-freeform failed → SMS fallback:', waErr instanceof Error ? waErr.message : String(waErr))
    }
  }

  const result = await sendAndLogSms(supabase, {
    to: bk.phone, body: customBody, context, creds, appointmentId: bookingId,
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

    console.log('[change-status] executing status change bookingId=' + bookingId + ' targetStatus=' + targetStatus)
    const { data, error } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId,
      p_new_status: targetStatus.toLowerCase(),
    })

    if (error) {
      console.error('[change-status] rpc-error bookingId=' + bookingId + ' error=' + error.message)
      throw error
    }

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
