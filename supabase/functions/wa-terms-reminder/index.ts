// wa-terms-reminder — sends WhatsApp terms reminders to clients who haven't confirmed.
//
// Policy:
//   • Piggybacked on the GAS daily send-reminders run (pg_cron removed, migration 20260620201125).
//   • Finds conversations where state='awaiting_terms' AND last reminder was >20h ago
//     AND reminder count < 2 (max 2 auto-reminders total).
//   • After 2 reminders with no confirmation, stops sending and logs an admin alert.
//   • Callable manually via POST (admin Pulse tab trigger).
//
// Admin POST: no body needed. Responds with { sent, skipped, errors }.

import { createClient }            from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }    from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS }  from '../_shared/cors.ts'
import { sendTwilioWhatsAppFreeform, sendTwilioSms, twilioCredsFromEnv } from '../_shared/sms.ts'
import { toDialable }              from '../_shared/phone.ts'

const MAX_REMINDERS   = 2
const MIN_HOURS_APART = 20   // don't re-send within 20 hours of last reminder

Deno.serve(async (req) => {
  const cors = adminCors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status, headers: { ...cors, ...SEC_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Admin session OR internal cron call (x-cron-secret header)
  const cronSecret  = (Deno.env.get('CRON_SECRET') ?? '').trim()
  const callerCron  = req.headers.get('x-cron-secret') === cronSecret && cronSecret.length > 0
  const hmacSecret  = (Deno.env.get('HMAC_SECRET') ?? '').trim()
  const adminAuthed = await validateAdminSession(req, hmacSecret)
  if (!callerCron && !adminAuthed) return json({ error: 'unauthorized' }, 403)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const creds    = twilioCredsFromEnv()
  const waFrom   = (Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '').trim()
  const termsUrl = (Deno.env.get('TWILIO_TERMS_MEDIA_URL') ?? '').trim()
  const adminPh  = toDialable(Deno.env.get('ADMIN_PHONE'))

  if (!creds || !waFrom) return json({ error: 'twilio_not_configured' }, 500)

  // Find conversations awaiting terms that are due for a reminder
  const { data: pending, error } = await supabase
    .from('whatsapp_conversations')
    .select('phone, terms_reminder_count, terms_reminder_sent_at, client_id')
    .eq('state', 'awaiting_terms')
    .lt('terms_reminder_count', MAX_REMINDERS)

  if (error) { console.error('[wa-terms-reminder] query:', error.message); return json({ error: 'db_error' }, 500) }

  let sent = 0, skipped = 0, errors = 0
  const now = Date.now()

  for (const row of pending ?? []) {
    const lastSent = row.terms_reminder_sent_at ? new Date(row.terms_reminder_sent_at).getTime() : 0
    const hoursSinceLast = (now - lastSent) / 3_600_000

    if (lastSent > 0 && hoursSinceLast < MIN_HOURS_APART) {
      skipped++
      continue
    }

    const newCount = (row.terms_reminder_count ?? 0) + 1
    const body = newCount === 1
      ? 'שלום! רציתי להזכיר — כדי לאשר את תורך, נא לקרוא ולאשר את התקנון שלי. שלחי 1 לאישור'
      : 'תזכורת אחרונה — נא לאשר את קריאת התקנון שלי על ידי שליחת 1. ללא אישור לא אוכל לאשר את התור'

    try {
      await sendTwilioWhatsAppFreeform(row.phone, body, creds, waFrom, termsUrl || undefined)
      await supabase.from('whatsapp_conversations')
        .update({ terms_reminder_count: newCount, terms_reminder_sent_at: new Date().toISOString() })
        .eq('phone', row.phone)
      console.log('[wa-terms-reminder] sent reminder #' + newCount + ' to ****' + String(row.phone).slice(-4))
      sent++
    } catch (e) {
      console.error('[wa-terms-reminder] send failed for ****' + String(row.phone).slice(-4) + ':', e instanceof Error ? e.message : String(e))
      errors++
    }
  }

  // After processing — find clients who hit max reminders with no response → admin alert
  const { data: overdue } = await supabase
    .from('wa_terms_pending')
    .select('client_name, phone, appointment_time')
    .gte('terms_reminder_count', MAX_REMINDERS)

  if (overdue && overdue.length > 0 && adminPh && creds) {
    const names = overdue.map((r: { client_name: string }) => r.client_name || '(לא ידוע)').join(', ')
    try {
      await sendTwilioSms(
        adminPh,
        'התראה: ' + overdue.length + ' לקוחות לא אישרו תקנון לאחר 2 תזכורות: ' + names,
        creds,
      )
      console.log('[wa-terms-reminder] admin alert sent for ' + overdue.length + ' overdue')
    } catch (alertErr) {
      console.error('[wa-terms-reminder] admin alert failed:', alertErr instanceof Error ? alertErr.message : String(alertErr))
    }
  }

  return json({ sent, skipped, errors, overdue_count: overdue?.length ?? 0 })
})
