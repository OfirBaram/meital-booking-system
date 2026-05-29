/**
 * tests/e2e/admin-calendar-clarity.spec.js
 * Admin Calendar — "Clarity" at-a-glance day status (v1.5.0)
 *
 * Strategy:
 *   Mock list-bookings (Pending + Approved on distinct current-month days) and
 *   admin-slots getSlots (Available slots on chosen days). Assert the rendered
 *   month grid carries the right tint class, count pill, and free marker per
 *   day, plus the always-visible legend. No real network traffic.
 *
 * Coverage:
 *   1. Legend is visible with 3 entries
 *   2. Pending day  → cell has .has-pending + amber count pill "1"
 *   3. Approved day → cell has .has-approved + green count pill "1"
 *   4. Free-only day → cell has .has-free, no count pill
 *   5. Pending day that also has free slots shows a rose free marker
 *   6. Rejected/Cancelled bookings do NOT inflate the count pill (active-only)
 *   7. Zero JS console errors while rendering the clarity calendar
 */
import { test, expect } from '@playwright/test'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

// Use stable early-month days so they are always current-month cells in the grid.
const YM         = new Date().toISOString().slice(0, 7) // YYYY-MM
const D_PENDING  = `${YM}-02`
const D_APPROVED = `${YM}-03`
const D_FREE     = `${YM}-04`

function booking(id, date, status, time) {
  return {
    id, name: 'בדיקה ' + id, phone: '0501234567',
    service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
    date, time, status, timestamp: date + 'T' + time + ':00+03:00', duration: 90,
  }
}

const BOOKINGS = {
  success: true,
  bookings: [
    booking('clr-pending', D_PENDING, 'Pending', '10:00'),
    // Terminal bookings on the pending day — must NOT inflate the count pill
    booking('clr-rejected', D_PENDING, 'Rejected', '11:00'),
    booking('clr-cancelled', D_PENDING, 'Cancelled', '12:00'),
    booking('clr-approved', D_APPROVED, 'Approved', '09:00'),
  ],
}

// admin-slots getSlots → available slots on the pending day (so it ALSO shows a
// free marker) and on the free-only day.
// NOTE: status is LOWERCASE 'available' — this is exactly what Supabase returns.
// (A capitalized 'Available' here once masked a real bug where the rose
// indicator never appeared in production.)
const SLOTS = {
  success: true,
  slots: [
    { date: D_PENDING, time: '14:00', status: 'available' },
    { date: D_FREE,    time: '15:00', status: 'available' },
    { date: D_FREE,    time: '15:30', status: 'available' },
  ],
}

async function setupMocks(page) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    switch (body.action) {
      case 'listBookings':  return ok(BOOKINGS)
      case 'getSystemInfo': return ok({ success: true, reminderLastRun: null })
      default:              return ok({ success: true })
    }
  })
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const funcName = request.url().split('/').pop()
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    if (funcName === 'list-bookings') return ok(BOOKINGS)
    if (funcName === 'admin-slots') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
      if (body.action === 'getSlots') return ok(SLOTS)
      return ok({ success: true })
    }
    return ok({ success: true })
  })
}

async function loginAndWait(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
}

const cell = (page, date) => page.locator(`#js-cal-grid [data-date="${date}"]`)

test.describe('Calendar Clarity — day status indicators', () => {
  test('legend is visible with three status entries', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    const legend = page.locator('#js-cal-legend')
    await expect(legend).toBeVisible()
    await expect(legend.locator('span')).toHaveCount(3)
    await expect(legend).toContainText('ממתין לאישור')
    await expect(legend).toContainText('מאושר')
    await expect(legend).toContainText('זמן פנוי')
  })

  test('pending day has amber tint class and a "1" pending count pill', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    const c = cell(page, D_PENDING)
    await expect(c).toHaveClass(/has-pending/)
    const pill = c.locator('.cal-count.cal-count-pending')
    await expect(pill).toBeVisible()
    await expect(pill).toHaveText('1')          // active-only: 1 Pending (not the Rejected/Cancelled)
  })

  test('approved day has green tint class and a "1" approved count pill', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    const c = cell(page, D_APPROVED)
    await expect(c).toHaveClass(/has-approved/)
    await expect(c.locator('.cal-count.cal-count-approved')).toHaveText('1')
    await expect(c.locator('.cal-count-pending')).toHaveCount(0)
  })

  test('free-only day has rose tint class and no count pill', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    const c = cell(page, D_FREE)
    await expect(c).toHaveClass(/has-free/)
    await expect(c.locator('.cal-count')).toHaveCount(0)
  })

  test('pending day that also has free slots shows a rose free marker', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    const c = cell(page, D_PENDING)
    await expect(c.locator('.cal-free-dot')).toHaveCount(1)
  })

  test('no JS console errors while rendering the clarity calendar', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)
    await expect(cell(page, D_PENDING)).toHaveClass(/has-pending/)

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── Add-slot flow — sheet closes + free indicator appears (live regression) ──
// Reproduces the live bug: adding a slot left the sheet open and the day never
// showed "זמן פנוי" because the slot status from Supabase is lowercase.

test.describe('Calendar Clarity — add-slot updates the calendar', () => {
  const D_EMPTY = `${YM}-20` // a current-month day with no bookings or slots

  async function setupAddSlotMocks(page) {
    const added = [] // slots the admin adds during the test (lowercase status)
    const NONE = { success: true, bookings: [] }

    await page.route(GAS_GLOB, async (route, request) => {
      if (request.method() !== 'POST') return route.continue()
      let b = {}; try { b = JSON.parse(request.postData()) } catch { /* */ }
      const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
      if (b.action === 'listBookings')  return ok(NONE)
      if (b.action === 'getSystemInfo') return ok({ success: true, reminderLastRun: null })
      return ok({ success: true })
    })
    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const fn = request.url().split('/').pop()
      const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
      if (fn === 'list-bookings') return ok(NONE)
      if (fn === 'admin-slots') {
        let b = {}; try { b = JSON.parse(request.postData()) } catch { /* */ }
        if (b.action === 'addSlot') {
          added.push({ date: b.date, time: b.time, status: 'available' }) // mirror Supabase casing
          return ok({ success: true, slot: { id: 1, date: b.date, time: b.time, status: 'available' } })
        }
        if (b.action === 'getSlots') return ok({ success: true, slots: added })
        return ok({ success: true })
      }
      return ok({ success: true })
    })
  }

  test('adding a slot closes the sheet and shows the rose free indicator on that day', async ({ page }) => {
    await setupAddSlotMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)

    // Empty day → no tint before adding
    await expect(cell(page, D_EMPTY)).not.toHaveClass(/has-free/)

    // Open the day sheet and add a slot via the inline footer picker
    await cell(page, D_EMPTY).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.locator('#js-slot-time-select').selectOption('10:00')
    await page.locator('[data-sheet-action="addSlot"]').click()

    // Sheet closes, and the day now shows the rose free tint
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 4_000 })
    await expect(cell(page, D_EMPTY)).toHaveClass(/has-free/, { timeout: 4_000 })
  })
})
