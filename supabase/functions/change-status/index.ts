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

const ALLOWED: string[] = ['Approved', 'Rejected', 'Cancelled']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { adminToken, bookingId, targetStatus } = await req.json()

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    if (!bookingId || !ALLOWED.includes(targetStatus)) {
      return json({ success: false, error: 'invalid_input' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase.rpc('change_appointment_status', {
      p_booking_id: bookingId,
      p_new_status: targetStatus.toLowerCase(),  // DB stores lowercase
    })

    if (error) throw error

    return json(data)
  } catch (err) {
    console.error('[change-status]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
