/**
 * Shared Playwright test base for all browser-driven E2E specs.
 *
 * WHY THIS EXISTS
 * ----------------
 * The default `import { test } from '@playwright/test'` gives you a screenshot
 * and a trace on failure, but it throws away the two things that explain *why*
 * a frontend test failed: the browser console (JS errors, our own log() lines)
 * and failed network requests. When a test goes red in CI, "element not found"
 * is rarely the real cause — a console SyntaxError or a 500 on a mocked route
 * is. This base captures both and ATTACHES them to the failing test so they
 * land in the HTML report AND in test-results/ for Claude to read.
 *
 * It is a drop-in replacement: specs only change their import line from
 *   import { test, expect } from '@playwright/test'
 * to
 *   import { test, expect } from '../support/test-base.js'
 *
 * The page-capturing logic only runs for tests that actually request the
 * `page` fixture, so CLI-style specs that never touch a browser are unaffected.
 */
import { test as base, expect } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    /** @type {string[]} */
    const consoleLines = []
    /** @type {string[]} */
    const pageErrors = []
    /** @type {string[]} */
    const networkFailures = []

    page.on('console', msg => {
      // Capture everything; the type tag lets a reader filter for [error]/[warning].
      consoleLines.push(`[${msg.type()}] ${msg.text()}`)
    })

    page.on('pageerror', err => {
      // Uncaught exceptions in page code — the #1 cause of "white screen" / missing element.
      pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? '(no stack)'}`)
    })

    page.on('requestfailed', req => {
      const failure = req.failure()
      networkFailures.push(`FAILED  ${req.method()} ${req.url()} — ${failure ? failure.errorText : 'unknown'}`)
    })

    page.on('response', res => {
      if (res.status() >= 400) {
        networkFailures.push(`HTTP ${res.status()}  ${res.request().method()} ${res.url()}`)
      }
    })

    // Stub the service worker so it doesn't cache real app files (incl. analytics.js)
    // and cause cache-first stale responses that bypass our route mocks after reload.
    await page.route('**/sw.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil(clients.claim()));',
    }))
    // Stub analytics so mixpanel-browser (bare npm specifier) doesn't crash the browser.
    await page.route('**/lib/analytics.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'export function trackEvent(){}export function identifyUser(){}export function resetUser(){}',
    }))
    // Also stub landing-analytics.js which re-exports from analytics.js.
    await page.route('**/landing-analytics.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript', body: '',
    }))

    await use(page)

    // Only attach diagnostics when the test did NOT end as expected (failed/timed out).
    const failed = testInfo.status !== testInfo.expectedStatus
    if (!failed) return

    // Named screenshot: {test-slug}-{unix-ms}.png so artifacts are self-describing.
    const slug = testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50).replace(/-+$/, '')
    const screenshotPath = testInfo.outputPath(`${slug}-${Date.now()}.png`)
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true })
      await testInfo.attach('screenshot', { path: screenshotPath, contentType: 'image/png' })
    } catch {
      // page may already be closed (navigation failure); screenshot is best-effort
    }

    if (pageErrors.length) {
      await testInfo.attach('page-errors.log', {
        body: pageErrors.join('\n\n'),
        contentType: 'text/plain',
      })
    }
    if (consoleLines.length) {
      await testInfo.attach('browser-console.log', {
        body: consoleLines.join('\n'),
        contentType: 'text/plain',
      })
    }
    if (networkFailures.length) {
      await testInfo.attach('network-failures.log', {
        body: networkFailures.join('\n'),
        contentType: 'text/plain',
      })
    }
  },
})

export { expect }

/** Returns today as YYYY-MM-DD in local time, matching the browser's _todayISO(). */
export function localToday() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
