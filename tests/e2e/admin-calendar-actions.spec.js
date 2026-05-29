/**
 * tests/e2e/admin-calendar-actions.spec.js
 * Admin Calendar — action buttons in the day sheet (v1.4.0)
 *
 * Strategy:
 *   Mock list-bookings with bookings for TODAY so calendar dots render and
 *   cells are clickable.  Click the calendar cell → sheet opens → interact
 *   with action buttons.  All network calls are intercepted; no real API
 *   traffic is made.
 *
 * Coverage:
 *   Action buttons per status
 *   1.  Pending booking shows אשר and דחה buttons
 *   2.  Approved booking shows only בטל הזמנה
 *   3.  Rejected booking shows no action buttons
 *   4.  Cancelled booking shows no action buttons
 *
 *   Approve flow
 *   5.  Clicking אשר fires toast containing "אושרה"
 *   6.  Clicking אשר dispatches sheet:action with action=approve and correct id
 *   7.  Clicking undo cancels the API call and hides the toast
 *
 *   Reject flow
 *   8.  Clicking דחה fires toast containing "נדחתה"
 *   9.  Clicking דחה dispatches sheet:action with action=reject
 *
 *   Cancel flow
 *   10. Clicking בטל הזמנה fires toast containing "בוטלה"
 *   11. Clicking בטל הזמנה dispatches sheet:action with action=cancel
 *
 *   Sheet re-opens after commit
 *   12. After undo TTL expires the sheet re-opens with the updated status badge
 *
 *   Optimistic dot update
 *   13. Calendar dot turns green immediately after approve click (no API wait)
 *   14. Undo reverts the dot back to amber immediately
 *
 *   Inline slot picker (footer)
 *   15. Sheet footer shows a time <select> and the "+ הוסף" button
 *   16. Time select options start at 08:00 and end at 20:00
 *   17. Clicking "+ הוסף" calls admin-slots addSlot with the correct date and time
 *   18. Successful add-slot shows a confirmation toast
 *
 *   Peek-strip button
 *   19. #js-cal-peek-add is hidden before any day click
 *   20. Clicking a calendar day unhides #js-cal-peek-add
 *   21. Clicking #js-cal-peek-add opens the sheet when it is closed
 *
 *   Zero-error gate
 *   22. No JS errors during full approve → undo cycle
 *   23. No JS errors during inline add-slot flow
 */
import { test, expect } from '@playwright/test'

// ─── Constants ────────────────────────────────────────────────────────────────

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'
const TODAY        = new Date().toISOString().slice(0, 10)

// ─── Booking fixtures ─────────────────────────────────────────────────────────

const PENDING_BOOKING = {
  id: 'cal-action-pending-1',
  name: 'רינת ממתינה',
  phone: '0501111111',
  service: 'gel_classic',
  serviceName: "לק ג'ל קלאסי",
  date: TODAY,
  time: '10:00',
  status: 'Pending',
  timestamp: TODAY + 'T10:00:00+03:00',
  duration: 90,
}

const APPROVED_BOOKING = {
  id: 'cal-action-approved-1',
  name: 'שרה מאושרת',
  phone: '0502222222',
  service: 'gel_classic',
  serviceName: "לק ג'ל קלאסי",
  date: TODAY,
  time: '11:00',
  status: 'Approved',
  timestamp: TODAY + 'T11:00:00+03:00',
  duration: 90,
}

const REJECTED_BOOKING = {
  id: 'cal-action-rejected-1',
  name: 'לאה נדחתה',
  phone: '0503333333',
  service: 'gel_classic',
  serviceName: "לק ג'ל קלאסי",
  date: TODAY,
  time: '12:00',
  status: 'Rejected',
  timestamp: TODAY + 'T12:00:00+03:00',
  duration: 90,
}

const CANCELLED_BOOKING = {
  id: 'cal-action-cancelled-1',
  name: 'מרים בוטלה',
  phone: '0504444444',
  service: 'gel_classic',
  serviceName: "לק ג'ל קלאסי",
  date: TODAY,
  time: '13:00',
  status: 'Cancelled',
  timestamp: TODAY + 'T13:00:00+03:00',
  duration: 90,
}

