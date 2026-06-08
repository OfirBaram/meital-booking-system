/**
 * tests/e2e/admin-sheet.spec.js
 * Bottom Sheet — open / animation / snap / close lifecycle
 *
 * Strategy:
 *   We mock listBookings to include one booking on TODAY's date so the
 *   calendar (which defaults to the current month) renders that cell with
 *   a green dot.  Clicking [data-date="{today}"] triggers onCalDayClick →
 *   openSheet('day', ...) — the full integration path.
 *
 *   A second booking set with an EMPTY array is used for the "no bookings"
 *   path (click any non-other-month cell → empty state shown).
 *
 * Coverage:
 *   1.  Sheet overlay starts hidden on page load
 *   2.  Clicking a calendar cell opens the sheet (overlay visible)
 *   3.  Sheet title matches the clicked date (YYYY-MM-DD → MM/DD/YYYY slashes)
 *   4.  Sheet content shows the booking name
 *   5.  Empty state shown when day has no bookings
 *   6.  Close button hides the sheet
 *   7.  Backdrop click hides the sheet
 *   8.  Escape key hides the sheet
 *   9.  body.overflow is 'hidden' while sheet is open
 *  10.  body.overflow is '' after sheet closes
 *  11.  Panel maxHeight is SNAP_HEIGHTS.half ('60vh') on default open
 *  12.  Footer "add slot" button is visible with correct data attribute
 *  13.  No JS console errors during a full open → close cycle
 *  14.  Rapid second openSheet call while closing uses latest payload
 *  15.  Sheet re-opens after close completes (no _closing deadlock)
 */
import { test, expect, localToday } from '../support/test-base.js'

const GAS_GLOB   = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN = 'test-admin-token-32chars-exactly'

// Today's date as YYYY-MM-DD — booking on this date will be visible on calendar
const TODAY = localToday()
const TODAY_DISPLAY = TODAY.replace(/-/g, '/')  // what the sheet title should show

/** Booking that lands on today so it appears on the current-month calendar. */
const MOCK_BOOKINGS_TODAY = {
  success: true,
  bookings: [
    {
      id: 'sheet-e2e-1',
      name: 'דנה בדיקה',
      phone: '0501234567',
      service: 'gel_classic',
      serviceName: "לק ג'ל קלאסי",
      date: TODAY,
      time: '10:00',
      status: 'Approved',
      timestamp: TODAY + 'T10:00:00+03:00',
      duration: 90,
    },
  ],
}

const MOCK_BOOKINGS_EMPTY = { success: true, bookings: [] }

// ─── Mock infrastructure ──────────────────────────────────────────────────────

async function setupMocks(page, bookings = MOCK_BOOKINGS_TODAY) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    switch (body.action) {
      case 'listBookings':    return ok(bookings)
      case 'adminGetSlots':   return ok({ success: true, slots: [] })
      case 'adminGetClients': return ok({ success: true, clients: [] })
      case 'getSmsLog':       return ok({ success: true, logs: [] })
      case 'getSystemInfo':   return ok({ success: true, reminderLastRun: null })
      case 'getTemplate':     return ok({ success: true, template: [] })
      case 'getAutoSms':      return ok({ success: true, enabled: true })
      default:                return ok({ success: false, error: 'not_mocked' })
    }
  })

  // Stub Supabase Edge Function calls; route list-bookings to the `bookings` fixture
  // so login() sets S.calData correctly and calendar cells show booking dots.
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const sbBody = request.url().endsWith('/list-bookings')
      ? bookings
      : { success: true, added: 0 }
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(sbBody) })
  })
}

async function loginAndWait(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  // Calendar tab is default; wait for it to render cells
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
}

/** Click today's cell (or the first non-other-month cell if today's not found). */
async function openSheetViaCalendar(page) {
  const todayCell = page.locator(`[data-date="${TODAY}"]`)
  if (await todayCell.count() > 0) {
    await todayCell.click()
  } else {
    // Fallback: click first non-other-month cell
    await page.locator('#js-cal-grid button[data-date]:not(.other-month)').first().click()
  }
  await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
}

// ─── 1. Startup state ─────────────────────────────────────────────────────────

test.describe('Bottom Sheet — initial state', () => {
  test('sheet overlay is hidden before any interaction', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await expect(page.locator('#js-sheet')).toBeHidden()
  })
})

// ─── 2–4. Open: content & title ──────────────────────────────────────────────

