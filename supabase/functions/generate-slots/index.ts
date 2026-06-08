import { createClient } from 'npm:@supabase/supabase-js@2'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { adminToken, startDate, endDate, template } = await req.json()

    // Admin token validation — matches the ADMIN_TOKEN script property used by GAS
    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    // Input validation
    if (!startDate || !endDate || !Array.isArray(template)) {
      return json({ success: false, error: 'startDate, endDate, and template are required' }, 400)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return json({ success: false, error: 'dates must be YYYY-MM-DD' }, 400)
    }
    if (endDate < startDate) {
      return json({ success: false, error: 'endDate must be >= startDate' }, 400)
    }

    // Service-role client — bypasses RLS, never exposed to the browser
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Delegate timezone conversion and duplicate detection to PostgreSQL
    const { data, error } = await supabase.rpc('generate_slots', {
      p_start_date: startDate,
      p_end_date:   endDate,
      p_template:   template,
    })

    if (error) throw error

    return json(data)
  } catch (err) {
    console.error('[generate-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
