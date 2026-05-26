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
      .from('communication_logs')
      .select('recipient_phone, created_at, context, status, message_body, detail')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    const entries = (data ?? []).map(row => ({
      to:      row.recipient_phone,
      ts:      row.created_at.slice(0, 10),
      context: row.context,
      status:  row.status,
      snippet: (row.message_body || '').slice(0, 80),
      detail:  row.detail || '',
    }))

    return json({ success: true, entries })
  } catch (err) {
    console.error('[sms-log]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
