import { createClient } from 'npm:@supabase/supabase-js@2'
import type Anthropic from 'npm:@anthropic-ai/sdk@0.39'
import { PUBLIC_CORS, SEC_HEADERS } from '../_shared/cors.ts'
import { debugLog } from '../_shared/bot-config.ts'
import { runConversation } from '../_shared/bot-core.ts'
import { verifyTwilioSignature } from '../_shared/twilio-webhook.ts'
import { normalizeIsraeliPhone } from '../_shared/phone.ts'
import { getSystemHealth } from '../_shared/health.ts'
import { createCircuitBreaker } from '../_shared/circuit-breaker.ts'
import { type ChatTurn, maskPhone, renderForWhatsApp, trimHistory } from '../_shared/whatsapp.ts'

// ── Rate Limiter (token bucket, per worker instance) ─────────────────────────
// Supabase Edge Functions run in isolated Deno workers. In-memory state
// persists within one worker but is NOT shared across a scaled fleet.
// For <100 honest msg/day this is sufficient: a single instance serves all
// traffic. For multi-region scale, replace with Supabase KV.
const _rl = new Map<string, { tokens: number; refillAt: number }>()
const RL_MAX = 10       // 10 requests per window per IP
const RL_WIN = 60_000   // 1-minute window

function isAllowed(ip: string): boolean {
  const now = Date.now()
  const b   = _rl.get(ip)
  if (!b || now >= b.refillAt) {
    _rl.set(ip, { tokens: RL_MAX - 1, refillAt: now + RL_WIN })
    return true
  }
  if (b.tokens <= 0) return false
  b.tokens--
  return true
}

function maybeCleanup() {
  if (_rl.size < 500) return
  const now = Date.now()
  for (const [k, v] of _rl) if (now >= v.refillAt) _rl.delete(k)
}

// ── Response helpers ──────────────────────────────────────────────────────────
const CORS_AND_SEC = { ...PUBLIC_CORS, ...SEC_HEADERS }

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_AND_SEC, 'Content-Type': 'application/json', ...extra },
  })
}

// ── Input Validation (Web channel) ─────────────────────────────────────────────
// TypeScript types are compile-time only. validateMessages() is the runtime
// gate against role injection, non-string content, message-count abuse, and
// token-stuffing via oversized content.
function validateMessages(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null
  const out: Anthropic.MessageParam[] = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (typeof m !== 'object' || m === null) return null
    const { role, content } = m as Record<string, unknown>
    if (role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string' || content.length === 0 || content.length > 1000) return null
    if (i % 2 === 0 && role !== 'user')      return null
    if (i % 2 === 1 && role !== 'assistant') return null
    out.push({ role, content })
  }
  return out
}

// ── WhatsApp transport (Twilio) ────────────────────────────────────────────────
// Twilio posts application/x-www-form-urlencoded and authenticates with
// X-Twilio-Signature (NOT a Supabase JWT — chat-handler is verify_jwt=false).
// This adapter owns ONLY transport: auth, state I/O, token rendering, TwiML.
// The brain (model + tools) lives in runConversation and returns clean text.

const WA_MAX_LEN = 1000  // cap a single inbound message (matches the web gate)

// Circuit breaker: 3 consecutive brain/handler failures => auto human-handover,
// so a broken bot stops replying (reputation guard) until a cooldown.
const breaker = createCircuitBreaker(3)

// Per-phone rate limit. The web IP limiter does NOT apply to WhatsApp (all Twilio
// traffic shares one IP), and the signature only proves the request is FROM
// Twilio — not that a single sender isn't flooding. This caps Anthropic cost +
// DB writes per sender. Token bucket, per worker instance (low-volume OK).
const _waRl = new Map<string, { tokens: number; refillAt: number }>()
const WA_RL_MAX = 8
const WA_RL_WIN = 60_000
function waAllowed(phone: string): boolean {
  const now = Date.now()
  if (_waRl.size > 2000) for (const [k, v] of _waRl) if (now >= v.refillAt) _waRl.delete(k)
  const b = _waRl.get(phone)
  if (!b || now >= b.refillAt) { _waRl.set(phone, { tokens: WA_RL_MAX - 1, refillAt: now + WA_RL_WIN }); return true }
  if (b.tokens <= 0) return false
  b.tokens--
  return true
}

