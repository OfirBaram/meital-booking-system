/**
 * E2E tests for the 5-step booking wizard.
 *
 * CONFIG.API_BASE in booking.js points at the live GAS endpoint.
 * All tests intercept that URL via page.route() and return controlled
 * responses — no real network calls, no Twilio, no Sheets dependency.
 *
 * Mock contract (mirrors the real GAS API):
 *  - getSlots  → deterministic slots, Fri/Sat skipped, all other weekdays have 4 times
 *  - sendOTP   → always { success: true }
 *  - verifyAndBook → { success: true } for any OTP except '000000'
 */
import { test, expect } from '@playwright/test'

// ─── Mock infrastructure ──────────────────────────────────────────────────────

// Matches the GAS web-app URL pattern; TEST_GAS_URL is served via config.js route mock.
const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const TEST_GAS_URL = 'https://script.google.com/macros/s/TEST_MOCK_ID/exec'

// Supabase Edge Function mocks
const SB_FUNC_GLOB = 'https://supabase.test.mock/functions/v1/**'
const TEST_SB_URL  = 'https://supabase.test.mock'

/** Deterministic slots: first 4 BASE times for every non-Fri/Sat weekday >= today */
function makeMockSlots(year, month) {
  const slots = {}
  const floor  = new Date(); floor.setHours(0, 0, 0, 0)
  const days   = new Date(year, month, 0).getDate()
  const BASE   = ['09:00', '10:30', '12:00', '13:30']

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d)
    if (date < floor || date.getDay() === 5 || date.getDay() === 6) continue
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    slots[key] = BASE
  }
  return { success: true, slots }
}

/**
 * Install route interception on the page BEFORE goto('/').
 * Intercepts config.js to inject IS_MOCK_MODE:false + TEST_GAS_URL so HTTP
 * calls flow through GAS_GLOB; also mocks all GAS actions.
 */
