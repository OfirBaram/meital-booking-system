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

    await use(page)

    // Only attach diagnostics when the test did NOT end as expected (failed/timed out).
    const failed = testInfo.status !== testInfo.expectedStatus
    if (!failed) return

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
