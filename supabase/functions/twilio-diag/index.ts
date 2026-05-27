/**
 * twilio-diag — TEMPORARY diagnostic function.
 *
 * DELETE THIS FUNCTION after the Twilio 401 is resolved.
 * Run: supabase functions delete twilio-diag
 *
 * What it does:
 *   1. Reads all three Twilio secrets after .trim()
 *   2. Logs safe partial reveals (length + prefix/suffix only — never full values)
 *   3. Sends a real Twilio API request and reports the exact HTTP status + error body
 *   4. Returns a JSON report you can read in the browser
 *
 * Invoke: GET https://<project>.supabase.co/functions/v1/twilio-diag
 * (No auth required — this function is intentionally public for one-shot debugging.
 *  Delete it immediately once done.)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, Authorization',
}

function safeReveal(value: string, label: string) {
  if (!value) return { [label + '_present']: false }
  return {
    [label + '_present']: true,
    [label + '_len']:     value.length,
    [label + '_prefix']:  value.slice(0, 5),   // e.g. "ACabc" for SID — safe to compare with console
    [label + '_suffix']:  value.slice(-3),      // last 3 chars — helps spot wrong account
    [label + '_has_whitespace']: value !== value.trim() || /\s/.test(value),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const accountSid = (Deno.env.get('TWILIO_ACCOUNT_SID') ?? '').trim()
  const authToken  = (Deno.env.get('TWILIO_AUTH_TOKEN')  ?? '').trim()
  const fromNumber = (Deno.env.get('TWILIO_FROM_NUMBER') ?? '').trim()

  const report: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    ...safeReveal(accountSid, 'sid'),
    ...safeReveal(authToken,  'token'),
    ...safeReveal(fromNumber, 'from'),
  }

  // Expected values for a healthy config:
  //   sid_len   = 34  (starts with "AC")
  //   token_len = 32
  //   *_has_whitespace = false for all three
  report['expected'] = { sid_len: 34, token_len: 32 }
  report['sid_starts_with_AC'] = accountSid.startsWith('AC')

  // Only attempt the Twilio call if all three secrets are present
  if (!accountSid || !authToken || !fromNumber) {
    report['twilio_call'] = 'SKIPPED — one or more secrets missing'
    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Hit the Twilio account info endpoint — no SMS sent, just an auth check.
  // A 200 here proves the SID + token are valid.
  // A 401 here proves the credentials themselves are wrong.
  try {
    const accountRes = await fetch(
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '.json',
      {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + btoa(accountSid + ':' + authToken),
        },
      },
    )

    const body = await accountRes.text()
    let parsed: unknown = null
    try { parsed = JSON.parse(body) } catch { /* not JSON */ }

    report['twilio_auth_check'] = {
      http_status:   accountRes.status,
      status_text:   accountRes.statusText,
      // On 200: shows account type ("full" = funded, "trial" = trial)
      // On 401: shows Twilio error code + message
      response_body: parsed ?? body.slice(0, 400),
    }

    // Interpretation helper
    if (accountRes.status === 200) {
      const acct = parsed as Record<string, unknown> | null
      report['interpretation'] = 'AUTH OK — credentials are valid. ' +
        'Account type: ' + (acct?.type ?? 'unknown') + '. ' +
        'If SMS still fails after this, the issue is your From number or carrier filtering, not credentials.'
    } else if (accountRes.status === 401) {
      report['interpretation'] = 'AUTH FAILED — SID/token mismatch or hidden characters. ' +
        'Check sid_has_whitespace and token_has_whitespace above. ' +
        'Also verify you copied the LIVE token, not the Test token.'
    } else {
      report['interpretation'] = 'Unexpected status ' + accountRes.status + ' — see response_body.'
    }

  } catch (err) {
    report['twilio_call_error'] = err instanceof Error ? err.message : String(err)
  }

  console.log('[twilio-diag] report:', JSON.stringify(report))

  return new Response(JSON.stringify(report, null, 2), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
