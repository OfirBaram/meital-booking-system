import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildClientStatusSms, type ClientStatus } from '../_shared/messages.ts'
import { twilioCredsFromEnv } from '../_shared/sms.ts'
import { sendAndLogSms, statusToContext } from '../_shared/notify.ts'

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

const ALLOWED: string[] = ['Approved', 'Rejected', 'Cancelled']

// deno-lint-ignore no-explicit-any
async function notifyClient(supabase: any, bookingId: string, targetStatus: string): Promise<void> {
  // Pull the client + slot details from the denormalized view to build the SMS.
  const { data: bk, error } = await supabase
    .from('bookings_view')
    .select('name, phone, serviceName, date, time')
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

  const body = buildClientStatusSms(status, {
    serviceName: bk.serviceName,
    date:        bk.date,
    time:        bk.time,
  })

  // Send + record the outcome to communication_logs (SENT / ERROR / MOCK) so a
  // Twilio failure is visible in the admin console instead of being swallowed.
  const creds  = twilioCredsFromEnv()
  const result = await sendAndLogSms(supabase, {
    to: bk.phone, body, context, creds, appointmentId: bookingId,
    alertAdminPhone: Deno.env.get('ADMIN_PHONE'), clientLabel: bk.name,
  })
  console.log('[change-status] client-sms result=' + result + ' status=' + status + ' to=****' + String(bk.phone).slice(-4))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { adminToken, bookingId, targetStatus } = await req.json()

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    if (!bookingId || !ALLOWED.includes(targetStatus)) {
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId,
      p_new_status: targetStatus.toLowerCase(),  // DB stores lowercase
    })

    if (error) throw error

    // Notify the client on a successful transition. The status change is the
    // authoritative action — an SMS failure is logged but never fails the request.
    if (data?.success === true) {
      try {
        await notifyClient(supabase, bookingId, targetStatus)
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
