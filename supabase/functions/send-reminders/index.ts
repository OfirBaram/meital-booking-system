import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendAndLogSms } from '../_shared/notify.ts'
import { twilioCredsFromEnv } from '../_shared/sms.ts'
import { toDialable } from '../_shared/phone.ts'
import { fullDateLabel } from '../_shared/messages.ts'

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

function tomorrowDateJerusalem(): string {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(tomorrow)
}

function buildReminderSms(name: string, serviceName: string, date: string, time: string): string {
  return [
    `שלום ${(name ?? '').split(' ')[0]} 👋`,
    `תזכורת: יש לך תור מחר!`,
    `שירות: ${serviceName}`,
    `תאריך: ${fullDateLabel(date)} בשעה ${time}`,
    '',
    'מחכה לך! 💅',
    'מיטל שבע ברעם — לק ג\'ל בוטיק',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { adminToken } = await req.json()

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const tomorrow = tomorrowDateJerusalem()

    const { data: bookings, error } = await supabase
      .from('bookings_view')
      .select('id, name, phone, serviceName, date, time')
      .eq('date', tomorrow)
      .eq('status', 'Approved')

    if (error) throw error

    const creds      = twilioCredsFromEnv()
    const adminPhone = toDialable(Deno.env.get('ADMIN_PHONE'))

    let sent = 0
    const results: { name: string; time: string; status: string }[] = []

    for (const booking of bookings ?? []) {
      const body  = buildReminderSms(booking.name, booking.serviceName, booking.date, booking.time)
      const phone = toDialable(booking.phone)
      const status = await sendAndLogSms(supabase, {
        to:              phone,
        body,
        context:         'DailyReminder',
        creds,
        appointmentId:   booking.id,
        alertAdminPhone: adminPhone,
        clientLabel:     booking.name,
      })
      if (status === 'SENT' || status === 'MOCK') sent++
      results.push({ name: booking.name, time: booking.time, status })
    }

    console.log(`[send-reminders] date=${tomorrow} total=${bookings?.length ?? 0} sent=${sent}`)
    return json({ success: true, sent, total: bookings?.length ?? 0, date: tomorrow, results })
  } catch (err) {
    console.error('[send-reminders]', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
