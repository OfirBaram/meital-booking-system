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
    if (!await validateAdminSession(req, secret)) return json({ success: false, error: 'unauthorized' }, 403)

    const body   = await req.json()
    const action = body?.action

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (action === 'getWaitlist') {
      const { data, error } = await supabase
        .from('waitlist')
        .select('id, name, phone, service, status, created_at, contacted_at')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return json({ success: true, waitlist: data ?? [] })
    }

    if (action === 'markContacted') {
      const id = Number(body.id)
      if (!id) return json({ success: false, error: 'missing_id' }, 400)
      const { error } = await supabase
        .from('waitlist')
        .update({ status: 'contacted', contacted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'markBooked') {
      const id = Number(body.id)
      if (!id) return json({ success: false, error: 'missing_id' }, 400)
      const { error } = await supabase
        .from('waitlist')
        .update({ status: 'booked' })
        .eq('id', id)
      if (error) throw error
      return json({ success: true })
    }

    if (action === 'dismiss') {
      const id = Number(body.id)
      if (!id) return json({ success: false, error: 'missing_id' }, 400)
      const { error } = await supabase
        .from('waitlist')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
      return json({ success: true })
    }

    return json({ success: false, error: 'unknown_action' }, 400)
  } catch (e) {
    console.error('[admin-waitlist]', e)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
