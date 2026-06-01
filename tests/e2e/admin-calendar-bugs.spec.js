/**
 * tests/e2e/admin-calendar-bugs.spec.js
 * Regression suite for two bugs fixed in fix/admin-dashboard-bugs.
 *
 * Bug 1 — stray ב character in config.js caused
 *   `Uncaught ReferenceError: ב is not defined` on page load, showing the
 *   crash banner instead of the login panel.
 *
 * Bug 2 — renderCalendar() in admin-calendar.js added dot indicators to
 *   "other-month" overflow cells (days from a neighbouring month shown at
 *   the edges of the current-month grid).  These cells have
 *   `pointer-events: none` and no click handler, so the dots looked
 *   interactive but clicking them did nothing.  The fix: guard dot rendering
 *   with `&& !cell.isOtherMonth` to mirror the existing click-handler guard.
 *
 * Coverage:
 *   1. No JS errors on page load (guards Bug 1 — config.js syntax safety)
 *   2. Crash banner is hidden on clean load (Bug 1 secondary check)
 *   3. Other-month overflow cell with Approved booking has NO dot indicator
 *   4. Current-month cell with Approved booking DOES show a dot
 *   5. Clicking a current-month cell with an Approved booking opens the sheet
 *   6. Other-month cell does not open the sheet on click (pointer-events guard)
 *   7. No JS errors during a full calendar click + sheet close cycle
 */
import { test, expect } from '../support/test-base.js'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'
const TODAY        = new Date().toISOString().slice(0, 10)

// ─── Compute an overflow date guaranteed to appear as other-month in the grid ─
//
// The calendar grid for month M starts on the Sunday before/on the 1st of M.
// Cells whose date falls outside M carry class "other-month".
//
// • When dow0 > 0: the last day of the previous month is in the grid.
// • When dow0 = 0: no prev-month overflow; the first day of next month is in
//   the grid (total=35, current-month cells fill only lastDay of 35 slots).
const _now     = new Date()
const _year    = _now.getFullYear()
const _month   = _now.getMonth() + 1            // 1-based
const _dow0    = new Date(_year, _month - 1, 1).getDay()  // day-of-week of 1st

const OVERFLOW_DATE = _dow0 > 0
  ? new Date(_year, _month - 1, 0).toISOString().slice(0, 10)   // last day of prev month
  : new Date(_year, _month, 1).toISOString().slice(0, 10)        // first day of next month

const TODAY_DISPLAY = TODAY.replace(/-/g, '/')

// ─── Mock infrastructure ──────────────────────────────────────────────────────

function makeBookings(extra = []) {
  return {
    success: true,
    bookings: [
      {
        id: 'cal-bug-today-1',
        name: 'לקוחה אישור',
        phone: '0501234567',
        service: 'gel_classic',
        serviceName: "לק ג'ל קלאסי",
        date: TODAY,
        time: '11:00',
        status: 'Approved',
        timestamp: TODAY + 'T11:00:00+03:00',
        duration: 90,
      },
      ...extra,
    ],
  }
}

const OVERFLOW_BOOKING = {
  id: 'cal-bug-overflow-1',
  name: 'לקוחה גלישה',
  phone: '0509876543',
  service: 'gel_classic',
  serviceName: "לק ג'ל קלאסי",
  date: OVERFLOW_DATE,
  time: '09:00',
  status: 'Approved',
  timestamp: OVERFLOW_DATE + 'T09:00:00+03:00',
  duration: 90,
}

async function setupMocks(page, mockBookings) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = (d) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    switch (body.action) {
      case 'listBookings':    return ok(mockBookings)
      case 'adminGetSlots':   return ok({ success: true, slots: [] })
      case 'adminGetClients': return ok({ success: true, clients: [] })
      case 'getSmsLog':       return ok({ success: true, logs: [] })
      case 'getSystemInfo':   return ok({ success: true, reminderLastRun: null })
      default:                return ok({ success: true })
    }
  })
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const body = request.url().endsWith('/list-bookings') ? mockBookings : { success: true }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

async function loginAndWait(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
}

// ─── 1–2. Bug 1 regression: config.js syntax safety ──────────────────────────

