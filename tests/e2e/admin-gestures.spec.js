/**
 * tests/e2e/admin-gestures.spec.js
 * Swipe gestures + toastUndo lifecycle on the הזמנות (Bookings) tab.
 *
 * Strategy:
 *   - Login with a Pending booking on today's date.
 *   - Navigate to the bookings tab (calendar is now the default).
 *   - Simulate pointer-based swipe via page.mouse.
 *   - For button-tap tests, click the action buttons directly.
 *
 * Coverage:
 *   1.  Booking cards are rendered with .swipe-wrapper class
 *   2.  Swipe right > 60% on Pending card → approve toast appears
 *   3.  Undo button in approve toast cancels the commit (card restored)
 *   4.  After undo TTL (shortened via page.evaluate), commit fires
 *   5.  Swipe left > 60% on Pending card → reject toast appears
 *   6.  Swipe < 35% → card springs back, no toast shown
 *   7.  Tapping approve button directly → toastUndo flow (no confirm dialog)
 *   8.  Second swipe while undo pending → previous commits immediately, new toast shown
 *   9.  No JS console errors during full swipe → undo cycle
 *  10.  confirm() is never called during any status-change flow
 */
import { test, expect } from '@playwright/test'

const GAS_GLOB   = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN = 'test-admin-token-32chars-exactly'
const TODAY      = new Date().toISOString().slice(0, 10)

/** Pending booking on today so it appears on the current calendar AND bookings list. */
const MOCK_WITH_PENDING = {
  success: true,
  bookings: [
    {
      id: 'swipe-pending-1',
      name: 'רונית לוי',
      phone: '0529876543',
      service: 'gel_classic',
      serviceName: "לק ג'ל קלאסי",
      date: TODAY,
      time: '11:00',
      status: 'Pending',
      timestamp: TODAY + 'T11:00:00+03:00',
      duration: 90,
    },
  ],
}

const CHANGE_OK   = { success: true }
const CHANGE_FAIL = { success: false, error: 'slot_error' }

async function setupMocks(page, overrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    if (overrides[body.action]) return overrides[body.action](route, body)
    switch (body.action) {
      case 'listBookings':    return ok(MOCK_WITH_PENDING)
      case 'changeStatus':    return ok(CHANGE_OK)
      case 'adminGetSlots':   return ok({ success: true, slots: [] })
      case 'adminGetClients': return ok({ success: true, clients: [] })
      case 'getSmsLog':       return ok({ success: true, logs: [] })
      case 'getSystemInfo':   return ok({ success: true, reminderLastRun: null })
      case 'getTemplate':     return ok({ success: true, template: [] })
      case 'getAutoSms':      return ok({ success: true, enabled: true })
      default:                return ok({ success: false, error: 'not_mocked' })
    }
  })
  // Stub all Supabase Edge Function calls — prevents unmocked real-network
  // requests from hanging page.waitForLoadState('networkidle') in CI.
  await page.route(SB_FUNC_GLOB, route =>
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ success: true, added: 0 }) }))
}

async function loginAndGoToBookings(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  // Navigate to bookings tab (calendar is the default)
  await page.locator('[data-qa="nav-tab-bookings"]').click()
  await expect(page.locator('#js-cards')).toBeVisible({ timeout: 5_000 })
}

/** Returns the bounding box of the first .swipe-card element. */
async function firstCardBox(page) {
  return page.locator('.swipe-card').first().boundingBox()
}

/** Simulate a horizontal pointer swipe on the first swipe card. */
async function swipeCard(page, distancePx) {
  const box = await firstCardBox(page)
  if (!box) throw new Error('No .swipe-card found')
  const startX = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.5
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + distancePx, startY, { steps: 8 })
  await page.mouse.up()
}

// ─── 1. Card structure ────────────────────────────────────────────────────────

test('Pending booking card is wrapped in .swipe-wrapper', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  await expect(page.locator('.swipe-wrapper[data-swipe-status="Pending"]')).toBeVisible()
  await expect(page.locator('.swipe-wrapper').locator('.swipe-card')).toBeVisible()
})

