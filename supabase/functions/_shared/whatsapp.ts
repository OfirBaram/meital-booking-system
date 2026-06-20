// _shared/whatsapp.ts
// Pure, transport-free WhatsApp helpers — extracted from chat-handler so they are
// unit-testable under Deno.test WITHOUT importing chat-handler (which would start
// Deno.serve). No DB, no env, no network here.

export const WA_MAX_HISTORY = 20

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

/** Mask a phone for logs — PII must never hit the log stream in clear text. */
export function maskPhone(p: string | null): string {
  return p ? '****' + p.slice(-4) : 'unknown'
}

/** Redact Israeli phone numbers from an arbitrary string before logging it.
 *  Twilio error bodies can echo the 'To' number, so any caught Twilio/exception
 *  text must be scrubbed before it reaches console.* / Supabase logs. */
export function scrubPhones(s: string): string {
  return String(s ?? '').replace(/(?:whatsapp:)?(?:\+?972\d{8,9}|0\d{8,9})/g, '****redacted****')
}

/** Translate web UI tokens to WhatsApp-native text + tidy whitespace for mobile. */
export function renderForWhatsApp(text: string): string {
  return String(text ?? '')
    .replace(/\s*\[WA\]\s*/g, '\n📱 wa.me/972547686865\n')
    .replace(/\s*\[IG\]\s*/g, '\n📸 instagram.com/meytal.sheva\n')
    .replace(/\[SVC:[a-z0-9_]+\]/gi, '')
    .replace(/\[BOOK:[^\]]+\]/gi, '')
    .replace(/^[ \t]*[-*]\s+/gm, '• ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** Keep the tail of the history, preserving user->assistant alternation. */
export function trimHistory(turns: ChatTurn[]): ChatTurn[] {
  if (turns.length <= WA_MAX_HISTORY) return turns
  const tail = turns.slice(turns.length - WA_MAX_HISTORY)
  return tail[0]?.role === 'user' ? tail : tail.slice(1)
}
