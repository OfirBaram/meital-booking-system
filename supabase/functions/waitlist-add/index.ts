import { createClient } from 'npm:@supabase/supabase-js@2'
import { PUBLIC_CORS, SEC_HEADERS } from '../_shared/cors.ts'

const HEADERS = { ...PUBLIC_CORS, ...SEC_HEADERS, 'Content-Type': 'application/json' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS })
}

// Basic E.164 Israeli phone validation
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (/^972[5][0-9]{8}$/.test(digits))   return '+' + digits          // 972501234567
  if (/^0[5][0-9]{8}$/.test(digits))     return '+972' + digits.slice(1) // 05X…
  if (/^[5][0-9]{8}$/.test(digits))      return '+972' + digits          // 5X…
  return null
}

const VALID_SERVICES = new Set(['gel_hands', 'regular_feet', 'gel_combo'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: HEADERS })
  if (req.method !== 'POST')    return json({ error: 'method_not_allowed' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return json({ error: 'invalid_json' }, 400) }

  const name    = typeof body.name    === 'string' ? body.name.trim().slice(0, 80)  : ''
  const rawPhone = typeof body.phone  === 'string' ? body.phone.trim()              : ''
  const service  = typeof body.service === 'string' && VALID_SERVICES.has(body.service as string)
    ? body.service as string
    : null

  if (!name)    return json({ error: 'missing_name' }, 400)

  const phone = normalisePhone(rawPhone)
  if (!phone) return json({ error: 'invalid_phone' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Idempotency: if same phone already waiting, update service (don't create dupe)
  const { data: existing } = await supabase
    .from('waitlist')
    .select('id')
    .eq('phone', phone)
    .eq('status', 'waiting')
    .maybeSingle()

  if (existing) {
    if (service) {
      await supabase.from('waitlist').update({ service }).eq('id', existing.id)
    }
    return json({ success: true, existing: true })
  }

  const { error } = await supabase.from('waitlist').insert({ name, phone, service })
  if (error) {
    console.error('[waitlist-add]', error)
    return json({ error: 'db_error' }, 500)
  }

  return json({ success: true })
})
