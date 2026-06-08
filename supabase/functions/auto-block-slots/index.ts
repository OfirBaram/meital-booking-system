import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Returns the UTC range that covers all of tomorrow in Jerusalem (UTC+2/+3). */
function tomorrowRange() {
  const TZ = 'Asia/Jerusalem'
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(tomorrow)
  const fromUtc = new Date(`${dateStr}T00:00:00+03:00`).toISOString()
  const toUtc   = new Date(`${dateStr}T23:59:59+02:00`).toISOString()
  return { dateStr, fromUtc, toUtc }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const body           = await req.json()
    const { adminToken } = body

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { dateStr, fromUtc, toUtc } = tomorrowRange()

    // Find all 'available' slots for tomorrow
    const { data: slots, error: selErr } = await supabase
      .from('slots')
      .select('id')
      .eq('status', 'available')
      .gte('start_time', fromUtc)
      .lte('start_time', toUtc)

    if (selErr) throw selErr

    if (!slots || slots.length === 0) {
      console.log(`[auto-block-slots] No available slots for ${dateStr}`)
      return json({ success: true, blocked: 0, date: dateStr })
    }

    const ids = slots.map((s: { id: number }) => s.id)

    const { error: updErr } = await supabase
      .from('slots')
      .update({ status: 'locked', last_updated: new Date().toISOString() })
      .in('id', ids)

    if (updErr) throw updErr

    console.log(`[auto-block-slots] Locked ${ids.length} slots for ${dateStr}`)
    return json({ success: true, blocked: ids.length, date: dateStr })
  } catch (err) {
    console.error('[auto-block-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
