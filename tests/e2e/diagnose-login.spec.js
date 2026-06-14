/**
 * tests/diagnose-login.spec.js
 *
 * Real-network diagnostic — zero mocks, hits live Supabase Edge Functions.
 * Run with:
 *   npx playwright test tests/diagnose-login.spec.js --headed --reporter=list
 *
 * The test always "passes" (it is a diagnostic, not a gate).
 * All signal is in the console output — copy/paste it when reporting issues.
 *
 * Override defaults with env vars:
 *   ADMIN_URL=http://127.0.0.1:5500/admin.html  ADMIN_TOKEN=mytoken
 *   npx playwright test tests/diagnose-login.spec.js --headed --reporter=list
 */

import { test } from '@playwright/test'

const ADMIN_URL  = process.env.ADMIN_URL  || 'http://localhost:4173/admin.html'
const TOKEN      = process.env.ADMIN_TOKEN || 'meital2026'
const SB_URL_KEY = 'supabase.co/functions'

test.describe.configure({ mode: 'serial' })

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fnName(url) {
  return (url.split('/functions/v1/')[1] || '?').split('?')[0]
}

function maskToken(raw) {
  if (!raw) return raw
  try {
    const obj = JSON.parse(raw)
    if (obj.adminToken) obj.adminToken = obj.adminToken.slice(0, 4) + '***'
    return JSON.stringify(obj)
  } catch { return raw }
}

function printSection(label) {
  console.log('\n' + '─'.repeat(62))
  console.log('  ' + label)
  console.log('─'.repeat(62))
}

