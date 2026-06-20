// WhatsApp MCP server (SCAFFOLD — not deployed). Operator/admin control of the
// Meital WhatsApp channel from Claude Desktop. Reuses the SAME shared building
// blocks as the Edge functions — it never imports or mutates the customer
// TOOL_REGISTRY, so the bot's logic is untouched.
//
// Run: deno run -A mcp/whatsapp-mcp/server.ts   (see README for client config)

import { createClient } from 'npm:@supabase/supabase-js@2'
import { McpServer } from 'npm:@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from 'npm:@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'npm:zod'
// Reuse the exact production helpers — single source of truth:
import { getSystemHealth } from '../../supabase/functions/_shared/health.ts'
import { twilioCredsFromEnv, sendTwilioWhatsApp } from '../../supabase/functions/_shared/sms.ts'
import { normalizeIsraeliPhone } from '../../supabase/functions/_shared/phone.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // local admin only — never commit
)

const server = new McpServer({ name: 'meital-whatsapp', version: '0.1.0' })

server.tool('get_health', 'Queue depth, open support tickets, newest inbound.', {}, async () => {
  const h = await getSystemHealth(supabase)
  return { content: [{ type: 'text', text: JSON.stringify(h, null, 2) }] }
})

server.tool('list_open_support', 'List open support tickets the bot escalated.', {}, async () => {
  const { data } = await supabase.from('support_requests')
    .select('id, phone, reason, created_at').eq('status', 'open').order('created_at')
  return { content: [{ type: 'text', text: JSON.stringify(data ?? [], null, 2) }] }
})

server.tool('read_conversation', 'Read a customer conversation by phone.',
  { phone: z.string() }, async ({ phone }) => {
    const e164 = normalizeIsraeliPhone(phone) ?? phone
    const { data } = await supabase.from('whatsapp_conversations')
      .select('phone, history, last_inbound_at').eq('phone', e164).maybeSingle()
    return { content: [{ type: 'text', text: JSON.stringify(data ?? {}, null, 2) }] }
  })

server.tool('send_message', 'Send a manual WhatsApp message as the bot (24h window applies).',
  { phone: z.string(), text: z.string() }, async ({ phone, text }) => {
    const e164  = normalizeIsraeliPhone(phone) ?? phone
    const creds = twilioCredsFromEnv()
    const from  = (Deno.env.get('TWILIO_WHATSAPP_FROM') ?? '').trim()
    if (!creds || !from) return { content: [{ type: 'text', text: 'twilio not configured' }], isError: true }
    await sendTwilioWhatsApp(e164, text, creds, from)
    return { content: [{ type: 'text', text: 'sent' }] }
  })

await server.connect(new StdioServerTransport())