async function setupMocks(page) {
  // Override config.js so the ES module uses IS_MOCK_MODE:false and a URL that
  // matches GAS_GLOB, enabling Playwright route interception to work correctly.
  await page.route('**/config.js', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/javascript',
      body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };
export default APP_CONFIG;
`,
    })
  )

  await page.route(GAS_GLOB, async (route, request) => {
    const method = request.method()

    if (method === 'GET') {
      const url    = new URL(request.url())
      const year   = parseInt(url.searchParams.get('year'),  10)
      const month  = parseInt(url.searchParams.get('month'), 10)
      console.log(`[mock] getSlots(${year}, ${month})`)
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(makeMockSlots(year, month)),
      })
    }

    return route.continue()
  })

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    // Strip query params before comparing — get-slots has ?year=&month=
    const path = new URL(request.url()).pathname.split('/').pop()

    if (path === 'get-slots') {
      const u     = new URL(request.url())
      const year  = parseInt(u.searchParams.get('year'),  10)
      const month = parseInt(u.searchParams.get('month'), 10)
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(makeMockSlots(year, month)),
      })
    }

    if (path === 'send-otp') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }

    if (path === 'verify-and-book') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
      const otp = body.otp ?? ''
      const ok = otp !== '000000'
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          ok
            ? { success: true, bookingId: body.booking?.id, status: 'Pending' }
            : { success: false, error: 'invalid_otp' }
        ),
      })
    }

    return route.fulfill({ status: 400, body: '{}' })
  })
}

// ─── Step helpers ─────────────────────────────────────────────────────────────

async function goToStep2(page) {
  await page.locator('.service-card').first().click()
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
}

async function goToStep3(page) {
  await goToStep2(page)
  await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  await page.locator('.cal-day.avail').first().click()
  await expect(page.locator('.time-slot').first()).toBeVisible({ timeout: 5_000 })
  await page.locator('.time-slot').first().click()
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-3')).toBeVisible({ timeout: 8_000 })
}

async function goToStep4(page) {
  await goToStep3(page)
  await page.locator('#inp-name').fill('נועה כהן')
  await page.locator('#inp-phone').fill('0501234567')
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.otp-input')).toHaveCount(6)
}

// ─── OTP helper: fill each box by DOM index (focus-independent) ───────────────
//
// keyboard.type() targets whichever element CDP currently considers focused;
// the auto-advance focus shift in the input handler races CDP on slow CI
// runners. fill() targets the element by index and is immune to that race.

async function typeOTP(page, code) {
  const inputs = page.locator('.otp-input')
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).fill(code[i])
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Step 1 — Service selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('page loads with exactly 2 service cards and a disabled Next button', async ({ page }) => {
    await expect(page.locator('#step-1')).toBeVisible()
    await expect(page.locator('.service-card')).toHaveCount(2)
    await expect(page.locator('#btn-next')).toBeDisabled()
  })

  test('selecting a service enables the Next button', async ({ page }) => {
    await page.locator('.service-card').first().click()
    await expect(page.locator('#btn-next')).toBeEnabled()
  })

  test('selecting the second service also works', async ({ page }) => {
    await page.locator('.service-card').nth(1).click()
    await expect(page.locator('#btn-next')).toBeEnabled()
  })

  test('clicking Next after a selection advances to step 2', async ({ page }) => {
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-2')).toBeVisible()
    await expect(page.locator('#step-1')).not.toBeVisible()
  })
})

test.describe('Step 2 — Date & Time', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep2(page)
  })

  test('calendar renders with at least one available day in mock mode', async ({ page }) => {
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  })

  test('Friday and Saturday cells are disabled', async ({ page }) => {
    await expect(page.locator('#js-calendar')).toBeVisible({ timeout: 8_000 })
    const totalCells = await page.locator('.cal-day').count()
    const availCells = await page.locator('.cal-day.avail').count()
    expect(availCells).toBeLessThan(totalCells)
  })

  test('Next button is disabled until both date AND slot are selected', async ({ page }) => {
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
    await page.locator('.cal-day.avail').first().click()
    await expect(page.locator('#btn-next')).toBeDisabled()
    await page.locator('.time-slot').first().click()
    await expect(page.locator('#btn-next')).toBeEnabled()
  })

  test('Back button returns to step 1', async ({ page }) => {
    await page.locator('#btn-back').click()
    await expect(page.locator('#step-1')).toBeVisible()
  })
})

test.describe('Step 3 — Personal details', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep3(page)
  })

  test('Next button is disabled until name and valid phone are filled', async ({ page }) => {
    await expect(page.locator('#btn-next')).toBeDisabled()

    await page.locator('#inp-name').fill('נועה כהן')
    await expect(page.locator('#btn-next')).toBeDisabled()

    await page.locator('#inp-phone').fill('0501234567')
    await expect(page.locator('#btn-next')).toBeEnabled()
  })

  test('a landline number keeps the Next button disabled', async ({ page }) => {
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0212345678')
    await expect(page.locator('#btn-next')).toBeDisabled()
  })

  test('a name shorter than 2 chars keeps the Next button disabled', async ({ page }) => {
    await page.locator('#inp-name').fill('נ')
    await page.locator('#inp-phone').fill('0501234567')
    await expect(page.locator('#btn-next')).toBeDisabled()
  })
})

test.describe('Step 4 — OTP verification', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep4(page)
  })

  test('renders exactly 6 OTP input boxes', async ({ page }) => {
    await expect(page.locator('.otp-input')).toHaveCount(6)
  })

  test('resend button is initially disabled with a countdown', async ({ page }) => {
    await expect(page.locator('#js-resend')).toBeDisabled()
    await expect(page.locator('#js-resend-timer')).toContainText('s')
  })

  test('correct OTP auto-submits and shows confirmation screen', async ({ page }) => {
    await typeOTP(page, '123456')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  })

  test('wrong OTP (000000) shows an error message', async ({ page }) => {
    await typeOTP(page, '000000')
    await expect(page.locator('#js-otp-error')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('#js-otp-error')).toContainText('שגוי')
  })
})

test.describe('Step 5 — Confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep4(page)
    await typeOTP(page, '246810')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  })

  test('shows booking details and a UUID booking ID', async ({ page }) => {
    await expect(page.locator('#js-confirm-details')).not.toBeEmpty()

    const idText = await page.locator('#js-confirm-id').textContent()
    expect(idText).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  test('"Book another" resets the wizard back to step 1', async ({ page }) => {
    await page.locator('#js-book-again').click()
    await expect(page.locator('#step-1')).toBeVisible()
    await expect(page.locator('.service-card.selected')).toHaveCount(0)
  })
})


// ─── Performance — instant calendar (pre-fetch) ───────────────────────────────

test.describe('Performance — slot pre-fetch on page load', () => {
  test('get-slots is called exactly once on load; step 2 uses cached data', async ({ page }) => {
    // This test was updated from GAS to Supabase architecture.
    // booking.js calls apiGetSlots which uses APP_CONFIG.SUPABASE_URL → /functions/v1/get-slots
    // The old test used API_URL (GAS) which is no longer referenced by the frontend.
    let getSlotsCalls = 0

    await page.route('**/config.js', route =>
      route.fulfill({
        status:      200,
        contentType: 'application/javascript',
        body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };
export default APP_CONFIG;
`,
      })
    )

    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const path = new URL(request.url()).pathname.split('/').pop()

      if (path === 'get-slots') {
        getSlotsCalls++
        const u     = new URL(request.url())
        const year  = parseInt(u.searchParams.get('year'),  10)
        const month = parseInt(u.searchParams.get('month'), 10)
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(makeMockSlots(year, month)),
        })
      }
      if (path === 'send-otp')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })

      return route.continue()
    })

    // Register waitForResponse BEFORE goto to avoid the race condition.
    // URL is /functions/v1/get-slots (kebab-case, not camelCase).
    const prefetchDone = page.waitForResponse(
      res => res.url().includes('get-slots') && res.status() === 200,
      { timeout: 5_000 }
    )
    await page.goto('/')
    // Wait for the ES module to initialize (service cards rendered = init() ran).
    await page.waitForSelector('.service-card')
    await prefetchDone
    const callsAfterLoad = getSlotsCalls
    expect(callsAfterLoad).toBe(1)

    // Navigate to step 2
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-2')).toBeVisible()

    // Calendar should appear without an additional get-slots call (cache hit)
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 3_000 })
    expect(getSlotsCalls).toBe(1)

    // No skeleton cells should remain after render
    await expect(page.locator('.cal-day.animate-pulse')).toHaveCount(0)
  })
})