function diagnoseSignIn(req, res, token) {
  if (!req) { console.log('  [SKIP] Request never made.'); return }
  if (!res) {
    console.log('  [FAIL] No response received — likely a CORS preflight block.')
    console.log('         Check DevTools for "net::ERR_FAILED" or "CORS error".')
    return
  }

  const origin = res.headers['access-control-allow-origin'] || 'MISSING'
  const cookie = res.headers['set-cookie'] || 'MISSING'
  const body   = res.body || '{}'

  console.log('  CORS allow-origin: ' + origin)
  console.log('  Set-Cookie:        ' + (cookie !== 'MISSING' ? cookie.slice(0, 60) + '...' : 'MISSING'))

  // Origin diagnosis
  const expectedOrigins = ['https://ofirbaram.github.io', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:4173']
  if (!expectedOrigins.includes(origin)) {
    console.log('\n  [WARN] CORS origin mismatch.')
    console.log('         Got:      "' + origin + '"')
    console.log('         Expected: one of ' + JSON.stringify(expectedOrigins))
    console.log('         Fix: ensure the CORS fix is deployed (bash scripts/deploy-functions.sh)')
  } else {
    console.log('\n  [OK]   CORS origin is correct: ' + origin)
  }

  // Status diagnosis
  if (res.status === 403) {
    console.log('\n  [FAIL] 403 Unauthorized.')
    try {
      const parsed = JSON.parse(body)
      console.log('         Server error field: "' + (parsed.error || '?') + '"')
    } catch {}
    console.log('         Token sent was "' + token.slice(0, 4) + '..." (' + token.length + ' chars).')
    console.log('         The ADMIN_TOKEN Supabase secret does not match.')
    console.log('         Fix: ! npx supabase secrets set ADMIN_TOKEN=' + token + ' --project-ref callmnxlcganwugxwiym')
    console.log('         Then wait 15s and retry.')
  } else if (res.status === 500) {
    console.log('\n  [FAIL] 500 Internal Error — a required secret (e.g. HMAC_SECRET) is not set.')
    console.log('         Check Supabase function logs:')
    console.log('         ! npx supabase functions logs admin-sign-in --project-ref callmnxlcganwugxwiym')
  } else if (res.status === 200 && cookie === 'MISSING') {
    console.log('\n  [WARN] 200 OK but no Set-Cookie in response.')
    console.log('         The Secure cookie may be stripped — see list-bookings diagnosis.')
  } else if (res.status === 200) {
    console.log('\n  [OK]   Login accepted and session cookie issued.')
  }
}

function diagnoseListBookings(req, res) {
  if (!req) {
    console.log('  [SKIP] Request never made — admin-sign-in must have failed first.')
    return
  }
  if (!res) {
    console.log('  [FAIL] No response received — possible CORS block on list-bookings endpoint.')
    return
  }

  const cookieHeader = req.headers['cookie'] || 'MISSING'
  const hasCookie    = cookieHeader !== 'MISSING' && cookieHeader.includes('admin_session=')

  console.log('  Cookie sent with request: ' + (hasCookie ? 'YES (admin_session present)' : 'NO — cookie is missing'))

  if (res.status === 403) {
    if (!hasCookie) {
      console.log('\n  [FAIL] 403 + no cookie sent.')
      console.log('         Root cause: the Secure session cookie is not being included in the request.')
      console.log('         This happens when:')
      console.log('           1. admin-sign-in returned 403/500, so no cookie was ever issued.')
      console.log('           2. Chrome refuses to store a "Secure" cookie set via HTTPS when the')
      console.log('              initiating page is plain HTTP (http://127.0.0.1:5500).')
      console.log('         Fix option A: Set the ADMIN_TOKEN secret and retry (if cause 1).')
      console.log('         Fix option B: Serve the admin page over HTTPS locally.')
      console.log('           - VS Code: install the "Live Server" HTTPS extension, or')
      console.log('           - run: npx serve frontend --ssl-cert cert.pem --ssl-key key.pem -p 5500')
      console.log('           - OR:  access the deployed GitHub Pages version for admin tasks.')
    } else {
      console.log('\n  [FAIL] 403 + cookie WAS sent, but server rejected the session.')
      console.log('         The session token is tampered or the HMAC_SECRET changed.')
      console.log('         Fix: sign out and log in again (clears the old session cookie).')
    }
  } else if (res.status === 200) {
    console.log('\n  [OK]   list-bookings returned 200. Full login flow is working.')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The diagnostic test
// ─────────────────────────────────────────────────────────────────────────────

test('diagnose admin login — full network trace', async ({ page }) => {
  const capturedReqs  = {}
  const capturedResps = {}

  // ── Capture every Supabase function request ──────────────────────────────
  page.on('request', req => {
    if (!req.url().includes(SB_URL_KEY)) return
    const name = fnName(req.url())
    capturedReqs[name] = {
      url:      req.url(),
      method:   req.method(),
      headers:  req.headers(),
      postData: req.postData(),
    }
  })

  // ── Capture every Supabase function response ─────────────────────────────
  page.on('response', async res => {
    if (!res.url().includes(SB_URL_KEY)) return
    const name = fnName(res.url())
    let body = ''
    try { body = await res.text() } catch { body = '<unreadable>' }
    capturedResps[name] = {
      status:  res.status(),
      headers: res.headers(),
      body,
    }
  })

  // ── JS crash monitor ─────────────────────────────────────────────────────
  const jsErrors = []
  page.on('pageerror', e => jsErrors.push(e.message))

  // ── Navigate to the real admin page ──────────────────────────────────────
  printSection('NAVIGATING')
  console.log('  URL:   ' + ADMIN_URL)
  console.log('  Token: "' + TOKEN.slice(0, 4) + '..." (' + TOKEN.length + ' chars)')

  await page.goto(ADMIN_URL)

  const loginVisible = await page.locator('#js-login').isVisible({ timeout: 10_000 }).catch(() => false)
  if (!loginVisible) {
    printSection('FATAL — login panel never appeared')
    console.log('  Page may have crashed or the URL is wrong.')
    if (jsErrors.length) console.log('  JS errors: ' + JSON.stringify(jsErrors))
    await page.screenshot({ path: 'test-results/diagnose-login.png' })
    console.log('  Screenshot: test-results/diagnose-login.png')
    return
  }
  console.log('  Login panel visible: YES')

  // ── Fill form and submit ──────────────────────────────────────────────────
  await page.locator('#js-token-input').fill(TOKEN)
  await page.locator('#js-login-btn').click()

  // Wait for the two requests to complete
  await page.waitForTimeout(7_000)

  // ── RAW NETWORK LOG ───────────────────────────────────────────────────────
  printSection('RAW NETWORK LOG — ALL SUPABASE CALLS')
  const allNames = new Set([...Object.keys(capturedReqs), ...Object.keys(capturedResps)])
  for (const name of allNames) {
    const req = capturedReqs[name]
    const res = capturedResps[name]
    console.log('\n  Function: ' + name)
    if (req) {
      console.log('    REQ  method:  ' + req.method)
      console.log('    REQ  origin:  ' + (req.headers['origin'] || '(none)'))
      console.log('    REQ  auth:    ' + (req.headers['authorization'] || '(none)').slice(0, 30) + '...')
      console.log('    REQ  body:    ' + maskToken(req.postData))
    } else {
      console.log('    REQ  (never sent)')
    }
    if (res) {
      console.log('    RESP status:  ' + res.status)
      console.log('    RESP cors:    ' + (res.headers['access-control-allow-origin'] || '(none)'))
      console.log('    RESP cookie:  ' + (res.headers['set-cookie'] ? res.headers['set-cookie'].slice(0, 70) + '...' : '(none)'))
      console.log('    RESP body:    ' + res.body)
    } else {
      console.log('    RESP (never received)')
    }
  }

  // ── STEP-BY-STEP DIAGNOSIS ────────────────────────────────────────────────
  printSection('STEP 1 — admin-sign-in (token check + session cookie)')
  diagnoseSignIn(capturedReqs['admin-sign-in'], capturedResps['admin-sign-in'], TOKEN)

  printSection('STEP 2 — list-bookings (session cookie validation)')
  diagnoseListBookings(capturedReqs['list-bookings'], capturedResps['list-bookings'])

  // ── FINAL UI STATE ────────────────────────────────────────────────────────
  printSection('FINAL UI STATE')
  const dashVisible    = await page.locator('#js-dash').isVisible()
  const loginErrShown  = await page.locator('#js-login-err').isVisible()
  console.log('  Dashboard shown:   ' + dashVisible)
  console.log('  Login error shown: ' + loginErrShown)
  if (!dashVisible) {
    await page.screenshot({ path: 'test-results/diagnose-login.png' })
    console.log('  Screenshot saved:  test-results/diagnose-login.png')
  }

  if (jsErrors.length) {
    console.log('\n  JS ERRORS DURING TEST:')
    jsErrors.forEach(e => console.log('    ' + e))
  }

  printSection('END OF DIAGNOSTIC')
})
