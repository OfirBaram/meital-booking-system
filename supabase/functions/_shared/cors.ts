// Centralised CORS + security headers for all Edge Functions.

/** Production origin + local dev origins allowed for admin endpoints. */
const ADMIN_ORIGINS = new Set([
  'https://ofirbaram.github.io',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:4173',   // Playwright / npx serve dev server
])

/** Primary origin (used as fallback when request has no Origin header). */
export const ADMIN_ORIGIN = 'https://ofirbaram.github.io'

/** CORS headers for admin-only endpoints — echoes back the matched origin, enables credentials. */
export function adminCors(req: Request): Record<string, string> {
  const origin  = req.headers.get('origin') ?? ''
  const allowed = ADMIN_ORIGINS.has(origin) ? origin : ADMIN_ORIGIN
  return {
    'Access-Control-Allow-Origin':      allowed,
    'Access-Control-Allow-Methods':     'POST, OPTIONS',
    'Access-Control-Allow-Headers':     'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  }
}

/** CORS headers for public customer-facing endpoints (any origin). */
export const PUBLIC_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

/**
 * HTTP hardening headers added to every response regardless of endpoint type.
 * nosniff:  blocks MIME-type sniffing
 * DENY:     prevents all framing (clickjacking)
 * no-store: prevents caches from persisting sensitive API responses
 */
export const SEC_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options':        'DENY',
  'Referrer-Policy':        'strict-origin-when-cross-origin',
  'Cache-Control':          'no-store',
}
