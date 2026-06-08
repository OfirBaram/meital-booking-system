// Centralised CORS + security headers for all Edge Functions.

/** Allowed origin for admin endpoints (restrict from wildcard). */
export const ADMIN_ORIGIN = 'https://ofirbaram.github.io'

/** CORS headers for admin-only endpoints — locks origin, enables credentials. */
export function adminCors(_req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':      ADMIN_ORIGIN,
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
