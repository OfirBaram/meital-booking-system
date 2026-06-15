/**
 * Mixpanel CSP verification test.
 *
 * Intentionally does NOT import from ../support/test-base.js.
 * test-base.js stubs analytics.js to a no-op for all other specs —
 * if we used it here, Mixpanel would never fire a request and this
 * test would always time out on the waitForResponse.
 *
 * Run against the Vite dev server:
 *   npm run dev           (keep this running in another terminal)
 *   npx playwright test tests/e2e/mixpanel-csp.spec.js --headed
 */
import { test, expect } from '@playwright/test'

// Target the Vite dev server, not the preview server used by other specs.
const BASE_URL = process.env.MIXPANEL_TEST_URL ?? 'http://localhost:5173'

// Matches both api.mixpanel.com and api-js.mixpanel.com
const MIXPANEL_HOST_RE = /https:\/\/api(?:-js)?\.mixpanel\.com/

test.use({ baseURL: BASE_URL })

test('Mixpanel track request reaches the server and is not blocked by CSP', async ({ page }) => {
  const cspViolations = []

  page.on('console', msg => {
    if (msg.type() === 'error' && msg.text().includes('Content-Security-Policy')) {
      cspViolations.push(msg.text())
    }
  })

  // Arm the response listener BEFORE navigating so we don't miss the
  // landing_page_viewed event that fires on DOMContentLoaded.
  const mixpanelResponsePromise = page.waitForResponse(
    res => MIXPANEL_HOST_RE.test(res.url()),
    { timeout: 15_000 }
  )

  await page.goto('/')

  // Read the active CSP meta tag so we can report its connect-src on failure.
  const cspMetaContent = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content')
    .catch(() => null)

  const connectSrc = cspMetaContent?.match(/connect-src[^;]*/)?.[0] ?? null

  let res
  try {
    res = await mixpanelResponsePromise
  } catch {
    const lines = ['Mixpanel request did not complete within 15 s.']

    if (cspViolations.length) {
      lines.push('', 'CSP violations detected in browser console:')
      cspViolations.forEach(v => lines.push('  ' + v))
    } else {
      lines.push('No CSP violation messages captured.')
      lines.push('Possible causes: Mixpanel SDK failed to init, ad-blocker active, or wrong token.')
    }

    if (connectSrc) {
      lines.push('', 'Active connect-src directive on this page:')
      lines.push('  ' + connectSrc)
    } else {
      lines.push('', 'No CSP meta tag found — CSP may be served as an HTTP header instead.')
    }

    throw new Error(lines.join('\n'))
  }

  console.log(`[mixpanel-csp] ${res.status()} — ${res.url()}`)
  expect(
    res.status(),
    `Expected 200 from Mixpanel but got ${res.status()}. URL: ${res.url()}`
  ).toBe(200)
})
