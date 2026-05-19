/**
 * tests/e2e/admin-dashboard.spec.js
 * Admin Dashboard — Load & Init Guardrails
 *
 * Motivation: a SyntaxError in admin.js caused a white screen on production
 * while backend tests returned 8 PASS.  These tests catch that class of failure
 * by exercising the real browser JS parser, not GAS mocks.
 *
 * Coverage:
 *  1. No JS errors on page load (catches SyntaxError, ReferenceError at parse time)
 *  2. Login panel visible on first load (not a white screen)
 *  3. Login flow — mock listBookings success → dashboard renders
 *  4. All 5 nav tabs present after login
 *  5. Switching to every tab does not throw a JS exception
 *  6. window.onerror banner appears for deliberate JS crash (graceful degradation)
 *
 * Rule: ALL selectors use [data-qa="..."] where available; fall back to
 *       element IDs only for elements the admin.html spec guarantees.
 */
import { test, expect } from '@playwright/test'

// ─── Mock infrastructure ──────────────────────────────────────────────────────

const GAS_GLOB    = 'https://script.google.com/macros/s/**'
const FAKE_TOKEN  = 'test-admin-token-32chars-exactly'

/** Minimal booking list response that makes login succeed. */
const MOCK_BOOKINGS = {
  success:  true,
  bookings: [
    {
      id: 'uuid-1', name: 'לקוחה א', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-01', time: '10:00', status: 'Approved',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90,
    },
  ],
}

/** Minimal slots response for the diary tab. */
const MOCK_SLOTS = {
  success: true,
  slots:   [],
}

/** Minimal clients response for the clients tab. */
const MOCK_CLIENTS = {
  success: true,
  clients: [],
}

/**
 * Wire up GAS route interception for admin.html.
 * All admin actions succeed with minimal stub data.
 */
async function setupAdminMocks(page, overrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()

    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* ignore */ }

    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

    if (overrides[body.action]) return overrides[body.action](route, body)

    switch (body.action) {
      case 'listBookings':      return respond(MOCK_BOOKINGS)
      case 'adminGetSlots':     return respond(MOCK_SLOTS)
      case 'adminGetClients':   return respond(MOCK_CLIENTS)
      case 'getSmsLog':         return respond({ success: true, logs: [] })
      case 'getSystemInfo':     return respond({ success: true, reminderLastRun: null })
      case 'getTemplate':       return respond({ success: true, template: [] })
      default:                  return respond({ success: false, error: 'not_mocked' })
    }
  })
}

/** Perform the login sequence and wait for the dashboard to appear. */
async function doLogin(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
}

// ─── 1. No JS errors on page load ────────────────────────────────────────────

test.describe('Admin dashboard — parse & load safety', () => {
  test('admin.html loads without any JS console errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page)
    await page.goto('/admin.html')

    // Give scripts time to execute
    await page.waitForLoadState('networkidle')

    expect(jsErrors, 'JS errors on load: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('login panel is visible immediately — no white screen', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page)
    await page.goto('/admin.html')

    await expect(page.locator('#js-login')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-dash')).toBeHidden()
    expect(jsErrors).toHaveLength(0)
  })
})

// ─── 2. Login flow ────────────────────────────────────────────────────────────

test.describe('Admin dashboard — login flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
  })

  test('successful login hides login panel and shows dashboard', async ({ page }) => {
    await doLogin(page)
    await expect(page.locator('#js-login')).toBeHidden()
    await expect(page.locator('#js-dash')).toBeVisible()
  })

  test('failed login (unauthorized) shows error message and stays on login', async ({ page }) => {
    await setupAdminMocks(page, {
      listBookings: (route) => route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: false, error: 'unauthorized' }),
      }),
    })
    await page.goto('/admin.html')
    await page.locator('#js-token-input').fill('wrong-token')
    await page.locator('#js-login-btn').click()

    await expect(page.locator('#js-login-err')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-dash')).toBeHidden()
  })
})

// ─── 3. Nav tabs — all 5 present and switchable ──────────────────────────────

test.describe('Admin dashboard — nav tabs', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await doLogin(page)
  })

  test('all 5 nav tabs are present', async ({ page }) => {
    for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
      await expect(
        page.locator('[data-qa="nav-tab-' + tab + '"]'),
        'nav tab "' + tab + '" missing',
      ).toBeVisible()
    }
  })

  test('switching to each tab does not throw a JS exception', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
      await page.locator('[data-qa="nav-tab-' + tab + '"]').click()
      // Brief settle — let any async init run
      await page.waitForTimeout(300)
    }

    expect(jsErrors, 'JS errors while switching tabs: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('diary tab shows date range picker controls', async ({ page }) => {
    await page.locator('[data-qa="nav-tab-diary"]').click()
    await expect(page.locator('#js-diary-from')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('#js-diary-to')).toBeVisible()
    await expect(page.locator('#js-diary-load')).toBeVisible()
  })

  test('clients tab shows search input', async ({ page }) => {
    await page.locator('[data-qa="nav-tab-clients"]').click()
    await expect(page.locator('#js-client-search')).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('#js-client-search-btn')).toBeVisible()
  })
})

// ─── 4. Graceful degradation — window.onerror banner ─────────────────────────

test.describe('Admin dashboard — graceful degradation', () => {
  test('deliberate JS error shows crash banner instead of white screen', async ({ page }) => {
    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await page.waitForLoadState('domcontentloaded')

    // Inject a deliberate runtime error after page load
    await page.evaluate(() => {
      window.onerror('Test deliberate crash', 'admin.js', 99, 1, new Error('deliberate'))
    })

    // Crash banner must appear with the error message
    const banner = page.locator('#js-crash-banner')
    await expect(banner).toBeVisible({ timeout: 3_000 })
    const text = await banner.textContent()
    expect(text).toContain('שגיאה בטעינת הדשבורד')

    // The page body must NOT be a completely empty white screen
    const bodyText = await page.locator('body').textContent()
    expect(bodyText.trim().length).toBeGreaterThan(10)
  })
})