function makeBookings(...bs) {
  return { success: true, bookings: bs }
}

// ─── Mock infrastructure ──────────────────────────────────────────────────────

/**
 * Wire GAS and Supabase route interception.
 * `sbOverrides` maps Supabase function name → route handler fn(route, request).
 * All unmatched list-bookings calls return `defaultBookings`.
 */
async function setupMocks(page, defaultBookings, sbOverrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = d =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    switch (body.action) {
      case 'listBookings':  return ok(defaultBookings)
      case 'getSystemInfo': return ok({ success: true, reminderLastRun: null })
      default:              return ok({ success: true })
    }
  })
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const funcName = request.url().split('/').pop()
    if (sbOverrides[funcName]) return sbOverrides[funcName](route, request)
    const ok = d =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    if (funcName === 'list-bookings') return ok(defaultBookings)
    if (funcName === 'change-status') return ok({ success: true })
    if (funcName === 'admin-slots')   return ok({ success: true })
    return ok({ success: true })
  })
}

async function loginAndWait(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
}

/** Click the calendar cell for `dateStr` and wait for the sheet to appear. */
async function openSheetForDate(page, dateStr) {
  const cell = page.locator(`[data-date="${dateStr}"]`)
  await expect(cell).toBeVisible({ timeout: 3_000 })
  await cell.click()
  await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
}

/**
 * Inject a once-per-action listener for the `sheet:action` custom event.
 * Returns the captured event detail (or null if it did not fire within timeout).
 * Must be called BEFORE the action button click.
 */
async function captureSheetAction(page) {
  await page.evaluate(() => {
    window._capturedSheetAction = null
    document.addEventListener('sheet:action', (e) => {
      window._capturedSheetAction = e.detail
    }, { once: true })
  })
  return {
    async get(timeout = 2_000) {
      return page.evaluate(() =>
        new Promise((resolve, reject) => {
          if (window._capturedSheetAction) return resolve(window._capturedSheetAction)
          const id = setTimeout(() => reject(new Error('sheet:action not fired')), timeout)
          const poll = setInterval(() => {
            if (window._capturedSheetAction) {
              clearInterval(poll); clearTimeout(id)
              resolve(window._capturedSheetAction)
            }
          }, 20)
        })
      )
    },
  }
}

// ─── 1–4. Action buttons per booking status ───────────────────────────────────

test.describe('Action buttons — visibility per booking status', () => {
  test('Pending booking shows אשר and דחה buttons', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('[data-sheet-action="approve"]')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('[data-sheet-action="reject"]')).toBeVisible({ timeout: 2_000 })
  })

  test('Approved booking shows only בטל הזמנה', async ({ page }) => {
    await setupMocks(page, makeBookings(APPROVED_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('[data-sheet-action="cancel"]')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('[data-sheet-action="approve"]')).toBeHidden()
    await expect(page.locator('[data-sheet-action="reject"]')).toBeHidden()
  })

  test('Rejected booking shows no action buttons', async ({ page }) => {
    await setupMocks(page, makeBookings(REJECTED_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('#js-sheet-content')).toContainText('לאה נדחתה')
    await expect(page.locator('[data-sheet-action="approve"]')).toBeHidden()
    await expect(page.locator('[data-sheet-action="reject"]')).toBeHidden()
    await expect(page.locator('[data-sheet-action="cancel"]')).toBeHidden()
  })

  test('Cancelled booking shows no action buttons', async ({ page }) => {
    await setupMocks(page, makeBookings(CANCELLED_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('#js-sheet-content')).toContainText('מרים בוטלה')
    await expect(page.locator('[data-sheet-action="approve"]')).toBeHidden()
    await expect(page.locator('[data-sheet-action="reject"]')).toBeHidden()
    await expect(page.locator('[data-sheet-action="cancel"]')).toBeHidden()
  })
})

// ─── 5–7. Approve flow ────────────────────────────────────────────────────────

test.describe('Approve flow', () => {
  test('clicking אשר fires toast containing "אושרה"', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="approve"]').click()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('אושרה')
  })

  test('clicking אשר dispatches sheet:action with action=approve and booking id', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    const spy = await captureSheetAction(page)
    await page.locator('[data-sheet-action="approve"]').click()

    const detail = await spy.get()
    expect(detail.action).toBe('approve')
    expect(detail.id).toBe(PENDING_BOOKING.id)
  })

  test('clicking undo cancels the API call and hides the toast', async ({ page }) => {
    let apiCalled = false
    await setupMocks(page, makeBookings(PENDING_BOOKING), {
      'change-status': (route) => {
        apiCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) })
      },
    })
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="approve"]').click()
    await expect(page.locator('#js-toast-undo')).toBeVisible({ timeout: 2_000 })

    await page.locator('#js-toast-undo').click()

    await expect(page.locator('#js-toast')).toBeHidden({ timeout: 2_000 })
    expect(apiCalled).toBe(false)
  })
})