// ─── Security — OTP send rate limiting ────────────────────────────────────────

test.describe('Security — OTP send rate limiting', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('OTP send is blocked for 30 s after first successful send', async ({ page }) => {
    await goToStep4(page) // fills form, sends OTP, lands on step 4

    // Go back to step 3
    await page.locator('#btn-back').click()
    await expect(page.locator('#step-3')).toBeVisible()

    // Try to re-send immediately — cooldown toast should appear
    await page.locator('#btn-next').click()
    await expect(page.locator('#js-toast')).toContainText('שניות', { timeout: 3_000 })

    // Still on step 3 — NOT advanced to step 4
    await expect(page.locator('#step-3')).toBeVisible()
    await expect(page.locator('#step-4')).not.toBeVisible()
  })

  test('resetApp clears the OTP cooldown', async ({ page }) => {
    await goToStep4(page)
    await typeOTP(page, '123456')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })

    // Reset wizard
    await page.locator('#js-book-again').click()
    await expect(page.locator('#step-1')).toBeVisible()

    // Go through steps again — OTP send should NOT be rate-limited
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
    await page.locator('.cal-day.avail').first().click()
    await page.locator('.time-slot').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-3')).toBeVisible()
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click()
    // Should advance to step 4 without showing cooldown toast
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('#js-toast')).not.toBeVisible()
  })
})
// ─── Performance — instant calendar on cache hit ──────────────────────────────

test.describe('Performance — instant calendar render on cache hit', () => {
  test('calendar has no skeleton cells when data is pre-fetched before step 2', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')

    // Wait for pre-fetch to complete (mocked getSlots is instant)
    await page.waitForTimeout(500)

    // Navigate to step 2
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-2')).toBeVisible()

    // With cached data, skeleton cells should never appear
    await expect(page.locator('.cal-day.animate-pulse')).toHaveCount(0)

    // Available days are rendered immediately (tight timeout — no async load)
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 500 })
  })

  test('clicking a date does not rebuild the calendar DOM (selection patch only)', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep2(page)

    // Get the count of cal-day elements before the click
    const countBefore = await page.locator('.cal-day').count()

    // Click the first available day
    await page.locator('.cal-day.avail').first().click()

    // Count should be identical — no DOM rebuild
    const countAfter = await page.locator('.cal-day').count()
    expect(countAfter).toBe(countBefore)

    // The clicked day should now have the selected class
    await expect(page.locator('.cal-day.selected')).toHaveCount(1)
  })
})

// ─── API error hardening (Phase 3.1) ─────────────────────────────────────────
//
// Verifies that HTTP errors and GAS business-logic failures surface as
// friendly Hebrew toast messages — never raw stack traces or JS exceptions.

