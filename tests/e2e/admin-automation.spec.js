/**
 * tests/e2e/admin-automation.spec.js
 * Automation Section (clients tab) — Daily Reminders + Auto-Block Slots
 *
 * Coverage:
 *  1. "זמנים" tab removed — no nav button, no #tab-slots
 *  2. Automation section visible in clients tab
 *  3. Daily Reminders card loads last-run timestamp
 *  4. Send reminders button calls GAS and shows toast
 *  5. Auto-block toggle defaults to ON (enabled=true)
 *  6. Disabling toggle makes settings panel semi-transparent
 *  7. Save config calls GAS saveAutoBlockConfig with correct payload
 *  8. Run-now shows blocked count toast
 *  9. No JS console errors throughout
 */
import { test, expect } from '../support/test-base.js'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

const MOCK_BOOKINGS_RESP = {
  success:  true,
  bookings: [
    {
      id: 'uuid-1', name: 'לקוחה א', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-15', time: '11:00', status: 'Approved',
      timestamp: '2099-11-15T11:00:00+03:00', duration: 90,
    },
  ],
}

async function setupMocks(page, gasOverrides = {}, sbOverrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* */ }
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (gasOverrides[body.action]) return gasOverrides[body.action](route, body)
    switch (body.action) {
      case 'getSystemInfo':       return respond({ success: true, reminderLastRun: '2026-06-01' })
      case 'getAutoBlockConfig':  return respond({ success: true, enabled: true, time: 20 })
      case 'saveAutoBlockConfig': return respond({ success: true, enabled: body.enabled, time: body.time })
      case 'runAutoBlock':        return respond({ success: true, blocked: 3, date: '2026-06-02' })
      case 'sendReminders':       return respond({ success: true, sent: 1, skipped: false })
      default:                    return respond({ success: true })
    }
  })
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url  = request.url()
    const path = url.split('/functions/v1/').pop()
    if (sbOverrides[path]) return sbOverrides[path](route, request)
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === 'list-bookings') return respond(MOCK_BOOKINGS_RESP)
    if (path === 'admin-clients') return respond({ success: true, clients: [] })
    if (path === 'sms-log')       return respond({ success: true, entries: [] })
    return respond({ success: true })
  })
}

async function loginAndGoToClients(page) {
  await page.goto('/admin.html')
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await page.locator('[data-tab="clients"]').click()
  await expect(page.locator('#tab-clients')).toBeVisible({ timeout: 5_000 })
}

// ─── 1. Slots tab removed ─────────────────────────────────────────────────────
test.describe('Slots tab removed', () => {
  test('no slots nav button in DOM', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    await setupMocks(page)
    await page.goto('/admin.html')
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[data-tab="slots"]')).toHaveCount(0)
    expect(jsErrors, jsErrors.join(' | ')).toHaveLength(0)
  })

  test('tab-slots element does not exist', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await expect(page.locator('#tab-slots')).toHaveCount(0)
  })
})

// ─── 2. Automation section in clients tab ────────────────────────────────────
test.describe('Automation section', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
  })

  test('automation section card is rendered', async ({ page }) => {
    await expect(page.locator('#js-automation-section')).toBeVisible()
  })

  test('daily reminders submit button is visible', async ({ page }) => {
    await expect(page.locator('#js-reminder-submit')).toBeVisible()
  })

  test('auto-block toggle and run-now button visible (no separate save button)', async ({ page }) => {
    await expect(page.locator('#js-autoblock-toggle')).toBeVisible()
    await expect(page.locator('[data-qa="btn-autoblock-run"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-autoblock-save"]')).toHaveCount(0)
  })

  test('client list is below divider (still rendered)', async ({ page }) => {
    await expect(page.locator('#js-clients-list')).toBeVisible()
  })

  test('no JS errors when switching to clients tab', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    jsErrors.length = 0
    await page.locator('[data-tab="bookings"]').click()
    await page.locator('[data-tab="clients"]').click()
    await expect(page.locator('#tab-clients')).toBeVisible()
    expect(jsErrors, jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── 3. Reminders last-run ───────────────────────────────────────────────────
test.describe('Daily reminders last-run', () => {
  test('shows date when reminderLastRun is set', async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
    await expect(page.locator('#js-reminder-last')).toContainText('2026', { timeout: 5_000 })
  })

  test('shows "טרם נשלח" when reminderLastRun is null', async ({ page }) => {
    await setupMocks(page, {
      getSystemInfo: (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, reminderLastRun: null }),
      }),
    })
    await loginAndGoToClients(page)
    await expect(page.locator('#js-reminder-last')).toContainText('טרם נשלח', { timeout: 5_000 })
  })
})

// ─── 4. Send reminders ───────────────────────────────────────────────────────
test.describe('Send reminders', () => {
  test('button calls sendReminders and shows success toast', async ({ page }) => {
    let called = false
    await setupMocks(page, {
      sendReminders: (route, body) => {
        called = true
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, sent: 2, skipped: false }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('#js-reminder-submit').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(called).toBe(true)
  })
})

// ─── 5. Auto-block toggle ────────────────────────────────────────────────────
test.describe('Auto-block toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
  })

  test('toggle is ON by default (enabled=true from config)', async ({ page }) => {
    await expect(page.locator('#js-autoblock-toggle')).toBeChecked({ timeout: 5_000 })
  })

  test('time select defaults to 20', async ({ page }) => {
    await expect(page.locator('[data-qa="sel-autoblock-time"]')).toHaveValue('20', { timeout: 5_000 })
  })

  test('unchecking makes settings semi-transparent', async ({ page }) => {
    // sr-only checkbox is covered by the visual div — use dispatchEvent (same pattern as swipe cards)
    await page.locator('#js-autoblock-toggle').dispatchEvent('click')
    await expect(page.locator('#js-autoblock-toggle')).not.toBeChecked()
    const opacity = await page.locator('#js-autoblock-settings').evaluate(el => el.style.opacity)
    expect(parseFloat(opacity)).toBeLessThan(1)
  })
})

// ─── 6. Save config ──────────────────────────────────────────────────────────
test.describe('Save auto-block config', () => {
  test('save calls saveAutoBlockConfig with correct payload on time change', async ({ page }) => {
    const calls = []
    await setupMocks(page, {
      saveAutoBlockConfig: (route, body) => {
        calls.push(body)
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, enabled: body.enabled, time: body.time }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="sel-autoblock-time"]').selectOption('19')
    await expect(page.locator('#js-autoblock-save-indicator')).toContainText('נשמר', { timeout: 5_000 })
    expect(calls[0].time).toBe(19)
    expect(calls[0].enabled).toBe(true)
  })

  test('toggling auto-block shows inline "✓ נשמר" indicator', async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
    await page.locator('#js-autoblock-toggle').dispatchEvent('click')
    await expect(page.locator('#js-autoblock-save-indicator')).toContainText('נשמר', { timeout: 5_000 })
  })
})

// ─── 7. Run now ──────────────────────────────────────────────────────────────
test.describe('Run auto-block now', () => {
  test('run-now calls runAutoBlock and shows blocked count', async ({ page }) => {
    let called = false
    await setupMocks(page, {
      runAutoBlock: (route) => {
        called = true
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, blocked: 5, date: '2026-06-02' }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="btn-autoblock-run"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(called).toBe(true)
    await expect(page.locator('#js-toast-msg')).toContainText('5')
  })

  test('disabled auto-block shows "כבויה" toast', async ({ page }) => {
    await setupMocks(page, {
      runAutoBlock: (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, skipped: true, reason: 'disabled' }),
      }),
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="btn-autoblock-run"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('כבויה')
  })
})