// ─── 8–9. Reject flow ─────────────────────────────────────────────────────────

test.describe('Reject flow', () => {
  test('clicking דחה fires toast containing "נדחתה"', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="reject"]').click()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('נדחתה')
  })

  test('clicking דחה dispatches sheet:action with action=reject', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    const spy = await captureSheetAction(page)
    await page.locator('[data-sheet-action="reject"]').click()

    const detail = await spy.get()
    expect(detail.action).toBe('reject')
    expect(detail.id).toBe(PENDING_BOOKING.id)
  })
})

// ─── 10–11. Cancel flow ───────────────────────────────────────────────────────

test.describe('Cancel flow', () => {
  test('clicking בטל הזמנה fires toast containing "בוטלה"', async ({ page }) => {
    await setupMocks(page, makeBookings(APPROVED_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="cancel"]').click()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('בוטלה')
  })

  test('clicking בטל הזמנה dispatches sheet:action with action=cancel', async ({ page }) => {
    await setupMocks(page, makeBookings(APPROVED_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    const spy = await captureSheetAction(page)
    await page.locator('[data-sheet-action="cancel"]').click()

    const detail = await spy.get()
    expect(detail.action).toBe('cancel')
    expect(detail.id).toBe(APPROVED_BOOKING.id)
  })
})

// ─── 12. Sheet re-opens after commit ──────────────────────────────────────────

test.describe('Sheet re-opens after commit', () => {
  test('sheet re-opens for the same date with the updated status badge after approve', async ({ page }) => {
    // list-bookings returns Approved status on the second call (triggered by load(true) in commitFn)
    let listCallCount = 0
    const updatedBookings = makeBookings({ ...PENDING_BOOKING, status: 'Approved' })

    // Install fake clock BEFORE page.goto so _undoTmr uses the fake clock
    await page.clock.install({ time: new Date() })

    await setupMocks(page, makeBookings(PENDING_BOOKING), {
      'list-bookings': (route) => {
        listCallCount++
        const resp = listCallCount <= 1 ? makeBookings(PENDING_BOOKING) : updatedBookings
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(resp) })
      },
    })

    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="approve"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })

    // Advance fake clock past the 5 s undo TTL to trigger the commitFn
    await page.clock.fastForward(5_100)

    // commitFn fires: change-status → load(true) → sheet re-opens
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 6_000 })
    await expect(page.locator('#js-sheet-content')).toContainText('מאושר', { timeout: 4_000 })
  })
})

// ─── 13–14. Optimistic dot update ─────────────────────────────────────────────

