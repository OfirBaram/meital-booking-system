/**
 * tests/e2e/admin-calendar-rtl.spec.js
 * Admin Calendar — RTL arrow direction & navigation correctness
 *
 * Regression guard for the bug where RTL flex layout caused:
 *   - js-cal-next (visual RIGHT) to carry a left-pointing arrow and advance to next month
 *   - js-cal-prev (visual LEFT)  to carry a right-pointing arrow and go to previous month
 * Both are the opposite of what a Hebrew RTL user expects.
 *
 * After the fix:
 *   - btn-cal-prev (visual LEFT)  → left-pointing arrow  → advances to NEXT month
 *   - btn-cal-next (visual RIGHT) → right-pointing arrow → retreats to PREVIOUS month
 *
 * Coverage:
 *  1. Arrow SVG paths match expected RTL direction (left button = ←, right button = →)
 *  2. btn-cal-prev advances the calendar to the next month
 *  3. btn-cal-next retreats the calendar to the previous month
 *  4. Round-trip: prev then next returns to the starting month
 *  5. Navigation does not throw any JS errors
 */

import { test, expect } from '../support/test-base.js'

// ─── Shared mocks (mirrors admin-dashboard.spec.js) ──────────────────────────

const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

const MOCK_BOOKINGS = {
  success:  true,
  bookings: [],
}

async function setupAdminMocks(page) {
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url = request.url()
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (url.endsWith('/list-bookings'))  return respond(MOCK_BOOKINGS)
    if (url.endsWith('/admin-slots'))    return respond({ success: true, slots: [] })
    if (url.endsWith('/admin-clients'))  return respond({ success: true, clients: [] })
    if (url.endsWith('/sms-log'))        return respond({ success: true, entries: [] })
    return respond({ success: true })
  })
}

async function loginAndOpenCalendar(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await page.locator('[data-qa="nav-tab-calendar"]').click()
  await expect(page.locator('#js-cal-title')).toBeVisible({ timeout: 5_000 })
}

// ─── Hebrew month helpers ─────────────────────────────────────────────────────

const MONTHS_HE = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
]

/** Build the expected Hebrew title for a given JS Date. */
function heTitle(date) {
  return MONTHS_HE[date.getMonth()] + ' ' + date.getFullYear()
}

/** Return a new Date shifted by +/- months relative to the given date. */
function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

// ─── 1. Arrow SVG directions ──────────────────────────────────────────────────

test.describe('Admin calendar — RTL arrow directions', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await loginAndOpenCalendar(page)
  })

  test('btn-cal-prev (visual left) carries a left-pointing arrow ←', async ({ page }) => {
    // M15 19l-7-7 7-7 is the SVG chevron-left path (‹)
    const path = page.locator('[data-qa="btn-cal-prev"] path')
    await expect(path).toHaveAttribute('d', 'M15 19l-7-7 7-7')
  })

  test('btn-cal-next (visual right) carries a right-pointing arrow →', async ({ page }) => {
    // M9 5l7 7-7 7 is the SVG chevron-right path (›)
    const path = page.locator('[data-qa="btn-cal-next"] path')
    await expect(path).toHaveAttribute('d', 'M9 5l7 7-7 7')
  })
})

// ─── 2. Navigation direction ──────────────────────────────────────────────────

test.describe('Admin calendar — RTL navigation direction', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await loginAndOpenCalendar(page)
  })

  test('btn-cal-prev (visual left) advances to the next month', async ({ page }) => {
    const titleEl  = page.locator('#js-cal-title')
    const startText = await titleEl.textContent()

    // Derive expected next-month title from the displayed text
    const startMonth = MONTHS_HE.findIndex(m => startText.includes(m))
    const startYear  = parseInt(startText.match(/\d{4}/)[0], 10)
    const start      = new Date(startYear, startMonth, 1)
    const expected   = heTitle(shiftMonth(start, +1))

    await page.locator('[data-qa="btn-cal-prev"]').click()
    await expect(titleEl).toHaveText(expected)
  })

  test('btn-cal-next (visual right) retreats to the previous month', async ({ page }) => {
    const titleEl  = page.locator('#js-cal-title')
    const startText = await titleEl.textContent()

    const startMonth = MONTHS_HE.findIndex(m => startText.includes(m))
    const startYear  = parseInt(startText.match(/\d{4}/)[0], 10)
    const start      = new Date(startYear, startMonth, 1)
    const expected   = heTitle(shiftMonth(start, -1))

    await page.locator('[data-qa="btn-cal-next"]').click()
    await expect(titleEl).toHaveText(expected)
  })

  test('round-trip: prev then next returns to the starting month', async ({ page }) => {
    const titleEl   = page.locator('#js-cal-title')
    const startText = (await titleEl.textContent()).trim()

    await page.locator('[data-qa="btn-cal-prev"]').click()   // advance
    await page.locator('[data-qa="btn-cal-next"]').click()   // retreat back

    await expect(titleEl).toHaveText(startText)
  })

  test('multi-step navigation: three steps forward via btn-cal-prev', async ({ page }) => {
    const titleEl   = page.locator('#js-cal-title')
    const startText = await titleEl.textContent()

    const startMonth = MONTHS_HE.findIndex(m => startText.includes(m))
    const startYear  = parseInt(startText.match(/\d{4}/)[0], 10)
    const start      = new Date(startYear, startMonth, 1)

    for (let i = 0; i < 3; i++) {
      await page.locator('[data-qa="btn-cal-prev"]').click()
    }

    await expect(titleEl).toHaveText(heTitle(shiftMonth(start, +3)))
  })
})

// ─── 3. No JS errors during navigation ───────────────────────────────────────

test.describe('Admin calendar — navigation stability', () => {
  test('clicking both navigation buttons does not throw any JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await loginAndOpenCalendar(page)

    // Alternate forward/backward several times
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-qa="btn-cal-prev"]').click()
      await page.locator('[data-qa="btn-cal-next"]').click()
    }

    expect(jsErrors, 'JS errors during navigation: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})