test.describe('Bug 1 regression — config.js syntax safety', () => {
  test('admin.html loads without JS errors (no stray chars in config.js)', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page, makeBookings())
    await page.goto('/admin.html')
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })

    expect(jsErrors, 'JS errors on load: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('crash banner is hidden on clean load', async ({ page }) => {
    await setupMocks(page, makeBookings())
    await page.goto('/admin.html')
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('#js-crash-banner')).toBeHidden()
  })
})

// ─── 3–4. Bug 2 regression: dot indicators on calendar cells ─────────────────

test.describe('Bug 2 regression — dot indicators rendered only on current-month cells', () => {
  const BOOKINGS_WITH_OVERFLOW = makeBookings([OVERFLOW_BOOKING])

  test.beforeEach(async ({ page }) => {
    await setupMocks(page, BOOKINGS_WITH_OVERFLOW)
    await page.goto('/admin.html')
    await loginAndWait(page)
  })

  test('other-month overflow cell with Approved booking has NO status indicator', async ({ page }) => {
    const overflowCell = page.locator(`[data-date="${OVERFLOW_DATE}"]`)
    await expect(overflowCell).toBeVisible()
    // Confirm the cell is genuinely other-month (validates our fixture)
    await expect(overflowCell).toHaveClass(/other-month/)
    // Bug 2 fix: status tint + count pill must NOT render for other-month cells
    await expect(overflowCell).not.toHaveClass(/has-approved|has-pending|has-free/)
    const pillCount = await overflowCell.locator('.cal-count').count()
    expect(pillCount, `other-month cell [${OVERFLOW_DATE}] must have 0 status pills`).toBe(0)
  })

  test('current-month cell with Approved booking DOES show a status indicator', async ({ page }) => {
    const todayCell = page.locator(`[data-date="${TODAY}"]`)
    await expect(todayCell).toBeVisible()
    // Today must NOT be an other-month cell
    const cls = await todayCell.evaluate(el => el.className)
    expect(cls, 'today cell must not be other-month').not.toMatch(/other-month/)
    // Approved booking → green tint class + a count pill
    await expect(todayCell).toHaveClass(/has-approved/)
    const pillCount = await todayCell.locator('.cal-count').count()
    expect(pillCount, `current-month cell [${TODAY}] must show a status pill`).toBeGreaterThan(0)
  })
})

// ─── 5–6. Bug 2 regression: click behaviour ──────────────────────────────────

test.describe('Bug 2 regression — calendar cell click routing', () => {
  test('clicking a current-month Approved-booking cell opens the day sheet', async ({ page }) => {
    await setupMocks(page, makeBookings())
    await page.goto('/admin.html')
    await loginAndWait(page)

    await page.locator(`[data-date="${TODAY}"]`).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('#js-sheet-content')).toContainText('לקוחה אישור')
    await expect(page.locator('#js-sheet-title')).toContainText('יום')
  })

  test('other-month cell does not open the sheet even when force-clicked', async ({ page }) => {
    // force: true bypasses pointer-events: none to reach the element's JS handler.
    // Since no click listener is attached to other-month cells, the sheet stays hidden.
    await setupMocks(page, makeBookings([OVERFLOW_BOOKING]))
    await page.goto('/admin.html')
    await loginAndWait(page)

    const overflowCell = page.locator(`[data-date="${OVERFLOW_DATE}"]`)
    await expect(overflowCell).toHaveClass(/other-month/)
    await overflowCell.click({ force: true })
    // Sheet must remain hidden — no handler was attached
    await expect(page.locator('#js-sheet')).toBeHidden()
  })
})

// ─── 7. Zero-error gate during click + close cycle ───────────────────────────

test('no JS errors during approved-booking click → sheet close cycle', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  await setupMocks(page, makeBookings([OVERFLOW_BOOKING]))
  await page.goto('/admin.html')
  await loginAndWait(page)

  // Open sheet by clicking today's cell
  await page.locator(`[data-date="${TODAY}"]`).click()
  await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })

  // Close with Escape
  await page.keyboard.press('Escape')
  await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})