test.describe('Optimistic calendar dot update', () => {
  test('approve click immediately turns the amber dot green before any API response', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)

    // Amber dot is present before any action
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-amber-400`)).toBeVisible({ timeout: 2_000 })
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-green-500`)).toBeHidden()

    await openSheetForDate(page, TODAY)
    await page.locator('[data-sheet-action="approve"]').click()

    // Toast visible → optimistic update has already fired synchronously
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })

    // Dot is now green (optimistic update fired before API)
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-green-500`)).toBeVisible({ timeout: 1_000 })
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-amber-400`)).toBeHidden()

    // Clean up — undo to prevent the deferred API call from affecting other tests
    await page.locator('#js-toast-undo').click()
  })

  test('undo immediately reverts the dot back to amber', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="approve"]').click()
    await expect(page.locator('#js-toast-undo')).toBeVisible({ timeout: 2_000 })

    await page.locator('#js-toast-undo').click()
    await expect(page.locator('#js-toast')).toBeHidden({ timeout: 2_000 })

    // Undo callback fires: booking.status reverted, calData rebuilt, calendar re-rendered
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-amber-400`)).toBeVisible({ timeout: 1_000 })
    await expect(page.locator(`[data-date="${TODAY}"] .cal-dot.bg-green-500`)).toBeHidden()
  })
})

// ─── 15–18. Inline slot picker (footer) ───────────────────────────────────────

test.describe('Inline slot picker in sheet footer', () => {
  test('footer shows a time <select> and the "+ הוסף" button', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('#js-slot-time-select')).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('[data-sheet-action="addSlot"]')).toBeVisible({ timeout: 2_000 })
  })

  test('time select has options from 08:00 to 20:00 in half-hour steps', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await expect(page.locator('#js-slot-time-select option').first()).toHaveText('08:00')
    await expect(page.locator('#js-slot-time-select option').last()).toHaveText('20:00')

    // Half-hour step: second option should be 08:30
    await expect(page.locator('#js-slot-time-select option').nth(1)).toHaveText('08:30')
  })

  test('clicking "+ הוסף" calls admin-slots addSlot with the correct date and time', async ({ page }) => {
    let capturedBody = null
    await setupMocks(page, makeBookings(PENDING_BOOKING), {
      'admin-slots': (route, request) => {
        try { capturedBody = JSON.parse(request.postData()) } catch { /* */ }
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) })
      },
    })
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('#js-slot-time-select').selectOption('10:30')
    await page.locator('[data-sheet-action="addSlot"]').click()

    // The API call is made immediately (no undo TTL for add-slot)
    await expect.poll(() => capturedBody, { timeout: 4_000 }).not.toBeNull()
    expect(capturedBody.action).toBe('addSlot')
    expect(capturedBody.date).toBe(TODAY)
    expect(capturedBody.time).toBe('10:30')
  })

  test('successful add-slot shows a confirmation toast with "נוסף"', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING), {
      'admin-slots': (route) =>
        route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }) }),
    })
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="addSlot"]').click()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('נוסף')
  })
})

// ─── 19–21. Peek-strip button ─────────────────────────────────────────────────

test.describe('Peek-strip "הוסף שעה" button', () => {
  test('#js-cal-peek-add is hidden before any calendar day is clicked', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)

    await expect(page.locator('#js-cal-peek-add')).toBeHidden()
  })

  test('clicking a calendar day unhides #js-cal-peek-add', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)

    await page.locator(`[data-date="${TODAY}"]`).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })

    await expect(page.locator('#js-cal-peek-add')).toBeVisible({ timeout: 2_000 })
  })

  test('clicking #js-cal-peek-add opens the sheet when the sheet is closed', async ({ page }) => {
    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)

    // Click the day cell to set the peek button's data-date, then close the sheet
    await page.locator(`[data-date="${TODAY}"]`).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.keyboard.press('Escape')
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 2_000 })

    // Peek button is still visible; clicking it re-opens the sheet.
    // Use dispatchEvent to bypass Playwright's transition-stability check
    // (transition-all on the button causes the same hang as swipe-card buttons).
    await expect(page.locator('#js-cal-peek-add')).toBeVisible()
    await page.locator('#js-cal-peek-add').dispatchEvent('click')
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
  })
})

// ─── 22–23. Zero-error gate ───────────────────────────────────────────────────

test.describe('Zero-error gate', () => {
  test('no JS errors during full approve → undo cycle from the calendar', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('[data-sheet-action="approve"]').click()
    await expect(page.locator('#js-toast-undo')).toBeVisible({ timeout: 2_000 })
    await page.locator('#js-toast-undo').click()
    await expect(page.locator('#js-toast')).toBeHidden({ timeout: 2_000 })

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('no JS errors during inline add-slot flow', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page, makeBookings(PENDING_BOOKING))
    await page.goto('/admin.html')
    await loginAndWait(page)
    await openSheetForDate(page, TODAY)

    await page.locator('#js-slot-time-select').selectOption('09:00')
    await page.locator('[data-sheet-action="addSlot"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 3_000 })

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})