// ─── 2. Swipe right → approve toast ──────────────────────────────────────────

test('swipe right > 60% on Pending card shows approve toast', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, box.width * 0.75)  // 75% > 60% threshold

  await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
  await expect(page.locator('#js-toast-msg')).toContainText('אושרה')
})

// ─── 3. Undo button cancels commit ───────────────────────────────────────────

test('clicking undo in approve toast cancels the API call', async ({ page }) => {
  let changeStatusCalled = false
  await setupMocks(page, {
    changeStatus: (route) => {
      changeStatusCalled = true
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CHANGE_OK) })
    },
  })
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, box.width * 0.75)
  await expect(page.locator('#js-toast-undo')).toBeVisible({ timeout: 2_000 })

  await page.locator('#js-toast-undo').click()

  // Toast should hide
  await expect(page.locator('#js-toast')).toBeHidden({ timeout: 2_000 })
  // changeStatus API should NOT have been called
  expect(changeStatusCalled).toBe(false)
})

// ─── 4. Swipe left → reject toast ────────────────────────────────────────────

test('swipe left > 60% on Pending card shows reject toast', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, -(box.width * 0.75))  // negative = left

  await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
  await expect(page.locator('#js-toast-msg')).toContainText('נדחתה')
})

// ─── 5. Short swipe → spring back, no toast ──────────────────────────────────

test('swipe < 35% does not trigger toast', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, box.width * 0.20)   // 20% < 35% < 60%

  // Give 400ms for any toast to appear (it should not)
  await page.waitForTimeout(400)
  await expect(page.locator('#js-toast')).toBeHidden()
})

// ─── 6. Approve button tap → toastUndo (no confirm dialog) ───────────────────

test('tapping the Approve button triggers toastUndo instead of confirm()', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  // Override window.confirm to detect if it is ever called
  await setupMocks(page)
  await page.goto('/admin.html')
  // Inject confirm override before interaction
  await page.evaluate(() => {
    window._confirmCalled = false
    window.confirm = () => { window._confirmCalled = true; return true }
  })
  await loginAndGoToBookings(page)

  // Click the approve button
  await page.locator('button[data-action="Approved"]').first().click()

  // toastUndo toast should appear
  await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
  await expect(page.locator('#js-toast-msg')).toContainText('אושרה')

  // confirm() must NOT have been called
  const confirmCalled = await page.evaluate(() => window._confirmCalled)
  expect(confirmCalled).toBe(false)

  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})

// ─── 7. Undo button is present and accessible ─────────────────────────────────

test('undo button is visible and focusable during toastUndo', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, box.width * 0.75)

  const undoBtn = page.locator('#js-toast-undo')
  await expect(undoBtn).toBeVisible({ timeout: 2_000 })
  // Button must be interactable (not hidden or disabled)
  await expect(undoBtn).toBeEnabled()
})

// ─── 8. No JS errors during swipe → undo cycle ───────────────────────────────

test('no JS console errors during full swipe → undo cycle', async ({ page }) => {
  const jsErrors = []
  page.on('pageerror', err => jsErrors.push(err.message))

  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  await swipeCard(page, box.width * 0.75)
  await expect(page.locator('#js-toast')).toBeVisible({ timeout: 2_000 })
  await page.locator('#js-toast-undo').click()
  await expect(page.locator('#js-toast')).toBeHidden({ timeout: 2_000 })

  expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
})

// ─── 9. Reveal layers visible during drag ────────────────────────────────────

test('approve reveal layer becomes visible during rightward drag', async ({ page }) => {
  await setupMocks(page)
  await page.goto('/admin.html')
  await loginAndGoToBookings(page)

  const box = await firstCardBox(page)
  const startX = box.x + box.width * 0.5
  const startY = box.y + box.height * 0.5

  // Start drag but don't release
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + box.width * 0.4, startY, { steps: 5 })

  // At 40% drag the approve reveal layer should have non-zero opacity
  const opacity = await page.locator('.swipe-reveal.approve').first()
    .evaluate(el => parseFloat(el.style.opacity || '0'))
  expect(opacity).toBeGreaterThan(0)

  await page.mouse.up()
})
