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
import { test, expect } from '../support/test-base.js'

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
    service: 'gel_hands', serviceName: "לק ג'ל לציפורניים",
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
  // Use *today* (local) — it is always a current-month, non-past cell, so the
  // add-slot footer is present (past days hide it). YM-20 could be in the past.
  const _t = new Date()
  const D_EMPTY = _t.getFullYear() + '-' + String(_t.getMonth() + 1).padStart(2, '0')
    + '-' + String(_t.getDate()).padStart(2, '0')

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

    // Open the day sheet and add a slot via the slots tab picker
    await cell(page, D_EMPTY).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.locator('[data-tab-target="slots"]').click()
    await page.locator('#js-slot-time-select').selectOption('10:00')
    await page.locator('[data-sheet-action="addSlot"]').click()

    // Sheet closes, and the day now shows the rose free tint
    await expect(page.locator('#js-sheet')).toBeHidden({ timeout: 4_000 })
    await expect(cell(page, D_EMPTY)).toHaveClass(/has-free/, { timeout: 4_000 })
  })
})

// ─── Day popup as a full control-center (v2) ──────────────────────────────────

test.describe('Calendar Clarity — day popup control-center', () => {
  const pad = n => String(n).padStart(2, '0')
  const localToday = () => {
    const t = new Date()
    return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
  }

  // Stateful router: serves bookings + a mutable slots array; supports
  // getSlots / deleteSlot / toggleSlot exactly like the Supabase function.
  async function route(page, bookings, slotsRef) {
    await page.route(GAS_GLOB, async (r, req) => {
      if (req.method() !== 'POST') return r.continue()
      let b = {}; try { b = JSON.parse(req.postData()) } catch { /* */ }
      const ok = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
      if (b.action === 'listBookings')  return ok(bookings)
      if (b.action === 'getSystemInfo') return ok({ success: true, reminderLastRun: null })
      return ok({ success: true })
    })
    await page.route(SB_FUNC_GLOB, async (r, req) => {
      const fn = req.url().split('/').pop()
      const ok = d => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
      if (fn === 'list-bookings') return ok(bookings)
      if (fn === 'admin-slots') {
        let b = {}; try { b = JSON.parse(req.postData()) } catch { /* */ }
        if (b.action === 'deleteSlot') { slotsRef.current = slotsRef.current.filter(s => s.id !== Number(b.slotId)); return ok({ success: true }) }
        if (b.action === 'toggleSlot') { slotsRef.current = slotsRef.current.map(s => s.id === Number(b.slotId) ? { ...s, status: 'locked' } : s); return ok({ success: true }) }
        if (b.action === 'getSlots')   return ok({ success: true, slots: slotsRef.current })
        return ok({ success: true })
      }
      return ok({ success: true })
    })
  }

  function bk(id, date, status, time) {
    return { id, name: 'לקוחה ' + id, phone: '0501234567', service: 'gel_hands',
      serviceName: "לק ג'ל לציפורניים", date, time, status, timestamp: date + 'T' + time + ':00+03:00', duration: 90 }
  }

  test('a past day shows booking history and NO add-slot footer', async ({ page }) => {
    const now  = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    const PREV_DAY = `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-15`
    const bookings = { success: true, bookings: [bk('past1', PREV_DAY, 'Approved', '10:00')] }

    await route(page, bookings, { current: [] })
    await page.goto('/admin.html')
    await loginAndWait(page)

    // js-cal-next steps to the PREVIOUS month (RTL); all its days are past.
    await page.locator('#js-cal-next').click()
    await expect(cell(page, PREV_DAY)).toBeVisible({ timeout: 3_000 })
    await cell(page, PREV_DAY).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })

    await expect(page.locator('#js-sheet-content')).toContainText('לקוחה past1')   // history stays
    await expect(page.locator('#js-slot-time-select')).toHaveCount(0)              // no add footer
    await expect(page.locator('[data-sheet-action="addSlot"]')).toHaveCount(0)
  })

  test('a free slot can be deleted from the popup and disappears', async ({ page }) => {
    const today = localToday()
    const slotsRef = { current: [{ id: 7, date: today, time: '10:00', status: 'available' }] }

    await route(page, { success: true, bookings: [] }, slotsRef)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await cell(page, today).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.locator('[data-tab-target="slots"]').click()
    const delBtn = page.locator('[data-sheet-action="deleteSlot"][data-slot-id="7"]')
    await expect(delBtn).toBeVisible()

    await delBtn.click()

    // Slot management keeps the popup open and refreshes; the row is gone.
    await expect(page.locator('[data-slot-id="7"]')).toHaveCount(0, { timeout: 4_000 })
    await expect(page.locator('#js-sheet')).toBeVisible()
  })

  test('a time with an existing slot is flagged "תפוס" but stays selectable', async ({ page }) => {
    const today = localToday()
    const slotsRef = { current: [{ id: 3, date: today, time: '10:00', status: 'available' }] }

    await route(page, { success: true, bookings: [] }, slotsRef)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await cell(page, today).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.locator('[data-tab-target="slots"]').click()

    const opt = page.locator('#js-slot-time-select option[value="10:00"]')
    await expect(opt).toContainText('תפוס')
    // Still selectable (taken times are not disabled — admin may add intentionally)
    await page.locator('#js-slot-time-select').selectOption('10:00')
    await expect(page.locator('#js-slot-time-select')).toHaveValue('10:00')
  })

  test('a cancelled booking shows as a history row with no action buttons', async ({ page }) => {
    const today = localToday()
    const bookings = { success: true, bookings: [bk('c1', today, 'Cancelled', '10:00')] }

    await route(page, bookings, { current: [] })
    await page.goto('/admin.html')
    await loginAndWait(page)

    await cell(page, today).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })

    const row = page.locator('[data-booking="c1"]')
    await expect(row).toContainText('בוטל')
    await expect(row.locator('[data-sheet-action]')).toHaveCount(0)
  })

  test('a free slot can be blocked and moves to the locked section', async ({ page }) => {
    const today = localToday()
    const slotsRef = { current: [{ id: 9, date: today, time: '11:00', status: 'available' }] }

    await route(page, { success: true, bookings: [] }, slotsRef)
    await page.goto('/admin.html')
    await loginAndWait(page)

    await cell(page, today).click()
    await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3_000 })
    await page.locator('[data-tab-target="slots"]').click()
    const blockBtn = page.locator('[data-sheet-action="blockSlot"][data-slot-id="9"]')
    await expect(blockBtn).toBeVisible()

    await blockBtn.click()

    // Toast confirms block; sheet re-opens on bookings tab — switch to slots tab.
    await expect(page.locator('#js-toast-msg')).toContainText('נחסם', { timeout: 3_000 })
    await expect(page.locator('#js-sheet')).toBeVisible()
    await page.locator('[data-tab-target="slots"]').click()

    // Free-section row is gone; locked-section row is now visible.
    await expect(page.locator('[data-sheet-action="blockSlot"][data-slot-id="9"]')).toHaveCount(0, { timeout: 4_000 })
    await expect(page.locator('[data-sheet-action="unblockSlot"][data-slot-id="9"]')).toBeVisible({ timeout: 4_000 })
  })
})
