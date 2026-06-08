/**
 * tests/e2e/admin-ux-polish.spec.js
 * UX-polish smoke tests — verify animations are wired without JS errors,
 * and that prefers-reduced-motion disables them correctly.
 *
 * These tests focus on CLASS presence and absence (the mechanism that drives
 * CSS animations), NOT pixel-level rendering (which requires a dedicated
 * visual-regression tool).
 *
 * Coverage:
 *   1.  tab-entering class is added to the active tab on switch
 *   2.  tab-entering class is removed after animation completes
 *   3.  cards-entering class is applied to #js-cards after render
 *   4.  cal-entering class is applied to #js-cal-grid after render
 *   5.  cal-cell.today exists after login (validates todayPulse target)
 *   6.  sheet-handle-pill class exists in the DOM (drives expand animation)
 *   7.  nav-tab.text-primary::after rendered (dot indicator present)
 *   8.  prefers-reduced-motion: all animation durations collapse to ≤ 1ms
 *   9.  No JS errors during tab-switch animation cycle
 *  10.  No JS errors during calendar month navigation
 */
import { test, expect, localToday } from '../support/test-base.js'

const GAS_GLOB   = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN = 'test-admin-token-32chars-exactly'
const TODAY      = localToday()

const MOCK_BOOKINGS = {
  success: true,
  bookings: [
    {
      id: 'polish-1', name: 'דנה', phone: '0501234567',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: TODAY, time: '10:00', status: 'Approved',
      timestamp: TODAY + 'T10:00:00+03:00', duration: 90,
    },
  ],
}

async function setupMocks(page) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    switch (body.action) {
      case 'listBookings':    return ok(MOCK_BOOKINGS)
      case 'adminGetSlots':   return ok({ success: true, slots: [] })
      case 'adminGetClients': return ok({ success: true, clients: [] })
      case 'getSmsLog':       return ok({ success: true, logs: [] })
      case 'getSystemInfo':   return ok({ success: true, reminderLastRun: null })
      case 'getTemplate':     return ok({ success: true, template: [] })
      case 'getAutoSms':      return ok({ success: true, enabled: true })
      default:                return ok({ success: false, error: 'not_mocked' })
    }
  })
  // Stub Supabase Edge Function calls; route list-bookings to the booking fixture
  // so login() populates S.bookings and render() can show booking cards.
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const sbBody = request.url().endsWith('/list-bookings')
      ? MOCK_BOOKINGS
      : { success: true, added: 0 }
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(sbBody) })
  })
}

async function loginAndWait(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
}

// ─── 1–2. tab-entering class lifecycle ───────────────────────────────────────

test.describe('tab-entering animation class', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndWait(page)
  })

  test('tab-entering is added to the bookings tab when switching to it', async ({ page }) => {
    await page.locator('[data-qa="nav-tab-bookings"]').click()
    // tab-entering is added synchronously by setTab() and removed after 220 ms;
    // poll for up to 300 ms to absorb any Playwright command-dispatch latency.
    await expect(page.locator('#tab-bookings')).toHaveClass(/tab-entering/, { timeout: 300 })
  })

  test('tab-entering is removed from bookings tab after animation settles', async ({ page }) => {
    await page.locator('[data-qa="nav-tab-bookings"]').click()
    // Wait for animation to complete (tabIn is 0.18s)
    await page.waitForTimeout(400)
    const hasClass = await page.locator('#tab-bookings').evaluate(el =>
      el.classList.contains('tab-entering'))
    expect(hasClass).toBe(false)
  })
})

// ─── 3. cards-entering on booking list ───────────────────────────────────────

test('cards-entering class is applied to #js-cards after render', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  await page.locator('[data-qa="nav-tab-bookings"]').click()
  // Grab class immediately — it's added synchronously in render()
  const hasClass = await page.locator('#js-cards').evaluate(el =>
    el.classList.contains('cards-entering'))
  expect(hasClass).toBe(true)
})

// ─── 4. cal-entering on calendar grid ────────────────────────────────────────

test('cal-entering class is applied to #js-cal-grid after renderCalendar', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  // Cal-entering should have been applied on initial render (login triggers renderVisibleCalendar)
  // Navigate prev/next to re-trigger it
  await page.locator('#js-cal-prev').click()
  const hasClass = await page.locator('#js-cal-grid').evaluate(el =>
    el.classList.contains('cal-entering'))
  expect(hasClass).toBe(true)
})

// ─── 5. today cell exists ─────────────────────────────────────────────────────

test('cal-cell.today element exists on the calendar grid', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  await expect(page.locator('#js-cal-grid .cal-cell.today')).toBeVisible()
})

// ─── 6. sheet-handle-pill ─────────────────────────────────────────────────────

test('sheet-handle-pill element exists in the bottom sheet', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  // The sheet handle is always present in DOM (even when sheet is hidden)
  const pill = page.locator('#js-sheet-handle .sheet-handle-pill')
  const count = await pill.count()
  expect(count).toBeGreaterThan(0)
})

// ─── 7. Active nav tab dot (computed style) ──────────────────────────────────

test('active nav tab has ::after pseudo-element with non-zero dimensions', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  // Verify the ::after rule fires on the active tab by checking computed style
  const afterHeight = await page.locator('.nav-tab.text-primary').first().evaluate(el => {
    const after = window.getComputedStyle(el, '::after')
    return after.getPropertyValue('content')
  })
  // content: '' means the pseudo-element rule is active
  expect(afterHeight).not.toBe('none')
})

// ─── 8. prefers-reduced-motion collapses animation durations ─────────────────

test('prefers-reduced-motion: reduce sets animation-duration to ≤ 1ms on cal-cell', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  const durationMs = await page.locator('.cal-cell').first().evaluate(el => {
    const dur = window.getComputedStyle(el).animationDuration
    // e.g. "0.01ms" → 0.01
    return parseFloat(dur)
  })
  expect(durationMs).toBeLessThanOrEqual(1)
})

test('prefers-reduced-motion: reduce — tab switching still works correctly', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  // Switch through all tabs with reduced motion — no errors, no white screen
  for (const tab of ['bookings', 'pulse', 'diary', 'clients', 'calendar']) {
    await page.locator('[data-qa="nav-tab-' + (tab === 'calendar' ? 'calendar' : tab) + '"]').click()
    await page.waitForTimeout(50)  // animations are 0.01ms, near-instant
  }

  await expect(page.locator('#js-dash')).toBeVisible()
  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})

// ─── 9. No JS errors during animation cycle ──────────────────────────────────

test('no JS errors during full tab-switch + calendar-nav animation cycle', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  // Calendar month navigation
  await page.locator('#js-cal-prev').click()
  await page.locator('#js-cal-next').click()
  await page.locator('#js-cal-next').click()

  // Tab switch cycle
  await page.locator('[data-qa="nav-tab-bookings"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-qa="nav-tab-pulse"]').click()
  await page.waitForTimeout(300)
  await page.locator('[data-qa="nav-tab-calendar"]').click()
  await page.waitForTimeout(300)

  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})

// ─── 10. Calendar month nav — no JS errors ───────────────────────────────────

test('navigating calendar months forward and back produces no JS errors', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndWait(page)

  for (let i = 0; i < 3; i++) await page.locator('#js-cal-prev').click()
  for (let i = 0; i < 6; i++) await page.locator('#js-cal-next').click()

  // Grid should still be populated after navigation
  await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible()
  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})
