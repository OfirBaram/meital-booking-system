// HMAC helpers shared by verify-and-book (sign) and admin-action (verify).
// Uses Web Crypto (globalThis.crypto.subtle), available in both Deno and
// Node 20+, so the timing-safe comparison can be unit-tested under Vitest.

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time hex-string comparison (no early-exit on first diff). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

/** Verify an HMAC-SHA256 hex token for `message` against `secret`. */
export async function verifyHmacToken(secret: string, message: string, token: string): Promise<boolean> {
  if (!secret || !token) return false
  const expected = await hmacSha256Hex(secret, message)
  return timingSafeEqualHex(expected, token)
}
