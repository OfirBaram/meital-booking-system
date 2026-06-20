import { createClient }           from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }   from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'
import { twilioCredsFromEnv, sendTwilioWhatsApp } from '../_shared/sms.ts'

// Admin triage of bot-escalated tickets (support_requests).
//   action 'list'    -> open tickets first, newest within each group.
//   action 'resolve' -> close a ticket AND notify the client on WhatsApp.
// Mirrors admin-flags: session-auth (HMAC), service-role client, audit log.

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

    const body       = await req.json()
    const { action } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── list ───────────────────────────────────────────────────
    if (action === 'list') {
      const { data, error } = await supabase
        .from('support_requests')
        .select('id, phone, reason, snapshot, status, created_at, resolved_at')
        .order('status',     { ascending: true })   // 'open' sorts before 'resolved'
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return json({ success: true, requests: data ?? [] })
    }

    // ── resolve ────────────────────────────────────────────────
    if (action === 'resolve') {
      const { id } = body
      if (typeof id !== 'string' || !id) return json({ success: false, error: 'id required' }, 400)

      // ATOMIC guard: only flip rows STILL open. A second concurrent resolve gets
      // zero rows back, so the client is notified exactly once.
      const { data: rows, error: updErr } = await supabase
        .from('support_requests')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'open')
        .select('id, phone')
      if (updErr) throw updErr
      if (!rows || rows.length === 0) {
        return json({ success: true, alreadyResolved: true })
      }

      const phone = rows[0].phone as string | null
      let notified = false

      // Notify the client on WhatsApp — best-effort; never fails the resolve.
      if (phone) {
        const creds  = twilioCredsFromEnv()
        const waFrom = (Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '').trim()
        if (creds && waFrom) {
          try {
            await sendTwilioWhatsApp(
              phone,
              'היי 💛 הטיפול בבקשתך אצל מיטל הסתיים. אני כאן לכל שאלה נוספת — פשוט כתבי לי.',
              creds, waFrom,
            )
            notified = true
            await supabase.from('support_requests')
              .update({ resolved_notified_at: new Date().toISOString() })
              .eq('id', id)
            ;(async () => {
              try {
                await supabase.from('communication_logs').insert({
                  channel: 'whatsapp', recipient_phone: phone,
                  context: 'SupportResolved', status: 'SENT',
                  message_body: 'support resolved notice',
                })
              } catch (e) { console.error('[admin-support] log insert failed', e) }
            })()
          } catch (e) {
            console.error('[admin-support] WhatsApp notify failed', e)
          }
        }
      }

      ;(async () => {
        try {
          await supabase.from('audit_log').insert({
            action:     'resolve_support_request',
            new_val:    id,
            ip:         req.headers.get('x-forwarded-for') ?? 'unknown',
            user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
          })
        } catch (e) { console.error('[admin-support] audit insert failed', e) }
      })()

      return json({ success: true, notified })
    }

    return json({ success: false, error: 'unknown_action' }, 400)

  } catch (err) {
    console.error('[admin-support]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
