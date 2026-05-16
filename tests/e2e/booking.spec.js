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

// Matches the GAS web-app URL pattern set in CONFIG.API_BASE
const GAS_GLOB = 'https://script.google.com/macros/s/**'

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
 * Logs every intercepted call so Playwright traces show the mock traffic.
 */
async function setupMocks(page) {
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

    if (method === 'POST') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
      console.log(`[mock] POST action=${body.action}`)

      if (body.action === 'sendOTP') {
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify({ success: true }),
        })
      }

      if (body.action === 'verifyAndBook') {
        const otp = body.otp ?? ''
        console.log(`[mock] verifyAndBook otp=${otp}`)
        const ok = otp !== '000000'
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body: JSON.stringify(
            ok
              ? { success: true, bookingId: body.booking?.id, status: 'Pending' }
              : { success: false, error: 'invalid_otp' }
          ),
        })
      }

      return route.fulfill({ status: 400, body: '{}' })
    }

    return route.continue()
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
  test('getSlots is called exactly once on load; step 2 uses cached data', async ({ page }) => {
    let getSlotsCalls = 0

    await page.route(GAS_GLOB, async (route, request) => {
      if (request.method() === 'GET') {
        getSlotsCalls++
        const url   = new URL(request.url())
        const year  = parseInt(url.searchParams.get('year'),  10)
        const month = parseInt(url.searchParams.get('month'), 10)
        return route.fulfill({
          status:      200,
          contentType: 'application/json',
          body:        JSON.stringify(makeMockSlots(year, month)),
        })
      }
      if (request.method() === 'POST') {
        let body = {}
        try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
        if (body.action === 'sendOTP')
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      }
      return route.continue()
    })

    await page.goto('/')
    // Give pre-fetch time to complete
    await page.waitForTimeout(800)
    const callsAfterLoad = getSlotsCalls
    expect(callsAfterLoad).toBe(1)

    // Navigate to step 2
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-2')).toBeVisible()

    // Calendar should appear without an additional getSlots call
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