import Anthropic from 'npm:@anthropic-ai/sdk@0.39'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PUBLIC_CORS, SEC_HEADERS } from '../_shared/cors.ts'
import {
  SYSTEM_PROMPT,
  buildSystemPrompt,
  TOOLS,
  TOOL_REGISTRY,
  DEBUG_MODE,
  debugLog,
} from '../_shared/bot-config.ts'

// ── Rate Limiter (token bucket, per worker instance) ─────────────────────────
// Supabase Edge Functions run in isolated Deno workers. In-memory state
// persists within one worker but is NOT shared across a scaled fleet.
// For <100 honest msg/day this is sufficient: a single instance serves all
// traffic. For multi-region scale, replace with Supabase KV.
//
// Red Team: a bot hammering from one IP is blocked after 10 req/min.
// Multi-IP DDoS is handled upstream by Supabase's network layer.
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

// Prevent unbounded memory growth on sustained attack traffic
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

// ── Input Validation ──────────────────────────────────────────────────────────
// TypeScript types are compile-time only. validateMessages() is the runtime
// gate against: role injection, non-string content, message count abuse, and
// token-stuffing attacks via oversized message content.
function validateMessages(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null
  const out: Anthropic.MessageParam[] = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (typeof m !== 'object' || m === null) return null
    const { role, content } = m as Record<string, unknown>
    // Only 'user' and 'assistant' roles accepted — blocks system role injection
    if (role !== 'user' && role !== 'assistant') return null
    // String content only — rejects ContentBlock[] from client (tool_use injection)
    if (typeof content !== 'string' || content.length === 0 || content.length > 1000) return null
    // Strict alternation: 0→user, 1→assistant, 2→user ...
    if (i % 2 === 0 && role !== 'user')      return null
    if (i % 2 === 1 && role !== 'assistant') return null
    out.push({ role, content })
  }
  return out
}

// ── Main Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_AND_SEC })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // ── Rate limiting ──
  // x-real-ip is set by Supabase/Deno infra and cannot be spoofed by the client.
  // cf-connecting-ip is Cloudflare's guaranteed real IP.
  // x-forwarded-for LAST value is CDN-appended; the FIRST value is client-controlled.
  // Taking [0] from x-forwarded-for would allow trivial rate-limit bypass via header spoofing.
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

  // ── Parse & validate body ──
  let body: unknown
  try { body = await req.json() }
  catch { return json({ error: 'invalid_json' }, 400) }

  const messages = validateMessages((body as Record<string, unknown>)?.messages)
  if (!messages) return json({ error: 'invalid_messages' }, 400)

  debugLog('incoming', { ip, messageCount: messages.length })

  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    // Anon key: read-only, RLS-enforced. Service role not required here.
    // Requires RLS policy on `slots`: SELECT for anon WHERE status='available'.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    // Build the system prompt from the live, active service catalogue so the
    // bot offers exactly the services that currently exist. Falls back to the
    // static SYSTEM_PROMPT (default catalogue) if the read fails.
    let systemPrompt = SYSTEM_PROMPT
    try {
      const { data: svcRows } = await supabase
        .from('services')
        .select('id, name_he, duration_min, active, sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true })
      if (svcRows && svcRows.length) systemPrompt = buildSystemPrompt(svcRows as never)
    } catch (e) { console.warn('[chat-handler] service-load failed, using default prompt', e) }

    const history  = [...messages]
    let finalText  = ''

    // Agentic loop — resolves tool calls server-side (max 3 turns to contain cost).
    // Tool dispatch is registry-driven: add new tools to TOOL_REGISTRY in bot-config.ts.
    for (let turn = 0; turn < 3; turn++) {
      const resp = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     systemPrompt,
        tools:      TOOLS,
        messages:   history,
      })

      debugLog(`turn-${turn}-stop`, resp.stop_reason)

      if (resp.stop_reason === 'end_turn') {
        finalText = (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? ''
        break
      }

      if (resp.stop_reason === 'tool_use') {
        const toolBlock = resp.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
        history.push({ role: 'assistant', content: resp.content })

        debugLog('tool-call', { name: toolBlock.name, input: toolBlock.input })

        const tool = TOOL_REGISTRY.get(toolBlock.name)
        if (tool) {
          const result = await tool.execute(
            toolBlock.input as Record<string, unknown>,
            { supabase },
          )
          debugLog('tool-result', result)
          history.push({
            role: 'user',
            content: [{
              type:        'tool_result',
              tool_use_id: toolBlock.id,
              content:     JSON.stringify(result),
            }],
          })
        }
      }
    }

    // If loop exhausted without end_turn (rare: model used all 3 turns on tool calls)
    if (!finalText) {
      finalText = 'מצטערת, לא הצלחתי לסיים את התשובה. אפשר לנסות שוב או לפנות בווטסאפ 📲'
    }

    // Strip markdown bold/italic that models occasionally emit despite instructions
    finalText = finalText.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')

    return json({ reply: finalText })

  } catch (err) {
    // Stack trace logged server-side only — never leaks to client response
    console.error('[chat-handler]', err)
    return json({ error: 'internal_error' }, 500)
  }
})