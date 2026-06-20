// _shared/bot-core.ts
//
// The conversation "brain" — a transport-agnostic agentic loop extracted from
// chat-handler so BOTH the Web chat UI and the WhatsApp adapter drive the exact
// same model behaviour and the exact same TOOL_REGISTRY. Adding a channel never
// forks the logic; a channel only supplies a different messages[] + supabase
// client (anon for web, service_role for whatsapp).
//
// This file owns NO transport concern (no HTTP, no Twilio, no CORS). Callers
// parse their own input into messages[], inject a supabase client with the right
// key, and render the returned plain-text reply for their channel.

import Anthropic from 'npm:@anthropic-ai/sdk@0.39'
import {
  buildSystemPrompt,
  DEFAULT_SERVICES,
  TOOLS,
  TOOL_REGISTRY,
  debugLog,
  type ToolContext,
} from './bot-config.ts'

// Tunables kept in one place so every channel shares identical model behaviour.
const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 600
const MAX_TURNS  = 3   // agentic turns — contains cost; tool calls resolve server-side

/**
 * Run one assistant response over the given conversation.
 *
 * @param messages  validated [{role,content}] history. Each caller enforces the
 *                  same shape (alternation, <=20, length-capped) before calling.
 * @param ctx       ToolContext — carries the supabase client passed straight to
 *                  each tool. anon key (web) or service_role (whatsapp).
 * @returns         plain-text reply (markdown stripped). Tool/model errors are
 *                  caught by the caller; this returns a friendly Hebrew fallback
 *                  if the loop ends without a final text.
 */
export async function runConversation(
  messages: Anthropic.MessageParam[],
  ctx: ToolContext,
): Promise<string> {
  const { supabase } = ctx
  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

  // Build the system prompt from the live, active service catalogue so the bot
  // offers exactly the services that currently exist, tuned for the channel
  // (WhatsApp gets in-chat booking rules). Falls back to the default catalogue
  // if the read fails.
  const channel = ctx.channel ?? 'web'
  let systemPrompt = buildSystemPrompt(DEFAULT_SERVICES, channel)
  try {
    const { data: svcRows } = await supabase
      .from('services')
      .select('id, name_he, duration_min, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (svcRows && svcRows.length) systemPrompt = buildSystemPrompt(svcRows as never, channel)
  } catch (e) {
    console.warn('[bot-core] service-load failed, using default prompt', e)
  }

  const history  = [...messages]
  let   finalText = ''

  // Agentic loop — resolves tool calls server-side (max MAX_TURNS to contain cost).
  // Tool dispatch is registry-driven: add new tools to TOOL_REGISTRY in bot-config.ts.
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: MAX_TOKENS,
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
        // ctx is forwarded as-is — when it later carries identity (verified
        // WhatsApp phone), booking tools receive it without any change here.
        const result = await tool.execute(toolBlock.input as Record<string, unknown>, ctx)
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

  // If loop exhausted without end_turn (rare: model used all turns on tool calls)
  if (!finalText) {
    finalText = 'מצטערת, לא הצלחתי לסיים את התשובה. אפשר לנסות שוב או לפנות בווטסאפ 📲'
  }

  // Strip markdown bold/italic that models occasionally emit despite instructions
  finalText = finalText.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')

  return finalText
}