// Error-loop monitor: if the WhatsApp path throws repeatedly in a short window,
// emit ONE distinctive CRITICAL line. Grep '[wa][CRITICAL]' in Supabase logs and
// wire a log-based alert to it (see audit notes).
let _waErrCount = 0
let _waErrAt    = Date.now()
const WA_ERR_THRESHOLD = 5
const WA_ERR_WINDOW    = 300_000   // 5 min
function recordWaError(): void {
  const now = Date.now()
  if (now - _waErrAt > WA_ERR_WINDOW) { _waErrCount = 0; _waErrAt = now }
  if (++_waErrCount >= WA_ERR_THRESHOLD) {
    console.error('[wa][CRITICAL] error-loop: ' + _waErrCount + ' failures in <5min — the WhatsApp bot may be failing for everyone. Check ANTHROPIC_API_KEY / Twilio / DB.')
    _waErrCount = 0; _waErrAt = now
  }
}

// Degraded-mode gate, cached per worker (~60s) so we don't run a health query on
// every message. Fail-OPEN on a health-check error (keep the bot working).
let _healthAt = 0
let _degraded = false
const HEALTH_TTL = 60_000
// deno-lint-ignore no-explicit-any
async function isDegraded(supabase: any): Promise<boolean> {
  const now = Date.now()
  if (now - _healthAt < HEALTH_TTL) return _degraded
  try { _degraded = (await getSystemHealth(supabase)).degraded; _healthAt = now }
  catch (e) { console.error('[wa] health check failed (fail-open):', e instanceof Error ? e.message : String(e)) }
  return _degraded
}

// deno-lint-ignore no-explicit-any
async function persistConversation(supabase: any, phone: string, clientId: string | null, history: ChatTurn[], messageSid: string): Promise<void> {
  // Must NEVER throw — a save failure must not cost the customer the reply the
  // brain already produced (we still return it; only the memory write is lost).
  try {
    const { error } = await supabase.from('whatsapp_conversations').upsert({
      phone, client_id: clientId, history, last_msg_sid: messageSid, last_inbound_at: new Date().toISOString(),
    }, { onConflict: 'phone' })
    if (error) console.error('[wa] persist failed:', error.message)
  } catch (e) {
    console.error('[wa] persist threw:', e instanceof Error ? e.message : String(e))
  }
}

