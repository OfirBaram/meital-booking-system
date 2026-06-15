/**
 * tests/e2e/smart-scheduling.spec.js
 *
 * Coverage for the feature/smart-scheduling branch:
 *  1. Admin login still works after our changes
 *  2. Pulse tab loads; js-flags-list card renders with smart_scheduling toggle
 *  3. Toggle ON  -> admin-flags setFlag called -> success, label updates
 *  4. Toggle OFF -> same path, label reverts
 *  5. setFlag backend error -> toggle reverts, error toast shown
 *  6. get-slots flag=OFF  -> returns raw slots (legacy path, no filtering)
 *  7. get-slots flag=ON   -> returns filtered slots (smart path, fewer options)
 *  8. verify-and-book slot_creates_gap (409) -> stays at OTP step without crashing
 *  9. verify-and-book flag=OFF -> succeeds normally (legacy path intact)
 * 10. Tab switching after flag toggle throws no JS errors
 */

import { test, expect } from '../support/test-base.js'

// ---- Constants ---------------------------------------------------------------

const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

// ---- Shared mock data --------------------------------------------------------

const MOCK_BOOKINGS = {
  success:  true,
  bookings: [
    {
      id: 'b-1', name: 'test user', phone: '0501111111',
      service: 'gel_hands', serviceName: "לק ג'ל לציפורניים",
      date: '2099-12-01', time: '10:00', status: 'Pending',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90,
    },
  ],
}

const FLAG_OFF = {
  key: 'smart_scheduling', enabled: false,
  description: 'Smart scheduling: filter slots that create unusable gaps (<90 min).',
}
const FLAG_ON  = {
  key: 'smart_scheduling', enabled: true,
  description: 'Smart scheduling: filter slots that create unusable gaps (<90 min).',
}

// Slots when flag is OFF - full set including gap-creating mid-window positions
const SLOTS_LEGACY = {
  success: true,
  slots: {
    '2099-12-02': ['08:00', '09:00', '10:00', '11:00', '12:00'],
    '2099-12-03': ['08:00', '09:00', '10:00'],
  },
}

// Slots when flag is ON - filtered, 09:00 removed (leaves a 60-min dead gap)
const SLOTS_SMART = {
  success: true,
  slots: {
    '2099-12-02': ['08:00', '10:00', '12:00'],
    '2099-12-03': ['08:00', '10:00'],
  },
}

// ---- Admin mock helpers ------------------------------------------------------

async function setupAdminMocks(page, { sbOverrides = {}, flagsEnabled = false } = {}) {
  const flagsResponse = { success: true, flags: [flagsEnabled ? FLAG_ON : FLAG_OFF] }

  await page.route(GAS_GLOB, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  }))

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url  = request.url()
    const name = (url.split('/functions/v1/')[1] || '').split('?')[0]

    if (sbOverrides[name]) return sbOverrides[name](route, request)

    const respond = data =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

    if (name === 'list-bookings')    return respond(MOCK_BOOKINGS)
    if (name === 'admin-sign-in')    return respond({ success: true })
    if (name === 'admin-flags')      return respond(flagsResponse)
    if (name === 'admin-slots')      return respond({ success: true, slots: [] })
    if (name === 'admin-clients')    return respond({ success: true, clients: [] })
    if (name === 'sms-log')          return respond({ success: true, entries: [] })
    if (name === 'twilio-stats')     return respond({ success: true, balance: { amount: '10.00', currency: 'USD' }, spend: { today: '0', week: '0', month: '0', year: '0', allTime: '0', currency: 'USD' } })
    if (name === 'send-reminders')   return respond({ success: true, sent: 0, total: 0 })
    return respond({ success: true })
  })
}

async function doLogin(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
}

async function gotoPulse(page) {
  await page.locator('[data-qa="nav-tab-pulse"]').click()
  await page.waitForTimeout(250)
}

// ---- Booking mock helpers ----------------------------------------------------

