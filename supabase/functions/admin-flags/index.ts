import { createClient }           from 'npm:@supabase/supabase-js@2'
import { validateAdminSession }   from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = adminCors(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })
  }

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

    const body       = await req.json()
    const { action } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── getFlags ───────────────────────────────────────────────
    if (action === 'getFlags') {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, enabled, description, updated_at')
        .order('key')

      if (error) throw error
      return json({ success: true, flags: data ?? [] })
    }

    // ── setFlag ────────────────────────────────────────────────
    if (action === 'setFlag') {
      const { key, enabled } = body
      if (typeof key !== 'string' || !key || typeof enabled !== 'boolean') {
        return json({ success: false, error: 'key (string) and enabled (boolean) required' }, 400)
      }

      const { error } = await supabase
        .from('feature_flags')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('key', key)

      if (error) throw error

      ;(async () => {
        try {
          await supabase.from('audit_log').insert({
            action:     'set_feature_flag',
            new_val:    key + '=' + String(enabled),
            ip:         req.headers.get('x-forwarded-for') ?? 'unknown',
            user_agent: (req.headers.get('user-agent') ?? '').slice(0, 200),
          })
        } catch (e) { console.error('[admin-flags] audit-insert failed', e) }
      })()

      console.log('[admin-flags] setFlag key=' + key + ' enabled=' + String(enabled))
      return json({ success: true, key, enabled })
    }

    return json({ success: false, error: 'unknown_action' }, 400)

  } catch (err) {
    console.error('[admin-flags]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
