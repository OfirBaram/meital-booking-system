import Anthropic from 'npm:@anthropic-ai/sdk@0.39'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PUBLIC_CORS, SEC_HEADERS } from '../_shared/cors.ts'

const DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' })
const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
})

const SYSTEM_PROMPT = `You are a professional assistant for מיטל שבע ברעם — לק ג'ל בוטיק, a premium nail studio in Ramat Gan, Israel.

## Studio Details
- Location: רחוב רש"י 11, רמת גן (accessible from Tel Aviv, Givatayim, Petah Tikva)
- Hours: Sunday–Thursday, 08:00–19:00 (closed Friday and Saturday)
- WhatsApp / Phone: +972547686865
- Instagram & TikTok: @meytal.sheva
- Booking: by appointment only, usually available within 2–3 days

## Services
- **לק ג'ל קלאסי** (Classic Gel Nails) — 90 minutes — Gelish, OPI, CND brands
- **לק ג'ל לרגליים** (Gel Feet / Pedicure) — 120 minutes
- Gel removal available — pricing confirmed via WhatsApp

## Rules
1. Use check_availability whenever a customer asks about free times or wants to book.
2. Present up to 3 slots, then add one booking link per slot using this exact format:
   [BOOK:YYYY-MM-DD:HH:MM:service_id]   (service_id = "gel_classic" or "gel_feet")
   Example: [BOOK:2026-06-17:10:00:gel_classic]
3. Never quote specific prices — say "ניתן לברר מחיר בווטסאפ 📲"
4. Politely redirect off-topic questions back to studio topics.
5. Keep replies to 2–4 sentences max (except slot listings).

## Language
Hebrew input → reply in Hebrew. English input → reply in English. Default: Hebrew.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description: 'Fetch available appointment slots. Call whenever the customer asks about free times or wants to book.',
    input_schema: {
      type: 'object' as const,
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Days ahead to search (1–60). Defaults to 14.',
        },
      },
      required: [],
    },
  },
]

const CORS_HEADERS = { ...PUBLIC_CORS, ...SEC_HEADERS }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Runtime validation — TypeScript types offer zero protection at runtime.
// Guards: max 20 messages, string content only, <= 1000 chars each, strict alternation.
function validateMessages(raw: unknown): Anthropic.MessageParam[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 20) return null
  const out: Anthropic.MessageParam[] = []
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (typeof m !== 'object' || m === null) return null
    const { role, content } = m as Record<string, unknown>
    if (role !== 'user' && role !== 'assistant') return null
    if (typeof content !== 'string' || content.length === 0 || content.length > 1000) return null
    // Strict alternation: even index = user, odd index = assistant
    if ((i % 2 === 0 && role !== 'user') || (i % 2 === 1 && role !== 'assistant')) return null
    out.push({ role, content })
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const messages = validateMessages((body as Record<string, unknown>)?.messages)
  if (!messages) return json({ error: 'invalid_messages' }, 400)

  try {
    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    // Use anon key — read-only, RLS-enforced. Service role is not needed here.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )

    const history = [...messages]
    let finalText = ''

    // Agentic loop: resolves tool calls server-side before returning reply (max 3 turns)
    for (let turn = 0; turn < 3; turn++) {
      const resp = await anthropic.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     SYSTEM_PROMPT,
        tools:      TOOLS,
        messages:   history,
      })

      if (resp.stop_reason === 'end_turn') {
        finalText = (resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined)?.text ?? ''
        break
      }

      if (resp.stop_reason === 'tool_use') {
        const toolBlock = resp.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
        history.push({ role: 'assistant', content: resp.content })

        if (toolBlock.name === 'check_availability') {
          // Clamp days_ahead to prevent timestamp abuse and runaway queries
          const raw       = (toolBlock.input as Record<string, unknown>).days_ahead
          const daysAhead = Math.min(Math.max(1, Number(raw) || 14), 60)
          const now       = new Date()
          const fromUTC   = new Date(now.getTime() - 3 * 3_600_000).toISOString()
          const toUTC     = new Date(now.getTime() + daysAhead * 86_400_000 + 3 * 3_600_000).toISOString()

          const { data, error } = await supabase
            .from('slots')
            .select('start_time')
            .eq('status', 'available')
            .gte('start_time', fromUTC)
            .lte('start_time', toUTC)
            .gt('start_time', now.toISOString())
            .order('start_time')
            .limit(15)

          const slots = (error || !data)
            ? []
            : data.map(row => ({
                date: DATE_FMT.format(new Date(row.start_time as string)),
                time: TIME_FMT.format(new Date(row.start_time as string)),
              }))

          history.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ slots, count: slots.length }),
            }],
          })
        }
      }
    }

    // Safeguard: if the loop exhausted turns without producing a reply,
    // return a friendly fallback rather than an empty string.
    if (!finalText) {
      finalText = 'מצטערת, לא הצלחתי לסיים את התשובה. אפשר לנסות שוב או לפנות בווטסאפ 📲'
    }

    return json({ reply: finalText })
  } catch (err) {
    // Log full error server-side (visible only in Supabase Logs), never leak to client
    console.error('[chat-handler]', err)
    return json({ error: 'internal_error' }, 500)
  }
})
