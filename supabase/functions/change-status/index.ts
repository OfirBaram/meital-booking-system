import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildClientStatusSms, type ClientStatus } from '../_shared/messages.ts'
import { sendTwilioSms, twilioCredsFromEnv } from '../_shared/sms.ts'

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
    .select('phone, serviceName, date, time')
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !bk) {
    console.warn('[change-status] notify-skip: booking lookup failed', error?.message ?? 'not found')
    return
  }

  const creds = twilioCredsFromEnv()
  if (!creds) {
    console.error('[change-status] notify-skip: Twilio secrets missing')
    return
  }

  const status = targetStatus.toLowerCase() as ClientStatus
  const body   = buildClientStatusSms(status, {
    serviceName: bk.serviceName,
    date:        bk.date,
    time:        bk.time,
  })

  await sendTwilioSms(bk.phone, body, creds)
  console.log('[change-status] client-sms-sent status=' + status + ' to=****' + String(bk.phone).slice(-4))
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
