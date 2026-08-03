/**
 * PII redaction for stored chat transcripts.
 *
 * The website chat is now recorded so the studio can see what people ask. That
 * makes free text from strangers durable, so identifiers are stripped before the
 * row is written — not on read, and not "when we get around to it". A transcript
 * is useful for "what do customers want to know"; the phone number inside it is
 * not, and storing it would turn an analytics table into a personal-data store.
 *
 * Deliberately conservative: over-redacting costs a little readability, and
 * under-redacting costs a privacy incident.
 */

// Israeli mobile/landline in the many shapes people type them, plus generic
// international. Longest patterns first so a full +972 number is not partly
// eaten by the shorter local rule.
const PHONE_PATTERNS: RegExp[] = [
  /(?:\+|00)972[-\s.]?\d{1,2}[-\s.]?\d{3}[-\s.]?\d{4}/g,   // +972 54 123 4567
  /\b0\d{1,2}[-\s.]?\d{3}[-\s.]?\d{4}\b/g,                  // 054-123-4567 / 03-1234567
  /\b\d{9,15}\b/g,                                          // bare digit runs
]

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/** Israeli ID numbers are 9 digits — covered by the bare-run rule above. */
export function redactPii(text: string): string {
  if (!text) return ''
  let out = String(text)
  out = out.replace(EMAIL_RE, '[אימייל]')
  for (const re of PHONE_PATTERNS) out = out.replace(re, '[טלפון]')
  return out
}

export interface ChatTurnLike { role: string; content: unknown }

/**
 * Redact a whole conversation and cap its size.
 *
 * `maxTurns` keeps a runaway session from growing a single row without bound;
 * `maxChars` does the same per turn. Both are far above any real conversation.
 */
export function redactHistory(
  history: ChatTurnLike[],
  maxTurns = 40,
  maxChars = 2000,
): { role: string; content: string }[] {
  if (!Array.isArray(history)) return []
  return history
    .slice(-maxTurns)
    .filter(t => t && (t.role === 'user' || t.role === 'assistant'))
    .map(t => ({
      role:    t.role as string,
      content: redactPii(String(t.content ?? '')).slice(0, maxChars),
    }))
}
