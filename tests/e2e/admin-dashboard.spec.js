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
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN  = 'test-admin-token-32chars-exactly'

/** Minimal booking list response that makes login succeed. */
const MOCK_BOOKINGS = {
  success:  true,
  bookings: [
    {
      id: 'uuid-1', name: 'לקוחה א', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-01', time: '10:00', status: 'Pending',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90,
    },
    {
      id: 'uuid-2', name: 'לקוחה ב', phone: '0502222222',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-15', time: '11:00', status: 'Approved',
      timestamp: '2099-11-15T11:00:00+03:00', duration: 90,
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
async function setupAdminMocks(page, overrides = {}, sbOverrides = {}) {
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

  // Mock Supabase Edge Function calls; sbOverrides can override any path
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const path = request.url().split('/').pop()
    if (sbOverrides[path]) return sbOverrides[path](route, request)
    const sbBody = path === 'list-bookings' ? MOCK_BOOKINGS : { success: true, added: 3 }
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(sbBody) })
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

    // networkidle flakes when SB local Docker holds long-polls open; wait on the login panel instead.
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })

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
    // login() now calls SB list-bookings, not GAS listBookings — override the SB route
    await setupAdminMocks(page, {}, {
      'list-bookings': (route) => route.fulfill({
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

// ─── 5. Client management — card render, history, error handling ─────────────
//
// Motivation: the clients tab was previously exercised only with an EMPTY
// clients array, so buildClientCard / loadClientHistory / renderClientHistory —
// the exact render path that carried the line-1076 SyntaxError — had zero
// behavioural coverage.  These tests load real client data and walk the path.

/** Two real clients so the clients tab renders actual cards. */
const MOCK_CLIENTS_FULL = {
  success: true,
  clients: [
    { id: 'c-1', phone: '0501234567', full_name: 'דנה כהן',
      created_at: '2099-01-15T10:00:00+02:00' },
    { id: 'c-2', phone: '0529876543', full_name: 'רונית לוי',
      created_at: '2099-03-20T10:00:00+03:00' },
  ],
}

/** Client history with one Approved + one Pending appointment. */
const MOCK_CLIENT_HISTORY = {
  success: true,
  client:  { phone: '0501234567', full_name: 'דנה כהן' },
  appointments: [
    { id: 'a-1', date: '2099-12-01', time: '10:00', status: 'Approved',
      treatment_name: "לק ג'ל קלאסי" },
    { id: 'a-2', date: '2099-12-15', time: '14:00', status: 'Pending',
      admin_token: 'tok-pending-abc', treatment_name: "לק ג'ל רגליים" },
  ],
}

/** Fulfil a route with a JSON body. */
const jsonRoute = (data) => (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

test.describe('Admin dashboard — client management', () => {
  test('clients tab renders client cards from real data', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page, {
      adminGetClients: jsonRoute(MOCK_CLIENTS_FULL),
    })
    await page.goto('/admin.html')
    await doLogin(page)

    await page.locator('[data-qa="nav-tab-clients"]').click()

    // #js-clients-list is guaranteed by admin.html; each client → one child div
    const cards = page.locator('#js-clients-list > div')
    await expect(cards).toHaveCount(2, { timeout: 5_000 })
    await expect(page.locator('#js-clients-list')).toContainText('דנה כהן')
    await expect(page.locator('#js-clients-list')).toContainText('רונית לוי')

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('clicking a client card opens the history panel with appointments', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page, {
      adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
      adminGetClientHistory: jsonRoute(MOCK_CLIENT_HISTORY),
    })
    await page.goto('/admin.html')
    await doLogin(page)

    await page.locator('[data-qa="nav-tab-clients"]').click()
    await page.locator('#js-clients-list > div').first().click()

    // History panel replaces the list
    await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-clients-list')).toBeHidden()

    // Header populated + both appointment rows rendered
    await expect(page.locator('#js-history-name')).toHaveText('דנה כהן')
    await expect(page.locator('[data-appt-row]')).toHaveCount(2)

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('client history error (client_not_found) shows a message, not a crash', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page, {
      adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
      adminGetClientHistory: jsonRoute({ success: false, error: 'client_not_found' }),
    })
    await page.goto('/admin.html')
    await doLogin(page)

    await page.locator('[data-qa="nav-tab-clients"]').click()
    await page.locator('#js-clients-list > div').first().click()

    // Panel still switches; the list area shows a friendly error, not a blank screen
    await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-history-list')).toContainText('שגיאה')

    // A handled error must NOT trip the crash banner or surface as a pageerror
    await expect(page.locator('#js-crash-banner')).toBeHidden()
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('regression — client flow does not break login or the 5 nav tabs', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page, {
      adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
      adminGetClientHistory: jsonRoute(MOCK_CLIENT_HISTORY),
    })
    await page.goto('/admin.html')

    // Login still works
    await doLogin(page)
    await expect(page.locator('#js-dash')).toBeVisible()

    // Walk the client-management feature end to end
    await page.locator('[data-qa="nav-tab-clients"]').click()
    await page.locator('#js-clients-list > div').first().click()
    await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })

    // All 5 nav tabs are still present and switchable afterwards
    for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
      const navTab = page.locator('[data-qa="nav-tab-' + tab + '"]')
      await expect(navTab, 'nav tab "' + tab + '" missing after client flow').toBeVisible()
      await navTab.click()
      await page.waitForTimeout(300)
    }

    expect(jsErrors, 'JS errors during regression: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})
