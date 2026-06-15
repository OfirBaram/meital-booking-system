// Client session tokens — stateless, 1h TTL, HMAC-signed.
//
// Format: <phoneB64url>.<expiryHex>.<hmac>
//   phoneB64url = base64url(phone E.164)
//   expiryHex   = (Date.now() + 3_600_000).toString(16)
//   hmac        = HMAC-SHA256(HMAC_SECRET, "client_session:" + phone + ":" + expiryHex)
//
// The phone is inside the HMAC so token-swapping between clients is impossible.

import { hmacSha256Hex, timingSafeEqualHex } from './crypto.ts'

const TTL_MS = 60 * 60 * 1000   // 1 hour

export async function signClientSession(phone: string, secret: string): Promise<string> {
  const expiryHex = (Date.now() + TTL_MS).toString(16)
  const phoneB64  = btoa(phone).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const mac       = await hmacSha256Hex(secret, 'client_session:' + phone + ':' + expiryHex)
  return phoneB64 + '.' + expiryHex + '.' + mac
}

/** Returns phone (E.164) if valid and unexpired, null otherwise. */
export async function verifyClientSession(token: string, secret: string): Promise<string | null> {
  if (!token || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [phoneB64, expiryHex, mac] = parts
  let phone: string
  try { phone = atob(phoneB64.replace(/-/g, '+').replace(/_/g, '/')) }
  catch { return null }
  const expiry = parseInt(expiryHex, 16)
  if (!Number.isFinite(expiry) || Date.now() > expiry) return null
  const expected = await hmacSha256Hex(secret, 'client_session:' + phone + ':' + expiryHex)
  return timingSafeEqualHex(mac, expected) ? phone : null
}

export function extractBearerToken(req: Request): string | null {
  const h = (req.headers.get('authorization') ?? '').trim()
  if (!h.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}
