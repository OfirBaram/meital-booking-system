# WhatsApp MCP Server (future / optional)

A Model Context Protocol server that lets you operate the Meital WhatsApp channel
from **Claude Desktop** (or any MCP client) — read conversations, check health,
send a manual message as the bot, and resolve support tickets.

> Status: SCAFFOLD. Not deployed, not part of the Edge runtime. Running it is a
> deliberate, local, admin-only act on your own machine.

## Why this does NOT break the bot logic
The customer brain (`supabase/functions/_shared/bot-config.ts` → `TOOL_REGISTRY`)
is already a set of **pure `(input, ctx)` handlers**. The MCP server does **not**
touch that registry. Admin/operator capabilities are a SEPARATE concern and live
here, reusing the same shared building blocks:

- `_shared/health.ts`     → `getSystemHealth()`        (queue/health)
- `_shared/sms.ts`        → `sendTwilioWhatsApp()`     (manual outbound)
- `whatsapp_conversations`, `support_requests` tables  (read/triage)

So nothing customer-facing changes. The only thing to "add to bot-config.ts" is
**nothing** — its contract was already MCP-ready. If you later want the SAME
customer tools exposed over MCP, map `TOOL_REGISTRY` → MCP tools (one adapter),
never the reverse.

## Security
- Runs locally; needs `SUPABASE_SERVICE_ROLE_KEY` + Twilio creds in the local env
  (NEVER commit them). Treat this machine as admin.
- `send_whatsapp_message` is bound by the WhatsApp 24h window (use a template
  tool for out-of-window — see `sendTwilioWhatsAppTemplate`).

## Tools exposed
| MCP tool             | Backed by                          |
|----------------------|------------------------------------|
| `get_health`         | `getSystemHealth()`                |
| `list_open_support`  | `support_requests` (status=open)   |
| `read_conversation`  | `whatsapp_conversations` by phone  |
| `send_message`       | `sendTwilioWhatsApp()`             |

## Run (once implemented)
```jsonc
// claude_desktop_config.json
{ "mcpServers": { "meital-whatsapp": {
  "command": "deno",
  "args": ["run","-A","/abs/path/mcp/whatsapp-mcp/server.ts"],
  "env": { "SUPABASE_URL":"...", "SUPABASE_SERVICE_ROLE_KEY":"...",
           "TWILIO_ACCOUNT_SID":"...","TWILIO_AUTH_TOKEN":"...","TWILIO_WHATSAPP_FROM":"whatsapp:+..." }
}}}
```
