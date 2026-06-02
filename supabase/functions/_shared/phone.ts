// Pure phone normalisation shared by the Edge Functions. No Deno/esm imports, so
// it is unit-tested under Vitest (Node), exactly like messages.ts.
//
// WHY: every customer number is normalised to strict E.164 (+9725XXXXXXXX) before
// it reaches Twilio, but ADMIN_PHONE used to be read raw — and the secret held
// "+972 542290881" (a stray space). It was the only un-normalised number in the
// system. Route every destination through here so a malformed secret can never
// again hand Twilio a number it merely tolerates.

/** Strict Israeli -> E.164, or null when it cannot form a valid number. */
export function normalizeIsraeliPhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('972') && digits.length === 12) return '+' + digits
  if (digits.startsWith('05')  && digits.length === 10) return '+972' + digits.slice(1)
  return null
}

/**
 * Best-effort dialable number for a destination we'd rather still try than drop
 * (e.g. an admin alert): return the strict E.164 form when possible, otherwise a
 * whitespace-stripped fallback so a slightly-off secret still reaches Twilio.
 */
export function toDialable(raw: string | null | undefined): string {
  return normalizeIsraeliPhone(raw) ?? String(raw ?? '').replace(/\s+/g, '')
}
