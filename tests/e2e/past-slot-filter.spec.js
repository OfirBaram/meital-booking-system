/**
 * tests/e2e/past-slot-filter.spec.js
 * E2E tests for past-slot filtering, auto-block toggle UI,
 * and admin unfulfilled/locked slot display.
 *
 * Coverage:
 *   Client calendar — 1-3
 *   Client slot list — 4
 *   Admin toggle UI — 5-9
 *   Admin sheet past day (unfulfilled) — 10-12
 *   Admin sheet future day (locked) — 13-15
 *   Zero-error gates — 16-17
 */
import { test, expect, localToday } from '../support/test-base.js'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

const TODAY     = localToday()
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })()
const TOMORROW  = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) })()

// Times guaranteed past at any hour (00:01-00:03 AM)
const PAST_TIMES   = ['00:01', '00:02', '00:03']
// Times guaranteed future until 23:57
const FUTURE_TIMES = ['23:57', '23:58', '23:59']

// ─── Booking page mocks ───────────────────────────────────────────────────────

async function setupBookingMocks(page, opts) {
  const todaySlots    = (opts && opts.todaySlots)    || []
  const tomorrowSlots = (opts && opts.tomorrowSlots != null) ? opts.tomorrowSlots : FUTURE_TIMES
  const TEST_SB = 'https://callmnxlcganwugxwiym.supabase.co'

  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: [
        'const APP_CONFIG = {',
        '  API_URL: "https://gas.test.mock/exec",',
        '  SUPABASE_URL: "' + TEST_SB + '",',
        '  SUPABASE_ANON_KEY: "test-anon-key",',
        '  VERSION: "2.0.0",',
        '  IS_MOCK_MODE: false',
        '};',
        'export default APP_CONFIG;',
      ].join('\n'),
    })
  )
  await page.route('https://gas.test.mock/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true}' })
  )
  await page.route('https://callmnxlcganwugxwiym.supabase.co/functions/v1/get-slots*', async (route, request) => {
    const url   = new URL(request.url())
    const year  = parseInt(url.searchParams.get('year')  || '', 10)
    const month = parseInt(url.searchParams.get('month') || '', 10)
    const slots = {}
    const pad   = n => String(n).padStart(2, '0')
    const pfx   = year + '-' + pad(month)
    if (TODAY.startsWith(pfx)    && todaySlots.length)    slots[TODAY]    = todaySlots
    if (TOMORROW.startsWith(pfx) && tomorrowSlots.length) slots[TOMORROW] = tomorrowSlots
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, slots }) })
  })
}

// Fill mandatory nail pre-screening (gel_hands).
async function fillNailScreening(page) {
  const panel = page.locator('#js-nail-screening')
  await expect(panel).toBeVisible({ timeout: 3_000 })
  await panel.locator('[data-nail-key="nail_length"]').first().click()
  await panel.locator('[data-nail-key="existing_coating"]').first().click()
  await panel.locator('[data-nail-key="extras"]').first().click()
  await panel.locator('[data-nail-key="damaged_nails"]').first().click()
}

/** Click service card + next button → wait for step-2 (calendar). */
async function goToStep2(page) {
  await page.locator('.service-card').first().click()
  await fillNailScreening(page)
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 8000 })
}

// ─── Admin page mocks ─────────────────────────────────────────────────────────

function makeAdminSlots(dateStr, entries) {
  return entries.map((e, i) => ({ id: 100 + i, date: dateStr, time: e.time, status: e.status }))
}

async function setupAdminMocks(page, opts) {
  const slotsByDate = (opts && opts.slotsByDate) || {}

  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch (_) {}
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(d) })
    if (body.action === 'getAutoBlockConfig') return ok({ success: true, enabled: true, time: 20 })
    return ok({ success: true, bookings: [] })
  })

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const funcName = request.url().split('/').pop().split('?')[0]
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(d) })
    if (funcName === 'list-bookings') return ok({ success: true, bookings: [] })
    if (funcName === 'admin-slots') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch (_) {}
      if (body.action === 'getSlots') {
        const all = []
        for (const [date, entries] of Object.entries(slotsByDate))
          all.push(...makeAdminSlots(date, entries))
        return ok({ success: true, slots: all })
      }
      return ok({ success: true })
    }
    return ok({ success: true })
  })
}

async function loginAdmin(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8000 })
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5000 })
}