/**
 * Like setupMocks but lets the caller inject per-action overrides.
 * overrides: { sendOTP?: fn(route), verifyAndBook?: fn(route) }
 */
async function setupMocksWithOverrides(page, overrides = {}) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/javascript',
      body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
    })
  )

  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() === 'GET') {
      const url   = new URL(request.url())
      const year  = parseInt(url.searchParams.get('year'),  10)
      const month = parseInt(url.searchParams.get('month'), 10)
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(makeMockSlots(year, month)),
      })
    }
    return route.continue()
  })

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    // Strip query params before comparing — get-slots has ?year=&month=
    const path = new URL(request.url()).pathname.split('/').pop()

    if (path === 'get-slots') {
      const u     = new URL(request.url())
      const year  = parseInt(u.searchParams.get('year'),  10)
      const month = parseInt(u.searchParams.get('month'), 10)
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(makeMockSlots(year, month)),
      })
    }

    if (path === 'send-otp' && overrides.sendOTP) return overrides.sendOTP(route)
    if (path === 'verify-and-book' && overrides.verifyAndBook) return overrides.verifyAndBook(route)

    if (path === 'send-otp')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    if (path === 'verify-and-book')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })

    return route.fulfill({ status: 400, body: '{}' })
  })
}

test.describe('API error hardening — sendOTP', () => {
  test('HTTP 500 on sendOTP shows a Hebrew connection-error toast and keeps step 3 visible', async ({ page }) => {
    await setupMocksWithOverrides(page, {
      sendOTP: route => route.fulfill({ status: 500, body: 'Internal Server Error' }),
    })
    await page.goto('/')
    await goToStep3(page)

    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click()

    // Must stay on step 3 — not advance to step 4
    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()

    // Toast must contain Hebrew text (not a raw JS error)
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    const toastText = await page.locator('#js-toast').textContent()
    expect(toastText).toMatch(/[\u0590-\u05FF]/) // at least one Hebrew character
    expect(toastText).not.toContain('HTTP 500')
    expect(toastText).not.toContain('Error')
  })

  test('GAS returns { success: false, error: rate_limited } — shows seconds-remaining toast', async ({ page }) => {
    await setupMocksWithOverrides(page, {
      sendOTP: route => route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: false, error: 'rate_limited', retryAfter: 28 }),
      }),
    })
    await page.goto('/')
    await goToStep3(page)

    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-toast')).toContainText('28', { timeout: 5_000 })
    await expect(page.locator('#js-toast')).toContainText('שניות')
  })
})

test.describe('API error hardening — verifyAndBook', () => {
  test('HTTP 500 on verifyAndBook shows a Hebrew toast and keeps step 4 visible', async ({ page }) => {
    await setupMocksWithOverrides(page, {
      verifyAndBook: route => route.fulfill({ status: 500, body: 'Internal Server Error' }),
    })
    await page.goto('/')
    await goToStep4(page)

    await typeOTP(page, '123456')

    // Must stay on step 4 — not advance to step 5
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-5')).not.toBeVisible()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    const toastText = await page.locator('#js-toast').textContent()
    expect(toastText).toMatch(/[\u0590-\u05FF]/)
    expect(toastText).not.toContain('HTTP 500')
    expect(toastText).not.toContain('Error')
  })

  test('slot_not_available error shows Hebrew slot-taken toast and sends user back to step 2', async ({ page }) => {
    await setupMocksWithOverrides(page, {
      verifyAndBook: route => route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: false, error: 'slot_not_available' }),
      }),
    })
    await page.goto('/')
    await goToStep4(page)

    await typeOTP(page, '123456')

    // Toast warns that the slot is gone
    await expect(page.locator('#js-toast')).toContainText('לא זמין', { timeout: 5_000 })

    // After 2.5 s the wizard redirects back to step 2
    await expect(page.locator('#step-2')).toBeVisible({ timeout: 6_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()
  })

  test('invalid_otp error shows Hebrew otp-error element (not a toast)', async ({ page }) => {
    // This is the normal wrong-OTP path — uses the inline #js-otp-error element
    await setupMocksWithOverrides(page, {
      verifyAndBook: route => route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: false, error: 'invalid_otp' }),
      }),
    })
    await page.goto('/')
    await goToStep4(page)

    await typeOTP(page, '000000')

    await expect(page.locator('#js-otp-error')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-otp-error')).toContainText('שגוי')
    await expect(page.locator('#step-4')).toBeVisible()
  })
})
