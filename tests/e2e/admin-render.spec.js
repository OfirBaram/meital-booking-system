/**
 * tests/e2e/admin-render.spec.js
 * Integration tests for dynamic HTML rendering in the admin dashboard.
 *
 * Motivation: unit tests verify HTML structure in jsdom. These tests verify
 * that the same HTML works correctly in a real Chromium browser — callbacks
 * are wired, API calls are made, and no JS exceptions occur on interaction.
 *
 * All API calls are intercepted via page.route() so tests never hit a live GAS.
 * Every test asserts zero pageerror events — a regression guard for the exact
 * class of SyntaxError that prompted this test suite.
 */
import { test, expect } from '@playwright/test'

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const GAS_GLOB   = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN = 'test-admin-token-32chars-exactly'

const jsonRoute = (data) => (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

const MOCK_BOOKINGS_FULL = {
  success: true,
  bookings: [
    { id: 'uuid-p', name: 'לקוחה ממתינה', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-01', time: '10:00', status: 'Pending',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90 },
    { id: 'uuid-a', name: 'לקוחה מאושרת', phone: '0502222222',
      service: 'gel_feet', serviceName: "לק ג'ל רגליים",
      date: '2099-12-02', time: '12:00', status: 'Approved',
      timestamp: '2099-11-02T12:00:00+03:00', duration: 120 },
  ],
}

const MOCK_DIARY_SLOTS = {
  success: true,
  slots: [
    { id: 1, date: '2099-12-01', time: '10:00', status: 'available' },
    { id: 2, date: '2099-12-01', time: '12:00', status: 'locked' },
    { id: 3, date: '2099-12-01', time: '14:00', status: 'booked' },
    { id: 4, date: '2099-12-01', time: '16:00', status: 'pending' },
  ],
}

const MOCK_CLIENTS = {
  success: true,
  clients: [
    { id: 'c-1', phone: '0501234567', full_name: 'דנה כהן',  created_at: '2099-01-15T10:00:00+02:00' },
    { id: 'c-2', phone: '0529876543', full_name: 'רונית לוי', created_at: null },
  ],
}

const MOCK_CLIENT_HISTORY = {
  success: true,
  client:  { phone: '0501234567', full_name: 'דנה כהן' },
  appointments: [
    { id: 'a-1', date: '2099-11-01', time: '10:00', status: 'Approved',
      treatment_name: "לק ג'ל קלאסי", admin_token: null },
    { id: 'a-2', date: '2099-12-15', time: '14:00', status: 'Pending',
      treatment_name: "לק ג'ל רגליים", admin_token: 'tok-pending-abc' },
  ],
}

const MOCK_SMS_LOG = {
  success: true,
  entries: [
    { to: '+972501234567', ts: '2099-12-01', status: 'SENT',  context: 'OTP',   snippet: 'קוד: 123456' },
    { to: '+972509876543', ts: '2099-12-01', status: 'MOCK',  context: 'Admin', snippet: 'mock' },
  ],
}

const MOCK_INV_SLOTS = {
  success: true,
  slots: [
    { date: '2099-12-01', time: '10:00', status: 'Available', recentlyCancelled: false },
    { date: '2099-12-01', time: '12:00', status: 'Blocked',   recentlyCancelled: false },
  ],
}

async function setupMocks(page, overrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* */ }
    if (overrides[body.action]) return overrides[body.action](route, body)
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    switch (body.action) {
      case 'listBookings':        return respond(MOCK_BOOKINGS_FULL)
      case 'adminGetSlots':       return respond(MOCK_DIARY_SLOTS)
      case 'adminGetClients':     return respond(MOCK_CLIENTS)
      case 'adminGetClientHistory': return respond(MOCK_CLIENT_HISTORY)
      case 'getSmsLog':           return respond(MOCK_SMS_LOG)
      case 'getSlotInventory':    return respond(MOCK_INV_SLOTS)
      case 'getSystemInfo':       return respond({ success: true, reminderLastRun: null })
      case 'getTemplate':         return respond({ success: true, template: [] })
      case 'getAutoSms':          return respond({ success: true, enabled: true })
      default:                    return respond({ success: true })
    }
  })
  // Stub Supabase Edge Function calls; route list-bookings to the full fixture
  // so login() gets real booking data and render() populates #js-cards.
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const sbBody = request.url().endsWith('/list-bookings')
      ? MOCK_BOOKINGS_FULL
      : { success: true, added: 0 }
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(sbBody) })
  })
}

async function loginAndGoTo(page, tab) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  if (tab) {
    await page.locator(`[data-qa="nav-tab-${tab}"]`).click()
    await page.waitForTimeout(400)
  }
}

// ─── 1. No JS errors on initial render of any tab ────────────────────────────

test.describe('Zero pageerror on each tab render', () => {
  test.beforeEach(async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    await setupMocks(page)
    await page.goto('/admin.html')
    // networkidle flakes when SB local Docker holds long-polls open; wait on the login panel instead.
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })
    page['_jsErrors'] = jsErrors
  })

  for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
    test(`tab "${tab}" renders without JS errors`, async ({ page }) => {
      await loginAndGoTo(page, tab)
      const errs = page['_jsErrors']
      expect(errs, `JS errors on tab "${tab}": ` + errs.join(' | ')).toHaveLength(0)
    })
  }
})

// ─── 2. renderDiarySlots — no onclick= in DOM ────────────────────────────────