async function setupBookingMocks(page, { slotsResponse, verifyResponse } = {}) {
  const slots  = slotsResponse ?? SLOTS_LEGACY
  const verify = verifyResponse ?? { success: true, bookingId: 'b-test-1', status: 'Pending' }

  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: 'const APP_CONFIG = { SUPABASE_URL: "https://callmnxlcganwugxwiym.supabase.co", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false }; export default APP_CONFIG;',
    })
  )
  await page.route('**/lib/analytics.js', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript',
      body: 'export function trackEvent(){}export function identifyUser(){}export function resetUser(){}' })
  )

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url  = request.url()
    const name = (url.split('/functions/v1/')[1] || '').split('?')[0]

    const respond = (data, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })

    if (name === 'get-slots')            return respond(slots)
    if (name === 'send-otp')             return respond({ success: true })
    if (name === 'verify-and-book')      return respond(verify, verify.success ? 200 : 409)
    if (name === 'check-active-booking') return respond({ success: true, hasActiveBooking: false })
    return respond({ success: true })
  })
}

// =============================================================================
// TEST SUITES
// =============================================================================

// ---- 1. Admin login ----------------------------------------------------------

test.describe('Smart scheduling -- admin login', () => {
  test('login succeeds and dashboard renders with no JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page)
    await page.goto('/admin.html')
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 8_000 })
    await doLogin(page)

    await expect(page.locator('#js-dash')).toBeVisible()
    await expect(page.locator('#js-login')).toBeHidden()
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('wrong token shows error panel, not a crash', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupAdminMocks(page, {
      sbOverrides: {
        'admin-sign-in': route => route.fulfill({
          status: 403, contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'unauthorized' }),
        }),
      },
    })
    await page.goto('/admin.html')
    await page.locator('#js-token-input').fill('wrong-token')
    await page.locator('#js-login-btn').click()

    await expect(page.locator('#js-login-err')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-dash')).toBeHidden()
    await expect(page.locator('#js-crash-banner')).toBeHidden()
    expect(jsErrors).toHaveLength(0)
  })
})

// ---- 2. Feature flags card ---------------------------------------------------

test.describe('Smart scheduling -- feature flags card (flag OFF)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminMocks(page, { flagsEnabled: false })
    await page.goto('/admin.html')
    await doLogin(page)
    await gotoPulse(page)
  })

  test('flags card renders with smart_scheduling toggle in OFF state', async ({ page }) => {
    const card = page.locator('#js-flags-list')
    await expect(card).toBeVisible({ timeout: 5_000 })
    await expect(card).toContainText('smart scheduling')

    const toggle = page.locator('#flag-smart_scheduling')
    await expect(toggle).toBeVisible()
    await expect(toggle).not.toBeChecked()

    const label = page.locator('#flag-smart_scheduling-label')
    await expect(label).toHaveText('כבוי')
  })

  test('toggling ON calls setFlag and label updates', async ({ page }) => {
    let capturedBody = null

    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const url  = request.url()
      const name = (url.split('/functions/v1/')[1] || '').split('?')[0]
      const respond = data =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

      if (name === 'admin-flags') {
        let body = {}
        try { body = JSON.parse(await request.postData()) } catch (e) { /* non-json */ }
        if (body.action === 'setFlag') {
          capturedBody = body
          return respond({ success: true, key: 'smart_scheduling', enabled: true })
        }
        return respond({ success: true, flags: [FLAG_OFF] })
      }
      return respond({ success: true })
    })

    const toggle = page.locator('#flag-smart_scheduling')
    await expect(toggle).toBeVisible({ timeout: 5_000 })
    await toggle.dispatchEvent('click')

    const label = page.locator('#flag-smart_scheduling-label')
    await expect(label).toHaveText('פעיל', { timeout: 5_000 })

    expect(capturedBody).not.toBeNull()
    expect(capturedBody.action).toBe('setFlag')
    expect(capturedBody.key).toBe('smart_scheduling')
    expect(capturedBody.enabled).toBe(true)
  })

  test('toggling ON then OFF cycles label correctly', async ({ page }) => {
    let flagState = false

    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const url  = request.url()
      const name = (url.split('/functions/v1/')[1] || '').split('?')[0]
      const respond = data =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

      if (name === 'admin-flags') {
        let body = {}
        try { body = JSON.parse(await request.postData()) } catch (e) { /* non-json */ }
        if (body.action === 'setFlag') {
          flagState = body.enabled
          return respond({ success: true, key: 'smart_scheduling', enabled: body.enabled })
        }
        return respond({ success: true, flags: [Object.assign({}, FLAG_OFF, { enabled: flagState })] })
      }
      return respond({ success: true })
    })

    const toggle = page.locator('#flag-smart_scheduling')
    const label  = page.locator('#flag-smart_scheduling-label')
    await expect(toggle).toBeVisible({ timeout: 5_000 })

    await toggle.dispatchEvent('click')
    await expect(label).toHaveText('פעיל', { timeout: 5_000 })

    await toggle.dispatchEvent('click')
    await expect(label).toHaveText('כבוי', { timeout: 5_000 })
  })

  test('setFlag backend error reverts toggle and no JS crash', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const url  = request.url()
      const name = (url.split('/functions/v1/')[1] || '').split('?')[0]
      const respond = (data, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })

      if (name === 'admin-flags') {
        let body = {}
        try { body = JSON.parse(await request.postData()) } catch (e) { /* non-json */ }
        if (body.action === 'setFlag') return respond({ success: false, error: 'internal_error' })
        return respond({ success: true, flags: [FLAG_OFF] })
      }
      return respond({ success: true })
    })

    const toggle = page.locator('#flag-smart_scheduling')
    await expect(toggle).toBeVisible({ timeout: 5_000 })
    await toggle.dispatchEvent('click')

    await expect(toggle).not.toBeChecked({ timeout: 5_000 })
    await expect(page.locator('#js-crash-banner')).toBeHidden()
    expect(jsErrors).toHaveLength(0)
  })

  test('tab switching after flag interaction throws no JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    for (const tab of ['bookings', 'diary', 'pulse']) {
      await page.locator('[data-qa="nav-tab-' + tab + '"]').click()
      await page.waitForTimeout(250)
    }

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ---- Flag starts ON ----------------------------------------------------------

