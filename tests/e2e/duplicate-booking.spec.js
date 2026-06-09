/**
 * E2E tests for duplicate-booking prevention (Plan A).
 * check-active-booking is called BEFORE send-otp on step 3.
 * active=true  -> Hebrew toast, stays on step 3, OTP NOT sent.
 * active=false -> proceeds to step 4 normally.
 * error        -> fail-open, proceeds to step 4.
 */
import { test, expect } from '../support/test-base.js'

const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const TEST_SB_URL  = 'https://callmnxlcganwugxwiym.supabase.co'

function makeMockSlots(year, month) {
  const slots = {}
  const floor = new Date(); floor.setHours(0, 0, 0, 0)
  const days  = new Date(year, month, 0).getDate()
  const BASE  = ['09:00', '10:30', '12:00', '13:30']
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d)
    if (date < floor || date.getDay() === 5 || date.getDay() === 6) continue
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    slots[key] = BASE
  }
  return { success: true, slots }
}

async function setupMocks(page, checkResponse = { active: false }) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
    })
  )
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const path = new URL(request.url()).pathname.split('/').pop()
    if (path === 'get-slots') {
      const u  = new URL(request.url())
      const yr = parseInt(u.searchParams.get('year'),  10)
      const mo = parseInt(u.searchParams.get('month'), 10)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(makeMockSlots(yr, mo)) })
    }
    if (path === 'check-active-booking') {
      if (checkResponse === 'network-error') return route.abort('failed')
      if (checkResponse === 'http-500') return route.fulfill({ status: 500, body: 'Internal Server Error' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(checkResponse) })
    }
    if (path === 'send-otp')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    if (path === 'verify-and-book')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, status: 'Pending' }) })
    return route.fulfill({ status: 400, body: '{}' })
  })
}

async function goToStep3(page) {
  await page.locator('.service-card').first().click()
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  await page.locator('.cal-day.avail').first().click()
  await expect(page.locator('.time-slot').first()).toBeVisible({ timeout: 5_000 })
  await page.locator('.time-slot').first().click()
  await page.locator('#btn-next').click()
  await expect(page.locator('#step-3')).toBeVisible({ timeout: 8_000 })
}

async function fillStep3(page) {
  await page.locator('#inp-name').fill('נועה כהן')
  await page.locator('#inp-phone').fill('0501234567')
}

// ─── active booking blocks step 3 → step 4 ───────────────────────────────────

test.describe('Duplicate booking — active booking blocks OTP send', () => {
  test('shows Hebrew toast and stays on step 3 when phone has a Pending booking', async ({ page }) => {
    await setupMocks(page, { active: true, date: '2099-12-15', time: '10:00' })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    const toastText = await page.locator('#js-toast').textContent()
    expect(toastText).toMatch(/[א-ת]/)
    expect(toastText).toContain('2099-12-15')
    expect(toastText).toContain('10:00')
  })

  test('shows toast for an Approved booking as well', async ({ page }) => {
    await setupMocks(page, { active: true, date: '2099-11-21', time: '12:00' })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    const toastText = await page.locator('#js-toast').textContent()
    expect(toastText).toContain('2099-11-21')
  })

  test('send-otp is NOT called when an active booking is found', async ({ page }) => {
    let otpCalled = false
    await page.route('**/config.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
    }))
    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const path = new URL(request.url()).pathname.split('/').pop()
      if (path === 'get-slots') {
        const u = new URL(request.url())
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(makeMockSlots(parseInt(u.searchParams.get('year'), 10), parseInt(u.searchParams.get('month'), 10))) })
      }
      if (path === 'check-active-booking')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: true, date: '2099-12-15', time: '10:00' }) })
      if (path === 'send-otp') {
        otpCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
      return route.fulfill({ status: 400, body: '{}' })
    })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(otpCalled).toBe(false)
  })
})

// ─── no active booking → allows normal flow ──────────────────────────────────

test.describe('Duplicate booking — no active booking allows OTP send', () => {
  test('proceeds to step 4 when check returns active:false', async ({ page }) => {
    await setupMocks(page, { active: false })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('.otp-input')).toHaveCount(6)
  })
})

// ─── fail-open: errors must not block the user ───────────────────────────────

test.describe('Duplicate booking — fail-open on check errors', () => {
  test('proceeds to step 4 when check-active-booking network fails', async ({ page }) => {
    await setupMocks(page, 'network-error')
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  })

  test('proceeds to step 4 when check-active-booking returns HTTP 500', async ({ page }) => {
    await setupMocks(page, 'http-500')
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── IS_MOCK_MODE skips the check entirely ───────────────────────────────────

test.describe('Duplicate booking — IS_MOCK_MODE skips check', () => {
  test('check-active-booking is NOT called in mock mode', async ({ page }) => {
    let checkCalled = false
    await page.route('**/config.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: true };\nexport default APP_CONFIG;\n`,
    }))
    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const path = new URL(request.url()).pathname.split('/').pop()
      if (path === 'check-active-booking') { checkCalled = true; return route.abort('failed') }
      return route.continue()
    })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    expect(checkCalled).toBe(false)
  })
})

// ─── cancelled booking must NOT block re-booking ─────────────────────────────
// Regression guard for: admin cancels a Pending booking → customer was blocked
// because the appointment stayed 'pending' in the DB (pending→cancelled was not
// a valid SQL transition).  After the fix the appointment is truly Cancelled,
// check-active-booking returns active:false, and the customer can book again.

test.describe('Duplicate booking — cancelled booking allows re-booking', () => {
  test('proceeds to OTP step when prior booking was Cancelled', async ({ page }) => {
    // check-active-booking returns active:false (cancelled rows are excluded
    // by the .in("status", ["Pending", "Approved"]) filter)
    await setupMocks(page, { active: false })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    // Must reach OTP step — NOT be blocked by a stale cancelled booking
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('#js-toast')).not.toBeVisible()
  })

  test('proceeds to OTP step when prior booking was Rejected', async ({ page }) => {
    await setupMocks(page, { active: false })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('#js-toast')).not.toBeVisible()
  })

  test('check-active-booking is called exactly once on step 3 submit', async ({ page }) => {
    let checkCallCount = 0
    await page.route('**/config.js', route => route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };
export default APP_CONFIG;
`,
    }))
    await page.route(SB_FUNC_GLOB, async (route, request) => {
      const path = new URL(request.url()).pathname.split('/').pop()
      if (path === 'get-slots') {
        const u = new URL(request.url())
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(makeMockSlots(parseInt(u.searchParams.get('year'), 10), parseInt(u.searchParams.get('month'), 10))) })
      }
      if (path === 'check-active-booking') {
        checkCallCount++
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false }) })
      }
      if (path === 'send-otp')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      return route.fulfill({ status: 400, body: '{}'})
    })
    await page.goto('/')
    await goToStep3(page)
    await fillStep3(page)
    await page.locator('#btn-next').click()

    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    expect(checkCallCount).toBe(1)
  })
})

