// client-portal: returns the authenticated client's active booking + history.
// GET (Authorization: Bearer <client_token>)
// -> { success: true, active: Booking|null, history: Booking[] }

import { createClient }                            from 'npm:@supabase/supabase-js@2'
import { SEC_HEADERS }                             from '../_shared/cors.ts'
import { verifyClientSession, extractBearerToken } from '../_shared/client-auth.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
const MIN_HOURS = 48

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const hmacSecret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    const rawToken   = extractBearerToken(req)
    if (!rawToken) return json({ success: false, error: 'missing_token' }, 401)

    const phone = await verifyClientSession(rawToken, hmacSecret)
    if (!phone) return json({ success: false, error: 'invalid_or_expired_token' }, 401)

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: client } = await supabase.from('clients').select('id').eq('phone', phone).maybeSingle()
    if (!client) return json({ success: true, active: null, history: [] })

    const { data: activeRows } = await supabase
      .from('appointments')
      .select('id, status, reschedule_count, slot_id, treatment_type, treatment_name, slots!inner(start_time)')
      .eq('client_id', client.id)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false })
      .limit(1)

    let active = null
    if (activeRows?.[0]) {
      const a = activeRows[0]
      // deno-lint-ignore no-explicit-any
      const startTime  = (a.slots as any).start_time as string
      const hoursUntil = (new Date(startTime).getTime() - Date.now()) / 3_600_000
      active = {
        id: a.id, status: a.status, slot_id: a.slot_id,
        service: a.treatment_type, serviceName: a.treatment_name,
        date: DATE_FMT.format(new Date(startTime)),
        time: TIME_FMT.format(new Date(startTime)),
        reschedule_count: a.reschedule_count,
        can_cancel:     hoursUntil > MIN_HOURS,
        can_reschedule: hoursUntil > MIN_HOURS && a.reschedule_count < 1,
      }
    }

    const { data: histRows } = await supabase
      .from('appointments')
      .select('id, status, treatment_name, slots!inner(start_time)')
      .eq('client_id', client.id)
      .in('status', ['approved', 'cancelled', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(5)

    const history = (histRows ?? []).map(h => {
      // deno-lint-ignore no-explicit-any
      const st = (h.slots as any).start_time as string
      return { id: h.id, status: h.status, serviceName: h.treatment_name, date: DATE_FMT.format(new Date(st)), time: TIME_FMT.format(new Date(st)) }
    })

    return json({ success: true, active, history })
  } catch (err) {
    console.error('[client-portal] unhandled:', err instanceof Error ? err.message : String(err))
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