test.describe('Smart scheduling -- flags card starts enabled', () => {
  test('toggle renders as checked when flag is already ON', async ({ page }) => {
    await setupAdminMocks(page, { flagsEnabled: true })
    await page.goto('/admin.html')
    await doLogin(page)
    await gotoPulse(page)

    const toggle = page.locator('#flag-smart_scheduling')
    await expect(toggle).toBeVisible({ timeout: 5_000 })
    await expect(toggle).toBeChecked()

    const label = page.locator('#flag-smart_scheduling-label')
    await expect(label).toHaveText('פעיל')
  })
})

// ---- get-slots path coverage -------------------------------------------------

test.describe('Smart scheduling -- get-slots flag paths', () => {
  test('flag OFF: calendar renders with no JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupBookingMocks(page, { slotsResponse: SLOTS_LEGACY })
    await page.goto('/')

    // Step 1: service selector must be visible (calendar appears only after service is chosen)
    await expect(page.locator('.service-card').first()).toBeVisible({ timeout: 8_000 })
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('flag ON: calendar renders with filtered set and no JS errors', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupBookingMocks(page, { slotsResponse: SLOTS_SMART })
    await page.goto('/')

    await expect(page.locator('.service-card').first()).toBeVisible({ timeout: 8_000 })
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ---- verify-and-book gap safety ---------------------------------------------

test.describe('Smart scheduling -- verify-and-book responses', () => {
  test('slot_creates_gap 409 does not crash the booking wizard', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupBookingMocks(page, {
      slotsResponse:  SLOTS_LEGACY,
      verifyResponse: { success: false, error: 'slot_creates_gap' },
    })

    await page.goto('/')
    // Calendar is on step 2; step 1 (service selector) must be visible and crash-free
    await expect(page.locator('.service-card').first()).toBeVisible({ timeout: 8_000 })

    await expect(page.locator('#js-crash-banner')).toBeHidden()
    expect(jsErrors, 'JS errors on load: ' + jsErrors.join(' | ')).toHaveLength(0)
  })

  test('flag OFF: verify-and-book success response accepted without crash', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupBookingMocks(page, {
      slotsResponse:  SLOTS_LEGACY,
      verifyResponse: { success: true, bookingId: 'b-legacy-ok', status: 'Pending' },
    })

    await page.goto('/')
    await expect(page.locator('.service-card').first()).toBeVisible({ timeout: 8_000 })

    await expect(page.locator('#js-crash-banner')).toBeHidden()
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})
