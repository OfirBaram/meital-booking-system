// ================================================================
// admin-chats — read side of the website-chat analytics.
//
// Three actions, all admin-session gated:
//   list      recent transcripts (what individual visitors asked)
//   stats     topic breakdown + daily volume (what people ask in aggregate)
//   overview  the site_events funnel views, which nothing read until now
//
// The analytics views (analytics_daily / analytics_funnel / analytics_sources,
// and the chat_* views added alongside this function) are security_invoker with
// anon/authenticated revoked, so they are reachable ONLY from a service-role
// client — i.e. only from inside a function like this one.
// ================================================================
import { createClient } from 'npm:@supabase/supabase-js@2'
import { adminCors, SEC_HEADERS } from '../_shared/cors.ts'
import { validateAdminSession } from '../_shared/auth.ts'

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

    const body       = await req.json().catch(() => ({}))
    const { action } = body as { action?: string }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── list: recent conversations ─────────────────────────────
    if (action === 'list') {
      const limit = Math.min(Number((body as { limit?: number }).limit) || 40, 100)
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('session_id, history, message_count, page, referrer, device, country, first_seen, last_seen')
        .order('last_seen', { ascending: false })
        .limit(limit)
      if (error) throw error
      return json({ success: true, chats: data ?? [] })
    }

    // ── stats: what people ask ─────────────────────────────────
    if (action === 'stats') {
      const [topicsRes, dailyRes, totalRes] = await Promise.all([
        supabase.from('chat_topics').select('topic, questions, sessions, last_asked').limit(20),
        supabase.from('chat_daily').select('day, conversations, messages, avg_messages, single_question, mobile').limit(30),
        supabase.from('chat_conversations').select('session_id', { count: 'exact', head: true }),
      ])
      if (topicsRes.error) throw topicsRes.error
      if (dailyRes.error)  throw dailyRes.error

      return json({
        success: true,
        topics:  topicsRes.data ?? [],
        daily:   dailyRes.data ?? [],
        total:   totalRes.count ?? 0,
      })
    }

    // ── overview: the visitor funnel ───────────────────────────
    if (action === 'overview') {
      const [funnelRes, sourcesRes] = await Promise.all([
        supabase.from('analytics_funnel').select('*').limit(30),
        supabase.from('analytics_sources').select('*').limit(20),
      ])
      if (funnelRes.error)  throw funnelRes.error
      if (sourcesRes.error) throw sourcesRes.error

      return json({
        success: true,
        funnel:  funnelRes.data ?? [],
        sources: sourcesRes.data ?? [],
      })
    }

    return json({ success: false, error: 'unknown_action' }, 400)

  } catch (err) {
    console.error('[admin-chats]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