/** Navigate to the "clients" tab — auto-block toggle lives there. */
async function goToClientsTab(page) {
  await page.locator('[data-tab="clients"]').click()
  // Wait for the visible label (the sr-only <input> is intentionally CSS-hidden)
  await expect(page.locator('#js-autoblock-toggle-label')).toBeVisible({ timeout: 5000 })
}

/** Click the toggle by clicking its wrapping <label> (sr-only input is not .click()-able). */
async function clickToggle(page) {
  await page.locator('label[title="הפעל/כבה חסימה אוטומטית"]').click()
}

async function openSheetForDate(page, dateStr) {
  const cell = page.locator('[data-date="' + dateStr + '"]')
  await expect(cell).toBeVisible({ timeout: 3000 })
  await cell.dispatchEvent('click')
  await expect(page.locator('#js-sheet')).toBeVisible({ timeout: 3000 })
}

async function switchToSlotsTab(page) {
  const tab = page.locator('[data-tab-target="slots"]')
  await expect(tab).toBeVisible({ timeout: 2000 })
  await tab.click()
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT CALENDAR — past slot filtering
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Client calendar — past slot filtering', () => {
  test('1. today cell is DISABLED when get-slots returns only past times', async ({ page }) => {
    await setupBookingMocks(page, { todaySlots: PAST_TIMES, tomorrowSlots: [] })
    await page.goto('/')
    await goToStep2(page)
    const cell = page.locator('[data-date="' + TODAY + '"]')
    await expect(cell).toBeVisible({ timeout: 5000 })
    await expect(cell).toHaveClass(/disabled/, { timeout: 3000 })
    await expect(cell).not.toHaveClass(/avail/)
  })

  test('2. future day cell is ENABLED when get-slots returns future times', async ({ page }) => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
    if (tomorrow.getDay() === 5 || tomorrow.getDay() === 6) { test.skip(); return }
    await setupBookingMocks(page, { todaySlots: PAST_TIMES, tomorrowSlots: FUTURE_TIMES })
    await page.goto('/')
    await goToStep2(page)
    const cell = page.locator('[data-date="' + TOMORROW + '"]')
    await expect(cell).toBeVisible({ timeout: 5000 })
    await expect(cell).toHaveClass(/avail/, { timeout: 3000 })
  })

  test('3. no JS page errors with past-only today slots', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await setupBookingMocks(page, { todaySlots: PAST_TIMES, tomorrowSlots: [] })
    await page.goto('/')
    await goToStep2(page)
    expect(errors).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT SLOT LIST — past time filtering
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Client slot list — past time filtering', () => {
  test('4. past time 00:01 is absent from slot grid for today', async ({ page }) => {
    // Give today one guaranteed-past and one possibly-future time
    await setupBookingMocks(page, { todaySlots: ['00:01', '23:58'], tomorrowSlots: [] })
    await page.goto('/')
    await goToStep2(page)
    const cell = page.locator('[data-date="' + TODAY + '"]')
    await expect(cell).toBeVisible({ timeout: 5000 })
    const isAvail = await cell.evaluate(el => el.classList.contains('avail'))
    if (!isAvail) { test.skip(); return }  // 23:58 also passed — skip gracefully
    await cell.click()
    await page.waitForSelector('#js-slots-wrap:not(.hidden)', { timeout: 3000 }).catch(() => {})
    const slots = page.locator('[data-qa="slot-btn"]')
    const count = await slots.count()
    for (let i = 0; i < count; i++) {
      expect(await slots.nth(i).getAttribute('data-time')).not.toBe('00:01')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTO-BLOCK TOGGLE UI
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Admin — auto-block toggle UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await loginAdmin(page)
    await goToClientsTab(page)
  })

  test('5. toggle label reads "פעיל" on load (default enabled)', async ({ page }) => {
    await expect(page.locator('#js-autoblock-toggle-label')).toContainText('פעיל')
  })

  test('6. clicking toggle changes label to "כבוי"', async ({ page }) => {
    await clickToggle(page)
    await expect(page.locator('#js-autoblock-toggle-label')).toContainText('כבוי', { timeout: 2000 })
  })

  test('7. status row shows "פעילה" text when enabled', async ({ page }) => {
    await expect(page.locator('#js-autoblock-status-text')).toContainText('פעיל')
  })

  test('8. status row shows "כבויה" text after toggle off', async ({ page }) => {
    await clickToggle(page)
    await expect(page.locator('#js-autoblock-status-text')).toContainText('כבוי', { timeout: 2000 })
  })

  test('9. toggling off then on restores "פעיל" label', async ({ page }) => {
    await clickToggle(page)  // off
    await clickToggle(page)  // on
    await expect(page.locator('#js-autoblock-toggle-label')).toContainText('פעיל', { timeout: 2000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN SHEET — Unfulfilled slots on past day
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Admin sheet — unfulfilled slots on past day', () => {
  test.beforeEach(async ({ page }) => {
    const slotsByDate = {}
    slotsByDate[YESTERDAY] = [
      { time: '10:00', status: 'available' },
      { time: '11:00', status: 'locked' },
    ]
    await setupAdminMocks(page, { slotsByDate })
    await page.goto('/admin.html')
    await loginAdmin(page)
  })

  test('10. past day with available+locked slots shows "לא מומש" section', async ({ page }) => {
    await openSheetForDate(page, YESTERDAY)
    await switchToSlotsTab(page)
    await expect(page.locator('#js-sheet-content')).toContainText('לא מומש', { timeout: 3000 })
  })

  test('11. unfulfilled row has a "מחק" button', async ({ page }) => {
    await openSheetForDate(page, YESTERDAY)
    await switchToSlotsTab(page)
    const del = page.locator('#js-sheet-content button').filter({ hasText: 'מחק' }).first()
    await expect(del).toBeVisible({ timeout: 3000 })
  })

  test('12. unfulfilled chip shows count 2 (1 available + 1 locked)', async ({ page }) => {
    await openSheetForDate(page, YESTERDAY)
    const chip = page.locator('#js-sheet-content .inline-flex').filter({ hasText: 'לא מומש' })
    await expect(chip).toContainText('2', { timeout: 3000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN SHEET — Locked slots on future day
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Admin sheet — locked slots on future day', () => {
  test.beforeEach(async ({ page }) => {
    const slotsByDate = {}
    slotsByDate[TOMORROW] = [
      { time: '10:00', status: 'available' },
      { time: '14:00', status: 'locked' },
      { time: '15:00', status: 'locked' },
    ]
    await setupAdminMocks(page, { slotsByDate })
    await page.goto('/admin.html')
    await loginAdmin(page)
  })

  test('13. future day with locked slots shows "חסום (אוטומטי)" section', async ({ page }) => {
    await openSheetForDate(page, TOMORROW)
    await switchToSlotsTab(page)
    await expect(page.locator('#js-sheet-content')).toContainText('חסום (אוטומטי)', { timeout: 3000 })
  })

  test('14. locked slot row has "שחרר" and "מחק" buttons', async ({ page }) => {
    await openSheetForDate(page, TOMORROW)
    await switchToSlotsTab(page)
    const content = page.locator('#js-sheet-content')
    await expect(content.locator('button').filter({ hasText: 'שחרר' }).first()).toBeVisible({ timeout: 3000 })
    await expect(content.locator('button').filter({ hasText: 'מחק' }).first()).toBeVisible({ timeout: 3000 })
  })

  test('15. "חסום" chip visible in sheet header for future day with locked slots', async ({ page }) => {
    await openSheetForDate(page, TOMORROW)
    const chip = page.locator('#js-sheet-content .inline-flex').filter({ hasText: 'חסום' })
    await expect(chip.first()).toBeVisible({ timeout: 3000 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO-ERROR GATES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Zero-error gates', () => {
  test('16. no JS page errors — booking page past-slot scenario', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await setupBookingMocks(page, { todaySlots: PAST_TIMES, tomorrowSlots: [] })
    await page.goto('/')
    await goToStep2(page)
    expect(errors).toHaveLength(0)
  })

  test('17. no JS page errors — admin toggle + sheet interaction', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const slotsByDate = {}
    slotsByDate[YESTERDAY] = [{ time: '10:00', status: 'available' }]
    await setupAdminMocks(page, { slotsByDate })
    await page.goto('/admin.html')
    await loginAdmin(page)

    await goToClientsTab(page)
    await clickToggle(page)  // off
    await clickToggle(page)  // on

    await page.locator('[data-tab="calendar"]').click()
    await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5000 })
    await openSheetForDate(page, YESTERDAY)
    await switchToSlotsTab(page)

    expect(errors).toHaveLength(0)
  })
})
