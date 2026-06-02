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

    const bookings = data ?? []

    // Attach the latest client-facing SMS delivery status per booking so the
    // admin console can show whether each client was actually notified.
    const ids = bookings.map((b: { id: string }) => b.id).filter(Boolean)
    const smsByAppt: Record<string, string> = {}
    if (ids.length > 0) {
      const { data: logs } = await supabase
        .from('communication_logs')
        .select('appointment_id, status, created_at')
        .in('appointment_id', ids)
        .in('context', ['ClientApproval', 'ClientRejection', 'ClientCancellation'])
        .order('created_at', { ascending: false })
      for (const row of logs ?? []) {
        if (row.appointment_id && !(row.appointment_id in smsByAppt)) {
          smsByAppt[row.appointment_id] = row.status
        }
      }
    }
    const enriched = bookings.map((b: Record<string, unknown>) => ({
      ...b,
      smsStatus: smsByAppt[b.id as string] ?? null,
    }))

    return json({ success: true, bookings: enriched })
  } catch (err) {
    console.error('[list-bookings]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
