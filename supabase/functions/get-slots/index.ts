import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Schema: slots(id BIGSERIAL, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, status TEXT)
// There is NO separate 'date' or 'time' column -- both are derived from start_time.

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

// Intl formatters reused across rows -- constructed once at module load.
const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
})

function toJerusalemDate(ts: string): string {
  return DATE_FMT.format(new Date(ts))  // "YYYY-MM-DD"
}

function toJerusalemTime(ts: string): string {
  return TIME_FMT.format(new Date(ts))  // "HH:MM"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const url   = new URL(req.url)
    const year  = parseInt(url.searchParams.get('year')  ?? '', 10)
    const month = parseInt(url.searchParams.get('month') ?? '', 10)

    if (!year || month < 1 || month > 12) {
      return json({ success: false, error: 'invalid_params' }, 400)
    }

    // UTC query window: Jerusalem is at most UTC+3 ahead (summer DST).
    // Subtract 3 h from month-start and add 3 h to month-end so every
    // possible Jerusalem slot in the requested month is captured.
    // The toJerusalemDate() call below is the authoritative month filter --
    // any rows from adjacent UTC days are discarded in the loop.
    const fromUTC  = new Date(Date.UTC(year, month - 1, 1) - 3 * 3_600_000).toISOString()
    const toUTC    = new Date(Date.UTC(year, month,     1) + 3 * 3_600_000).toISOString()
    const monthPfx = `${year}-${String(month).padStart(2, '0')}`

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('MY_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('slots')
      .select('start_time')
      .eq('status', 'available')
      .gte('start_time', fromUTC)
      .lte('start_time', toUTC)
      .order('start_time')

    if (error) throw error

    const slots: Record<string, string[]> = {}
    for (const row of data ?? []) {
      const dateKey = toJerusalemDate(row.start_time as string)
      if (!dateKey.startsWith(monthPfx)) continue  // discard UTC-boundary overflow rows
      const time = toJerusalemTime(row.start_time as string)
      if (!slots[dateKey]) slots[dateKey] = []
      slots[dateKey].push(time)
    }

    return json({ success: true, slots })
  } catch (err) {
    console.error('[get-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
