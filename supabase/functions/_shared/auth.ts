// Stateless admin-session cookie helpers.
//
// Session token format: <expiryHex>.<hmac>
//   expiryHex = Unix ms expiry as hex (prevents fixed-length timing leak)
//   hmac      = HMAC-SHA256(HMAC_SECRET, "admin_session:" + expiryHex)
//
// No DB table needed — self-contained expiry + HMAC makes the token
// unforgeable without the secret and self-expiring without any state.

import { hmacSha256Hex, timingSafeEqualHex } from './crypto.ts'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000   // 24 h
const COOKIE_NAME    = 'admin_session'

/** Issue a new 24 h session token signed with HMAC_SECRET. */
export async function signAdminSession(secret: string): Promise<string> {
  const expiryHex = (Date.now() + SESSION_TTL_MS).toString(16)
  const mac       = await hmacSha256Hex(secret, 'admin_session:' + expiryHex)
  return expiryHex + '.' + mac
}

/** Validate a raw session token string (expiry + HMAC check). */
async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const expiryHex = token.slice(0, dot)
  const mac       = token.slice(dot + 1)
  const expiry    = parseInt(expiryHex, 16)
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false
  const expected = await hmacSha256Hex(secret, 'admin_session:' + expiryHex)
  return timingSafeEqualHex(mac, expected)
}

/**
 * Validate an admin request via session cookie (primary) or x-admin-session
 * header (fallback for local HTTP origins where Secure cross-site cookies are
 * blocked by the browser even though the API is HTTPS).
 * Both paths validate the same HMAC-signed 24 h token — identical security.
 */
export async function validateAdminSession(req: Request, secret: string): Promise<boolean> {
  if (!secret) return false

  // Primary: httpOnly cookie (works on HTTPS pages, e.g. GitHub Pages)
  const cookieToken = getSessionCookie(req)
  if (cookieToken && await verifySessionToken(cookieToken, secret)) return true

  // Fallback: x-admin-session header (local dev — http://127.0.0.1 Chrome blocks Secure cross-site cookies)
  const headerToken = (req.headers.get('x-admin-session') ?? '').trim()
  if (headerToken && await verifySessionToken(headerToken, secret)) return true

  return false
}

/** Extract the admin_session cookie value from a request, or null. */
export function getSessionCookie(req: Request): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === COOKIE_NAME) return part.slice(eq + 1).trim()
  }
  return null
}

/** Produce a Set-Cookie header value that plants the session cookie. */
export function sessionCookieHeader(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=86400`
}

/** Produce a Set-Cookie header value that immediately expires the cookie. */
export function clearSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0`
}
