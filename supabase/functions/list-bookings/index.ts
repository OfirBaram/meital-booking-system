import { createClient }           from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }   from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'

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
