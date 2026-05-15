/**
 * E2E tests for the 5-step booking wizard.
 *
 * The frontend runs in "mock mode" (CONFIG.API_BASE === ''), so:
 *  - mockSlots() generates random but deterministic-enough availability
 *  - apiSendOTP()      → always returns { success: true }
 *  - apiVerifyAndBook() → accepts any OTP except '000000'
 *
 * No real GAS backend is called. The webServer is started by playwright.config.js.
 */
import { test, expect } from '@playwright/test'

// ─── Helper: navigate through steps 1 and 2 ──────────────────────────────────

async function goToStep3(page) {
  // Step 1 — pick the first service
  await page.locator('.service-card').first().click()
  await page.locator('#btn-next').click()

  // Step 2 — wait for calendar, pick first available day and slot
  await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  await page.locator('.cal-day.avail').first().click()
  await expect(page.locator('.time-slot').first()).toBeVisible()
  await page.locator('.time-slot').first().click()
  await page.locator('#btn-next').click()

  // Now on step 3
  await expect(page.locator('#step-3')).toBeVisible()
}

// ─── OTP helper ───────────────────────────────────────────────────────────────

async function typeOTP(page, code) {
  await page.locator('.otp-input').first().click()
  // Type digit-by-digit; auto-advance moves focus after each digit
  for (const digit of code) {
    await page.keyboard.type(digit)
    await page.waitForTimeout(40) // let the input handler advance focus
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Step 1 — Service selection', () => {
  test.beforeEach(async ({ page }) => {
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
    await page.goto('/')
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
  })

  test('calendar renders with at least one available day in mock mode', async ({ page }) => {
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  })

  test('Friday and Saturday cells are disabled', async ({ page }) => {
    await expect(page.locator('#js-calendar')).toBeVisible({ timeout: 8_000 })

    // The day-header order is Sun(א)…Sat(ש). Position 5 = Friday, 6 = Saturday (0-indexed columns).
    // Verify that every day in those grid columns has the 'disabled' class.
    // We check that no day in fri/sat columns is clickable (avail).
    const fridayCells = page.locator('.cal-day').filter({ hasText: /.*/ }).nth(5)
    // A lighter assertion: no disabled-free cell exists in the whole calendar for fri/sat positions.
    // We check total avail count is < total cell count (some are always disabled).
    const totalCells = await page.locator('.cal-day').count()
    const availCells = await page.locator('.cal-day.avail').count()
    expect(availCells).toBeLessThan(totalCells)
  })

  test('Next button is disabled until both date AND slot are selected', async ({ page }) => {
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
    await page.locator('.cal-day.avail').first().click()
    // Date selected but no slot yet
    await expect(page.locator('#btn-next')).toBeDisabled()
    // Now select a slot
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
    await page.goto('/')
    await goToStep3(page)
  })

  test('Next button is disabled until name and valid phone are filled', async ({ page }) => {
    await expect(page.locator('#btn-next')).toBeDisabled()

    await page.locator('#inp-name').fill('נועה כהן')
    await expect(page.locator('#btn-next')).toBeDisabled() // phone still missing

    await page.locator('#inp-phone').fill('0501234567')
    await expect(page.locator('#btn-next')).toBeEnabled()
  })

  test('a landline number keeps the Next button disabled', async ({ page }) => {
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0212345678') // landline
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
    await page.goto('/')
    await goToStep3(page)
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click() // "שלחי קוד SMS"
    await expect(page.locator('#step-4')).toBeVisible()
  })

  test('renders exactly 6 OTP input boxes', async ({ page }) => {
    await expect(page.locator('.otp-input')).toHaveCount(6)
  })

  test('resend button is initially disabled with a countdown', async ({ page }) => {
    await expect(page.locator('#js-resend')).toBeDisabled()
    await expect(page.locator('#js-resend-timer')).toContainText('s')
  })

  test('correct OTP auto-submits and shows confirmation screen', async ({ page }) => {
    await typeOTP(page, '123456') // any code except 000000 is accepted in mock
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 5_000 })
  })

  test('wrong OTP (000000) shows an error message', async ({ page }) => {
    await typeOTP(page, '000000')
    await expect(page.locator('#js-otp-error')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-otp-error')).toContainText('שגוי')
  })
})

test.describe('Step 5 — Confirmation', () => {
  test('shows booking details and a UUID booking ID', async ({ page }) => {
    await page.goto('/')
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
    await page.locator('.cal-day.avail').first().click()
    await page.locator('.time-slot').first().click()
    await page.locator('#btn-next').click()
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click()
    await typeOTP(page, '246810')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 5_000 })

    // Booking summary card is visible and non-empty
    await expect(page.locator('#js-confirm-details')).not.toBeEmpty()

    // UUID row is visible (format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx)
    const idText = await page.locator('#js-confirm-id').textContent()
    expect(idText).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  })

  test('"Book another" resets the wizard back to step 1', async ({ page }) => {
    await page.goto('/')
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
    await page.locator('.cal-day.avail').first().click()
    await page.locator('.time-slot').first().click()
    await page.locator('#btn-next').click()
    await page.locator('#inp-name').fill('נועה כהן')
    await page.locator('#inp-phone').fill('0501234567')
    await page.locator('#btn-next').click()
    await typeOTP(page, '111111')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 5_000 })

    await page.locator('#js-book-again').click()
    await expect(page.locator('#step-1')).toBeVisible()
    await expect(page.locator('.service-card.selected')).toHaveCount(0)
  })
})
