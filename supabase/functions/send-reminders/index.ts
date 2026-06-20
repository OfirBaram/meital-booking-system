import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendAndLogSms } from '../_shared/notify.ts'
import { twilioCredsFromEnv, sendTwilioWhatsAppFreeform } from '../_shared/sms.ts'
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

    // WhatsApp terms reminders — piggybacked on daily job, no extra cron
    const waFrom   = (Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '').trim()
    const termsUrl = (Deno.env.get('TWILIO_TERMS_MEDIA_URL') ?? '').trim()
    if (waFrom && creds) {
      const MAX_TERMS = 2
      const MIN_H     = 20
      const nowMs     = Date.now()
      const { data: pending } = await supabase
        .from('whatsapp_conversations')
        .select('phone, terms_reminder_count, terms_reminder_sent_at')
        .eq('state', 'awaiting_terms')
        .lt('terms_reminder_count', MAX_TERMS)
      let termsSent = 0, termsSkipped = 0
      for (const row of pending ?? []) {
        const lastMs = row.terms_reminder_sent_at ? new Date(row.terms_reminder_sent_at).getTime() : 0
        if (lastMs > 0 && (nowMs - lastMs) / 3_600_000 < MIN_H) { termsSkipped++; continue }
        const newCount = (row.terms_reminder_count ?? 0) + 1
        const waBody = newCount === 1
          ? 'שלום! רצינו להזכיר — כדי לאשר את תורך, נא לקרוא ולאשר את התקנון שלנו. שלחי 1 לאישור'
          : 'תזכורת אחרונה — נא לאשר את קריאת התקנון שלנו על ידי שליחת 1. ללא אישור לא נוכל לאשר את התור'
        try {
          await sendTwilioWhatsAppFreeform(row.phone, waBody, creds, waFrom, termsUrl || undefined)
          ;(async () => {
            try {
              await supabase.from('whatsapp_conversations')
                .update({ terms_reminder_count: newCount, terms_reminder_sent_at: new Date().toISOString() })
                .eq('phone', row.phone)
            } catch (e) { console.warn('[send-reminders] terms-upd', e instanceof Error ? e.message : String(e)) }
          })()
          termsSent++
        } catch (termsErr) {
          console.warn('[send-reminders] terms WA ****' + String(row.phone).slice(-4) + ':',
            termsErr instanceof Error ? termsErr.message : String(termsErr))
        }
      }
      if (adminPhone) {
        const { data: overdue } = await supabase.from('wa_terms_pending')
          .select('client_name').gte('terms_reminder_count', MAX_TERMS)
        if (overdue && overdue.length > 0) {
          const names = overdue.map((r: { client_name: string }) => r.client_name || '(לא ידוע)').join(', ')
          await sendAndLogSms(supabase, {
            to: adminPhone,
            body: 'התראה: ' + overdue.length + ' לקוחות לא אישרו תקנון לאחר 2 תזכורות: ' + names,
            context: 'TermsAlert', creds, alertAdminPhone: null, clientLabel: 'admin',
          })
        }
      }
      console.log('[send-reminders] terms sent=' + termsSent + ' skipped=' + termsSkipped)
    }

    return json({ success: true, sent, total: bookings?.length ?? 0, date: tomorrow, results })
  } catch (err) {
    console.error('[send-reminders]', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
