// admin-sign-out — expire the admin session cookie immediately.
// No auth needed: the worst an attacker can do is sign out a valid session.

import { adminCors, SEC_HEADERS }  from '../_shared/cors.ts'
import { clearSessionCookieHeader } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const cors = adminCors(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { ...cors, ...SEC_HEADERS } })

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      ...cors,
      ...SEC_HEADERS,
      'Content-Type': 'application/json',
      'Set-Cookie':   clearSessionCookieHeader(),
    },
  })
})
