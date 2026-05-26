import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    const { adminToken } = await req.json()

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('bookings_view')
      .select('*')
      .order('timestamp', { ascending: false })

    if (error) throw error

    return json({ success: true, bookings: data ?? [] })
  } catch (err) {
    console.error('[list-bookings]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