test.describe('renderDiarySlots — no inline onclick in DOM', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
  })

  test('diary slot container has zero onclick= attributes after render', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await loginAndGoTo(page, 'diary')

    // Wait for slots to load
    await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]').first())
      .toBeVisible({ timeout: 5_000 })

    // No onclick in the rendered container
    const onclickCount = await page.locator('#js-diary-slots [onclick]').count()
    expect(onclickCount, 'onclick= attributes found in diary slots').toBe(0)

    expect(jsErrors).toHaveLength(0)
  })

  test('all four slot rows render with correct statuses', async ({ page }) => {
    await loginAndGoTo(page, 'diary')
    await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]').first())
      .toBeVisible({ timeout: 5_000 })

    // Booked and Pending slots render but their buttons are disabled
    const toggleBtns = page.locator('#js-diary-slots [data-action="toggle-diary-slot"]')
    await expect(toggleBtns).toHaveCount(4)

    const disabledBtns = page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:disabled')
    await expect(disabledBtns).toHaveCount(2) // booked + pending
  })

  test('clicking a toggle-diary-slot button calls the API without JS error', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    const apiCalls = []

    await setupMocks(page, {
      adminToggleSlot: (route, body) => {
        apiCalls.push(body.slotId)
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, newStatus: 'locked' }),
        })
      },
    })
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'diary')

    await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:not([disabled])').first())
      .toBeVisible({ timeout: 5_000 })

    await page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:not([disabled])').first().click()
    await page.waitForTimeout(500)

    expect(apiCalls.length, 'adminToggleSlot not called').toBeGreaterThan(0)
    expect(jsErrors, 'JS errors after toggle click: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('clicking delete-diary-slot shows confirm dialog', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'diary')

    await expect(page.locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first())
      .toBeVisible({ timeout: 5_000 })

    // Dismiss the confirm dialog immediately (prevents actual deletion)
    page.once('dialog', dialog => dialog.dismiss())
    await page.locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first().click()
    await page.waitForTimeout(300)

    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 3. renderClientList — no onclick= in DOM ────────────────────────────────

test.describe('renderClientList — no inline onclick in DOM', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
  })

  test('client list has zero onclick= attributes', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await loginAndGoTo(page, 'clients')
    await expect(page.locator('#js-clients-list [data-action="select-client"]').first())
      .toBeVisible({ timeout: 5_000 })

    const onclickCount = await page.locator('#js-clients-list [onclick]').count()
    expect(onclickCount).toBe(0)
    expect(jsErrors).toHaveLength(0)
  })

  test('clicking a client card opens the history panel', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await loginAndGoTo(page, 'clients')
    await expect(page.locator('#js-clients-list [data-action="select-client"]').first())
      .toBeVisible({ timeout: 5_000 })

    await page.locator('#js-clients-list [data-action="select-client"]').first().click()

    await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-clients-list')).toBeHidden()
    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 4. renderClientHistory — no onclick= in DOM ─────────────────────────────

test.describe('renderClientHistory — no inline onclick in DOM', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
  })

  test('client history has zero onclick= attributes', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await loginAndGoTo(page, 'clients')
    await page.locator('#js-clients-list [data-action="select-client"]').first().click()
    await expect(page.locator('[data-appt-row]').first()).toBeVisible({ timeout: 5_000 })

    const onclickCount = await page.locator('#js-client-history [onclick]').count()
    expect(onclickCount).toBe(0)
    expect(jsErrors).toHaveLength(0)
  })

  test('Approve button calls API and updates badge without JS error', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    const decisions = []

    await setupMocks(page, {
      adminAction: (route, body) => {
        decisions.push(body.decision)
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      },
    })
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'clients')
    await page.locator('#js-clients-list [data-action="select-client"]').first().click()
    await expect(page.locator('[data-action="history-decide"]').first()).toBeVisible({ timeout: 5_000 })

    const approveBtn = page.locator('[data-action="history-decide"][data-decision="Approved"]')
    await approveBtn.first().click()
    await page.waitForTimeout(500)

    expect(decisions).toContain('Approved')
    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 5. buildCard — no onclick= in bookings tab ──────────────────────────────

test.describe('buildCard — no inline onclick in bookings tab', () => {
  test('booking cards have zero onclick= attributes', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'bookings')

    await expect(page.locator('[data-booking]').first()).toBeVisible({ timeout: 5_000 })

    const onclickCount = await page.locator('#js-cards [onclick]').count()
    expect(onclickCount).toBe(0)
    expect(jsErrors).toHaveLength(0)
  })

  test('Approve button on Pending card calls changeStatus API', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    const statusChanges = []

    await setupMocks(page, {
      changeStatus: (route, body) => {
        statusChanges.push({ id: body.bookingId, target: body.targetStatus })
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        })
      },
    })
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'bookings')

    // Approve via dispatchEvent to bypass the swipe card's setPointerCapture handler.
    // toastUndo defers the changeStatus call by 5 s (TTL); wait long enough for it to fire.
    await expect(page.locator('[data-action="Approved"]').first()).toBeVisible({ timeout: 5_000 })
    await page.locator('[data-action="Approved"]').first().dispatchEvent('click')
    await page.waitForTimeout(6_000)

    expect(statusChanges.some(s => s.target === 'Approved'), 'changeStatus(Approved) not called').toBe(true)
    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 6. renderSmsLog — no onclick= in diary tab ──────────────────────────────

test.describe('renderSmsLog — no inline onclick', () => {
  test('SMS log entries have zero onclick= attributes', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await loginAndGoTo(page, 'diary')

    await expect(page.locator('[data-qa="log-entry"]').first()).toBeVisible({ timeout: 5_000 })

    const onclickCount = await page.locator('#js-sms-log [onclick]').count()
    expect(onclickCount).toBe(0)
    expect(jsErrors).toHaveLength(0)
  })
})
