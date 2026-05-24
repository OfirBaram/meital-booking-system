import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
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

    const firstDay = new Date(year, month - 1, 1)
    const lastDay  = new Date(year, month, 0)
    const fromDate = firstDay.toISOString().slice(0, 10)
    const toDate   = lastDay.toISOString().slice(0, 10)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('slots')
      .select('date, start_time')
      .eq('status', 'available')
      .gte('date', fromDate)
      .lte('date', toDate)
      .order('date')
      .order('start_time')

    if (error) throw error

    // Shape: { 'YYYY-MM-DD': ['HH:MM', ...] }
    const slots: Record<string, string[]> = {}
    for (const row of data ?? []) {
      const dateKey = row.date as string
      const time    = (row.start_time as string).slice(0, 5) // trim seconds if present
      if (!slots[dateKey]) slots[dateKey] = []
      slots[dateKey].push(time)
    }

    return json({ success: true, slots })
  } catch (err) {
    console.error('[get-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
