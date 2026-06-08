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
    const expected = (Deno.env.get('ADMIN_TOKEN') ?? '').trim()

    if (!adminToken || !expected || !timingSafeEqualHex(String(adminToken).trim(), expected)) {
      console.warn('[admin-sign-in] failed attempt ip=' + (req.headers.get('x-forwarded-for') ?? 'unknown'))
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const secret = (Deno.env.get('HMAC_SECRET') ?? '').trim()
    if (!secret) throw new Error('HMAC_SECRET not configured')

    const token = await signAdminSession(secret)
    console.log('[admin-sign-in] session issued')
    return json({ success: true }, 200, { 'Set-Cookie': sessionCookieHeader(token) })
  } catch (err) {
    console.error('[admin-sign-in]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
