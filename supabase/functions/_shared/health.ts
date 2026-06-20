// _shared/health.ts
// System-health snapshot for the WhatsApp channel + the degraded-mode fail-safe.
// Transport-agnostic (no HTTP); takes a service-role supabase client. Consumed by
// admin-support ('health' action / endpoint) and by chat-handler (fail-safe gate).

// deno-lint-ignore no-explicit-any
type Supa = any

// Above this many OPEN support tickets the bot stops trying to solve on its own
// and routes every new conversation straight to a human (fail-safe).
export const DEGRADED_OPEN_SUPPORT = 5

export interface SystemHealth {
  ok:                     boolean
  degraded:               boolean      // true => fail-safe handoff mode
  openSupport:            number       // support_requests with status='open'
  newestInboundAt:        string | null  // most recent customer message across all chats
  activeConversations24h: number       // distinct chats active in the last 24h
  checkedAt:              string
}

export async function getSystemHealth(supabase: Supa): Promise<SystemHealth> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const [openRes, activeRes, newestRes] = await Promise.all([
    supabase.from('support_requests')
      .select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('whatsapp_conversations')
      .select('phone', { count: 'exact', head: true }).gte('last_inbound_at', since),
    supabase.from('whatsapp_conversations')
      .select('last_inbound_at').order('last_inbound_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const openSupport = openRes.count ?? 0
  return {
    ok:                     true,
    degraded:               openSupport > DEGRADED_OPEN_SUPPORT,
    openSupport,
    newestInboundAt:        newestRes.data?.last_inbound_at ?? null,
    activeConversations24h: activeRes.count ?? 0,
    checkedAt:              new Date().toISOString(),
  }
}
