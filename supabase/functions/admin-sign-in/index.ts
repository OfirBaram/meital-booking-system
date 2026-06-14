// admin-sign-in — exchange the static ADMIN_TOKEN for a 24 h httpOnly session cookie.
//
// Security model:
//   - ADMIN_TOKEN is validated with a timing-safe comparison (prevents oracle attack).
//   - The issued cookie is HttpOnly (JS cannot read it), Secure (HTTPS only),
//     SameSite=None (required for cross-origin github.io → supabase.co calls).
//   - CSRF is mitigated by the restrictive CORS origin + JSON Content-Type
//     (cross-origin non-github.io POSTs are blocked at browser preflight).
//   - The session token is self-contained: HMAC(HMAC_SECRET, "admin_session:" + expiry).
//     No DB table needed; the HMAC makes it unforgeable without the secret.

import { timingSafeEqualHex }                   from '../_shared/crypto.ts'
import { signAdminSession, sessionCookieHeader } from '../_shared/auth.ts'
import { adminCors, SEC_HEADERS }               from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = adminCors(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })
  }

  function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, ...SEC_HEADERS, 'Content-Type': 'application/json', ...extra },
    })
  }

  try {
    const { adminToken } = await req.json()
    const submitted = String(adminToken ?? '').trim()
    const expected  = (Deno.env.get('ADMIN_TOKEN') ?? '').trim()
    const ip        = req.headers.get('x-forwarded-for') ?? 'unknown'
    const origin    = req.headers.get('origin') ?? 'unknown'

    if (!submitted) {
      console.warn(`[admin-sign-in] reject=no_token ip=${ip} origin=${origin}`)
      return json({ success: false, error: 'unauthorized' }, 403)
    }
    if (!expected) {
      console.error(`[admin-sign-in] reject=secret_not_configured ip=${ip}`)
      return json({ success: false, error: 'unauthorized' }, 403)
    }
    if (submitted.length !== expected.length) {
      console.warn(`[admin-sign-in] reject=length_mismatch submitted_len=${submitted.length} expected_len=${expected.length} ip=${ip} origin=${origin}`)
      return json({ success: false, error: 'unauthorized' }, 403)
    }
    if (!timingSafeEqualHex(submitted, expected)) {
      console.warn(`[admin-sign-in] reject=content_mismatch len=${submitted.length} ip=${ip} origin=${origin}`)
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!secret) throw new Error('HMAC_SECRET not configured')

    const token = await signAdminSession(secret)
    console.log('[admin-sign-in] session issued')
    return json({ success: true, sessionToken: token }, 200, { 'Set-Cookie': sessionCookieHeader(token) })
  } catch (err) {
    console.error('[admin-sign-in]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