// Ensure exactly ONE open ticket per phone (deduped) — the fail-safe must not
// turn a backlog of messages into a backlog of tickets.
// deno-lint-ignore no-explicit-any
async function ensureOpenTicket(supabase: any, phone: string, clientId: string | null, snapshot: ChatTurn[]): Promise<void> {
  try {
    const { count } = await supabase.from('support_requests')
      .select('id', { count: 'exact', head: true }).eq('phone', phone).eq('status', 'open')
    if ((count ?? 0) > 0) return
    await supabase.from('support_requests').insert({
      phone, client_id: clientId,
      reason:   'auto: עומס פניות — הופנתה לטיפול אנושי (fail-safe)',
      snapshot: snapshot.slice(-12),
      status:   'open',
    })
  } catch (e) { console.error('[wa] ensureOpenTicket failed:', e instanceof Error ? e.message : String(e)) }
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** TwiML reply Twilio renders back to the sender. Empty message => silent ack. */
function twiml(message: string): Response {
  const inner = message ? '<Message>' + xmlEscape(message) + '</Message>' : ''
  const xml   = '<?xml version="1.0" encoding="UTF-8"?><Response>' + inner + '</Response>'
  return new Response(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

// Per-message latency metric → communication_logs (context 'BotLatency'). A slow
// brain (>10s) also raises a CRITICAL line for a log-based admin alert. The phone
// lives in the comms DATA table (like every SMS row), not the log stream.
// deno-lint-ignore no-explicit-any
function recordLatency(supabase: any, phone: string, ms: number): void {
  const slow = ms > 10_000
  ;(async () => {
    try {
      await supabase.from('communication_logs').insert({
        channel: 'whatsapp', recipient_phone: phone, context: 'BotLatency',
        status: 'SENT', message_body: slow ? 'SLOW_RESPONSE' : 'ok', detail: ms + 'ms',
      })
    } catch (e) { console.error('[wa] latency log failed:', e instanceof Error ? e.message : String(e)) }
  })()
  if (slow) console.error('[wa][CRITICAL] slow-brain ' + ms + 'ms phone=' + maskPhone(phone))
}

async function handleWhatsApp(req: Request): Promise<Response> {
  // 1. Read the raw form body ONCE — needed verbatim to recompute the signature.
  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)

  // 2. Authenticate. The signed URL must be byte-identical to what Twilio called;
  //    behind the Supabase proxy req.url is unreliable, so prefer the explicit
  //    TWILIO_WEBHOOK_URL secret (the exact URL pasted into the Twilio console).
  const authToken = (Deno.env.get('TWILIO_AUTH_TOKEN') ?? '').trim()
  const url       = (Deno.env.get('TWILIO_WEBHOOK_URL') ?? '').trim() || req.url
  const ok = await verifyTwilioSignature({
    authToken,
    signatureHeader: req.headers.get('x-twilio-signature'),
    url,
    params,
  })
  if (!ok) {
    // Fail-closed: also fires if TWILIO_AUTH_TOKEN is unset. sid is not PII.
    console.warn('[wa] signature rejected sid=' + (params.get('MessageSid') ?? 'none'))
    return new Response('forbidden', { status: 403 })
  }

  // 3. Parse the inbound message.
  const fromRaw    = params.get('From') ?? ''   // e.g. "whatsapp:+972501234567"
  const bodyText   = (params.get('Body') ?? '').trim().slice(0, WA_MAX_LEN)
  const messageSid = params.get('MessageSid') ?? ''
  const phone      = normalizeIsraeliPhone(fromRaw.replace(/^whatsapp:/, ''))

  // Always-on (masked) so inbound WhatsApp is visible in prod logs without CHAT_DEBUG.
  console.log('[wa] inbound sid=' + messageSid + ' phone=' + maskPhone(phone) + ' bodyLen=' + bodyText.length)

  // Graceful guards — never 500 back to Twilio (it would retry endlessly).
  if (!phone) {
    return twiml('סליחה, לא הצלחתי לזהות את המספר שלך. אפשר לפנות אליי כאן: wa.me/972547686865')
  }
  if (!bodyText) {
    return twiml('קיבלתי 🙂 כתבי לי הודעת טקסט ואשמח לעזור לך לקבוע תור.')
  }

  // 3b. Per-phone rate limit (post-auth, post-identity) — caps cost/abuse.
  if (!waAllowed(phone)) {
    console.warn('[wa] rate-limited phone=' + maskPhone(phone))
    return twiml('קיבלתי כמה הודעות ברצף 🙂 שנייה לנשום — כתבי לי שוב עוד רגע ואמשיך מאיפה שעצרנו.')
  }

  // 4. Service-role client — bypasses RLS so we can read/write the conversation
  //    state table (PII; service_role only). Same client is passed to the brain.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // 5. Load conversation state (history + last processed SID + linked client).
    const { data: conv } = await supabase
      .from('whatsapp_conversations')
      .select('history, last_msg_sid, client_id')
      .eq('phone', phone)
      .maybeSingle()

    // 6. Deduplication — Twilio retries deliver the same MessageSid. An empty
    //    <Response/> tells Twilio "received, send nothing" without re-running.
    if (messageSid && conv?.last_msg_sid === messageSid) {
      debugLog('wa-dedup', { messageSid })
      return twiml('')
    }

    // 7. Resolve the linked client up-front so the brain's tools (escalate_to_
    //    support) receive the VERIFIED identity in their context. Kept if already
    //    linked; otherwise best-effort lookup by phone.
    let clientId = conv?.client_id ?? null
    let clientName: string | null = null
    if (!clientId) {
      const { data: clientRow } = await supabase
        .from('clients').select('id, full_name').eq('phone', phone).maybeSingle()
      if (clientRow) { clientId = clientRow.id; clientName = clientRow.full_name }
    } else {
      const { data: cr } = await supabase.from('clients').select('full_name').eq('id', clientId).maybeSingle()
      if (cr) clientName = cr.full_name
    }

    // 7b. IDENTITY GATE — WhatsApp phone is verified by Twilio HMAC-SHA1 (transport
    //     auth). The only missing piece for a new user is her NAME so book_appointment
    //     can address her. If we don't know who she is yet, ask once and persist.
    //     This is NOT a security gate (phone IS authenticated); it's UX identity.
    const history: ChatTurn[] = Array.isArray(conv?.history) ? conv!.history as ChatTurn[] : []
    const isNewUser = !clientName && history.length === 0
    const nameAsked = !clientName && history.some(
      t => t.role === 'assistant' && t.content.includes('שמך')
    )
    // Extract name from reply if we just asked (previous assistant turn was the name-ask)
    if (!clientName && nameAsked && bodyText.length >= 2 && bodyText.length <= 40 &&
        !bodyText.includes('http') && /[֐-׿A-Za-z]/.test(bodyText)) {
      // User answered our name-ask — upsert client and link to conversation
      const candidateName = bodyText.trim()
      const { data: upserted } = await supabase
        .from('clients')
        .upsert({ phone, full_name: candidateName }, { onConflict: 'phone' })
        .select('id, full_name')
        .maybeSingle()
      if (upserted) { clientId = upserted.id; clientName = upserted.full_name }
    }

    // 8. Build the message list for the brain (stored history + new user turn).
    const messages: ChatTurn[] = [...history, { role: 'user', content: bodyText }]

    // If this is a brand-new user and we don't have her name yet — ask before LLM.
    if (isNewUser && !clientName) {
      const greeting = 'שלום! 💅 אני הבוט של מיטל שבע-ברעם. שמחה שכתבת! כדי שאוכל לעזור לך לקבוע תור — מה שמך?'
      const greetHistory = trimHistory([...messages, { role: 'assistant', content: greeting }])
      await persistConversation(supabase, phone, clientId, greetHistory, messageSid)
      return twiml(greeting)
    }

    // 8b. HANDOVER GATE — circuit breaker (3 consecutive failures) OR support
    //     backlog (degraded). Either way STOP auto-solving: route to a human,
    //     save context, and ensure a (deduped) ticket exists.
    if (breaker.isOpen() || await isDegraded(supabase)) {
      console.warn('[wa] handover breakerOpen=' + breaker.isOpen() + ' phone=' + maskPhone(phone))
      await ensureOpenTicket(supabase, phone, clientId, messages)
      await persistConversation(supabase, phone, clientId,
        trimHistory([...messages, { role: 'assistant', content: 'העברתי אותך לטיפול אישי של מיטל.' }]), messageSid)
      return twiml('אני מעבירה אותך ישירות למיטל 💛 היא תחזור אלייך אישית בהקדם. תודה על הסבלנות!')
    }

    // 9. Execute the SAME brain as the web channel (timed). Context carries the
    //    VERIFIED phone + snapshot, so escalate_to_support can't be model-spoofed.
    const t0 = Date.now()
    const reply = await runConversation(messages as Anthropic.MessageParam[], {
      supabase,
      channel:    'whatsapp',
      phone,
      clientId,
      clientName,
      history:    messages,
    })
    breaker.recordSuccess()
    recordLatency(supabase, phone, Date.now() - t0)

    // 10. Persist clean user/assistant turns only (tool_use/tool_result blocks
    //     are NOT stored). Upsert = initial INSERT, then UPDATE; atomic on phone.
    const newHistory = trimHistory([...messages, { role: 'assistant', content: reply }])
    await persistConversation(supabase, phone, clientId, newHistory, messageSid)

    // 11. Wrap the clean text in TwiML for WhatsApp.
    return twiml(renderForWhatsApp(reply))

  } catch (err) {
    // Never surface a 500 to Twilio (it would retry endlessly). Friendly fallback;
    // state is left untouched so a genuine retry can reprocess the message.
    recordWaError()
    breaker.recordFailure()
    console.error('[wa] handler error phone=' + maskPhone(phone) + ' sid=' + messageSid + ': ' +
      (err instanceof Error ? err.message : String(err)))
    return twiml('סליחה, קרתה תקלה קטנה אצלי 🙏 אפשר לנסות שוב בעוד רגע, או לכתוב כאן: wa.me/972547686865')
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
// Routes by channel. The agentic loop lives in _shared/bot-core.ts so both the
// Web UI and WhatsApp drive the exact same brain.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_AND_SEC })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Channel discriminator: Twilio always sends X-Twilio-Signature; Web UI never does.
  if (req.headers.get('x-twilio-signature')) {
    // Top-level guard: NOTHING may bubble uncaught to Twilio (it would 500 + retry-
    // storm). Covers the pre-try section of handleWhatsApp (signature/parse/client).
    try {
      return await handleWhatsApp(req)
    } catch (e) {
      console.error('[wa] uncaught in handleWhatsApp:', e instanceof Error ? (e.stack ?? e.message) : String(e))
      return twiml('סליחה, קרתה תקלה קטנה אצלי 🙏 נסי שוב בעוד רגע.')
    }
  }

  // ── Web channel ──
  const ip = req.headers.get('x-real-ip')
           ?? req.headers.get('cf-connecting-ip')
           ?? req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
           ?? 'unknown'
  maybeCleanup()
  if (!isAllowed(ip)) {
    return json(
      { error: 'rate_limited', message: 'יותר מדי בקשות. נסי שוב בעוד דקה.' },
      429,
      { 'Retry-After': '60' },
    )
  }

  let body: unknown
  try { body = await req.json() }
  catch { return json({ error: 'invalid_json' }, 400) }

  const messages = validateMessages((body as Record<string, unknown>)?.messages)
  if (!messages) return json({ error: 'invalid_messages' }, 400)

  debugLog('incoming', { ip, messageCount: messages.length })

  try {
    // Anon key: read-only, RLS-enforced. The web channel needs no service role.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const reply = await runConversation(messages, { supabase, channel: 'web' })
    return json({ reply })

  } catch (err) {
    console.error('[chat-handler]', err)
    return json({ error: 'internal_error' }, 500)
  }
})
