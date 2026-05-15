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

// ─── Helpers: navigate through the wizard steps ───────────────────────────────

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
// keyboard.type() dispatches to CDP's tracked focused element; on slow CI
// runners the auto-advance focus shift from the JS input handler races the
// CDP focus state, causing digits to land on the wrong box. fill() targets
// the element directly and is immune to that race.

async function typeOTP(page, code) {
  const inputs = page.locator('.otp-input')
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).fill(code[i])
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