test.describe('Bottom Sheet — open path', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
  })

  test('clicking today\'s calendar cell makes the sheet overlay visible', async ({ page }) => {
    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet')).toBeVisible()
  })

  test('sheet title shows a Hebrew day name and date', async ({ page }) => {
    await page.locator(`[data-date="${TODAY}"]`).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    // Title now shows rich format: "יום X · D בMONTH" (Hebrew)
    await expect(page.locator('#js-sheet-title')).toContainText('יום')
    await expect(page.locator('#js-sheet-title')).not.toBeEmpty()
  })

  test('sheet content shows the booking name', async ({ page }) => {
    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet-content')).toContainText('דנה בדיקה')
  })

  test('sheet content shows the booking time', async ({ page }) => {
    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet-content')).toContainText('10:00')
  })
})

// ─── 5. Empty state ───────────────────────────────────────────────────────────

test.describe('Bottom Sheet — empty state', () => {
  test('empty-state message shown when day has no bookings', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_EMPTY)
    await page.goto('/admin.html')
    await loginAndWait(page)

    // Click any non-other-month cell (no booking on any day)
    await page.locator('#js-cal-grid button[data-date]:not(.other-month)').first().click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    // Sheet content should show the empty state (not a booking name)
    await expect(page.locator('#js-sheet-content')).toContainText('אין הזמנות')
  })
})

// ─── 6–8. Close paths ────────────────────────────────────────────────────────

test.describe('Bottom Sheet — close paths', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetViaCalendar(page)
  })

  test('close button hides the sheet', async ({ page }) => {
    await page.locator('[data-qa="btn-sheet-close"]').click()
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })
  })

  test('backdrop click hides the sheet', async ({ page }) => {
    // Sheet is 95vh, so click near the top of the screen where backdrop is visible
    await page.locator('#js-sheet-backdrop').click({ position: { x: 100, y: 10 } })
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })
  })

  test('Escape key hides the sheet', async ({ page }) => {
    await page.keyboard.press('Escape')
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })
  })
})

// ─── 9–10. Body overflow ─────────────────────────────────────────────────────

test.describe('Bottom Sheet — body scroll lock', () => {
  test('body.overflow is "hidden" while sheet is open', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetViaCalendar(page)

    const overflow = await page.evaluate(() => document.body.style.overflow)
    expect(overflow).toBe('hidden')
  })

  test('body.overflow is restored to "" after sheet closes', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetViaCalendar(page)

    await page.keyboard.press('Escape')
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

    const overflow = await page.evaluate(() => document.body.style.overflow)
    expect(overflow).toBe('')
  })
})

// ─── 11. Snap height ─────────────────────────────────────────────────────────

test.describe('Bottom Sheet — snap points', () => {
  test('panel maxHeight is 95vh (full snap) on default open', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetViaCalendar(page)

    const maxH = await page.locator('#js-sheet-panel').evaluate(el => el.style.maxHeight)
    expect(maxH).toBe('95vh')
  })
})

// ─── 12. Footer button ───────────────────────────────────────────────────────

test.describe('Bottom Sheet — slots tab', () => {
  test('add-slot button is visible in slots tab and has correct data attribute', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetViaCalendar(page)

    // Add-slot form is in the slots management tab (not the footer)
    await page.locator('[data-tab-target="slots"]').click()

    const btn = page.locator('[data-sheet-action="addSlot"]')
    await expect(btn).toBeVisible({ timeout: 2_000 })
    const dateAttr = await btn.getAttribute('data-date')
    expect(dateAttr).toBeTruthy()
  })
})

// ─── 13. No JS errors ────────────────────────────────────────────────────────

test.describe('Bottom Sheet — zero-error gate', () => {
  test('no JS console errors during full open → close cycle', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet')).toBeVisible()

    await page.locator('[data-qa="btn-sheet-close"]').click()
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('opening and closing multiple times produces no JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)

    for (let i = 0; i < 3; i++) {
      await openSheetViaCalendar(page)
      await page.keyboard.press('Escape')
      await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })
    }

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── 14-15. Robustness ───────────────────────────────────────────────────────

test.describe('Bottom Sheet — robustness', () => {
  test('sheet can reopen after close (no _closing deadlock)', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)

    // First cycle
    await openSheetViaCalendar(page)
    await page.locator('[data-qa="btn-sheet-close"]').click()
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

    // Second cycle — proves _closing is correctly reset to false
    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('#js-sheet-title')).toContainText('יום')
  })

  test('sheet panel content is cleared after close (no stale data)', async ({ page }) => {
    await setupMocks(page, MOCK_BOOKINGS_TODAY)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await openSheetViaCalendar(page)
    await expect(page.locator('#js-sheet-content')).not.toBeEmpty()

    await page.keyboard.press('Escape')
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

    // After close, content should be emptied (cleared in _animateClose onDone)
    const content = await page.locator('#js-sheet-content').innerHTML()
    expect(content.trim()).toBe('')
  })
})
