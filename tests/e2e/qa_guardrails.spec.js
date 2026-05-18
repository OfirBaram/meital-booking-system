/**
 * tests/e2e/qa_guardrails.spec.js
 * QA Guardrail Tests — Test Stability Layer (Phase 5.1)
 *
 * Covers three risk classes:
 *  1. Input sanitization  — XSS payloads in name/phone are neutralised
 *  2. Error boundaries    — 503 Server Offline and 429 Rate Limit handled gracefully
 *  3. State preservation  — phone persisted to localStorage; clean recovery after reload
 *  4. data-qa coverage    — structural smoke test: every required element is reachable
 *
 * Rule: ALL selectors MUST use [data-qa="..."] — never CSS class or ID selectors.
 */
import { test, expect } from '@playwright/test'

// ─── Mock infrastructure ──────────────────────────────────────────────────────

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const TEST_GAS_URL = 'https://script.google.com/macros/s/TEST_MOCK_ID/exec'

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

async function setupMocks(page, overrides = {}) {
  await page.route('**/config.js', route =>
    route.fulfill({
      status:      200,
      contentType: 'application/javascript',
      body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
    })
  )

  await page.route(GAS_GLOB, async (route, request) => {
    const method = request.method()

    if (method === 'GET') {
      const url   = new URL(request.url())
      const year  = parseInt(url.searchParams.get('year'),  10)
      const month = parseInt(url.searchParams.get('month'), 10)
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify(makeMockSlots(year, month)),
      })
    }

    if (method === 'POST') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { /* ignore */ }

      if (body.action === 'sendOTP' && overrides.sendOTP)
        return overrides.sendOTP(route)
      if (body.action === 'verifyAndBook' && overrides.verifyAndBook)
        return overrides.verifyAndBook(route)

      if (body.action === 'sendOTP')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
      if (body.action === 'verifyAndBook')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, bookingId: 'test-uuid', status: 'Pending' }) })

      return route.fulfill({ status: 400, body: '{}' })
    }
    return route.continue()
  })
}

// ─── Step helpers (data-qa selectors throughout) ─────────────────────────────

async function goToStep2(page) {
  await page.locator('[data-qa^="card-service"]').first().click()
  await page.locator('[data-qa="btn-next"]').click()
  await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
}

async function goToStep3(page) {
  await goToStep2(page)
  await expect(page.locator('[data-qa="cal-day"].avail').first()).toBeVisible({ timeout: 8_000 })
  await page.locator('[data-qa="cal-day"].avail').first().click()
  await expect(page.locator('[data-qa="slot-btn"]').first()).toBeVisible({ timeout: 5_000 })
  await page.locator('[data-qa="slot-btn"]').first().click()
  await page.locator('[data-qa="btn-next"]').click()
  await expect(page.locator('#step-3')).toBeVisible({ timeout: 8_000 })
}

async function goToStep4(page) {
  await goToStep3(page)
  await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
  await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  await page.locator('[data-qa="btn-next"]').click()
  await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('[data-qa="otp-digit"]')).toHaveCount(6)
}

async function fillOTP(page, code) {
  const inputs = page.locator('[data-qa="otp-digit"]')
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).fill(code[i])
  }
}

// ─── 1. Input sanitization ────────────────────────────────────────────────────

test.describe('Input sanitization — XSS protection', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('onerror-based XSS payload in name does not execute in confirmation', async ({ page }) => {
    await page.evaluate(() => { window.__xss = false })
    await goToStep3(page)
    // length >= 2 so isValidName() passes; contains onerror XSS attempt
    await page.locator('[data-qa="inp-name"]').fill('<img src=x onerror="window.__xss=true">A')
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await fillOTP(page, '123456')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
    const xssExecuted = await page.evaluate(() => window.__xss)
    expect(xssExecuted).toBe(false)
  })

  test('HTML tags in name appear as escaped text in confirmation, not as DOM elements', async ({ page }) => {
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill('<b>bold</b>')
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
    await fillOTP(page, '123456')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
    // No actual <b> element should be injected inside confirm-row
    await expect(page.locator('[data-qa="confirm-row"] b')).toHaveCount(0)
    // The literal tag characters must appear as text, not rendered HTML
    const summaryText = await page.locator('[data-qa="confirm-details"]').textContent()
    expect(summaryText).toContain('<b>bold</b>')
  })

  test('XSS payload in phone field keeps Next button disabled (invalid format)', async ({ page }) => {
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
    await page.locator('[data-qa="inp-phone"]').fill('<script>alert(1)</script>')
    // Not a valid 05X number → btn-next must remain disabled
    await expect(page.locator('[data-qa="btn-next"]')).toBeDisabled()
  })

  test('200-character name is accepted without crashing', async ({ page }) => {
    const longName = 'א'.repeat(200)
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill(longName)
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()
    await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── 2. Error boundaries — 503 Server Offline ────────────────────────────────

test.describe('Error boundaries — server offline (503)', () => {
  test('503 on sendOTP shows a Hebrew toast and keeps the user on step 3', async ({ page }) => {
    await setupMocks(page, {
      sendOTP: route => route.fulfill({ status: 503, body: 'Service Unavailable' }),
    })
    await page.goto('/')
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()

    await expect(page.locator('[data-qa="status-toast"]')).toBeVisible({ timeout: 5_000 })
    const text = await page.locator('[data-qa="status-toast"]').textContent()
    expect(text).toMatch(/[֐-׿]/)
    expect(text).not.toContain('503')
    expect(text).not.toContain('Service Unavailable')
    expect(text).not.toContain('Error')
  })

  test('503 on verifyAndBook shows a Hebrew toast and keeps the user on step 4', async ({ page }) => {
    await setupMocks(page, {
      verifyAndBook: route => route.fulfill({ status: 503, body: 'Service Unavailable' }),
    })
    await page.goto('/')
    await goToStep4(page)
    await fillOTP(page, '123456')

    await expect(page.locator('#step-4')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-5')).not.toBeVisible()

    await expect(page.locator('[data-qa="status-toast"]')).toBeVisible({ timeout: 5_000 })
    const text = await page.locator('[data-qa="status-toast"]').textContent()
    expect(text).toMatch(/[֐-׿]/)
    expect(text).not.toContain('503')
  })
})

// ─── 3. Error boundaries — rate limit (429) ───────────────────────────────────

test.describe('Error boundaries — rate limit (429)', () => {
  test('429 HTTP status on sendOTP shows a Hebrew toast and keeps step 3 visible', async ({ page }) => {
    await setupMocks(page, {
      sendOTP: route => route.fulfill({ status: 429, body: 'Too Many Requests' }),
    })
    await page.goto('/')
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-qa="status-toast"]')).toBeVisible({ timeout: 5_000 })
    const text = await page.locator('[data-qa="status-toast"]').textContent()
    expect(text).toMatch(/[֐-׿]/)
    expect(text).not.toContain('429')
    expect(text).not.toContain('Too Many')
  })

  test('rate_limited error in sendOTP response body shows a Hebrew toast', async ({ page }) => {
    await setupMocks(page, {
      sendOTP: route => route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: false, error: 'rate_limited', retryAfter: 28 }),
      }),
    })
    await page.goto('/')
    await goToStep3(page)
    await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
    await page.locator('[data-qa="inp-phone"]').fill('0501234567')
    await page.locator('[data-qa="btn-next"]').click()

    await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()
    await expect(page.locator('[data-qa="status-toast"]')).toBeVisible({ timeout: 5_000 })
    const text = await page.locator('[data-qa="status-toast"]').textContent()
    expect(text).toMatch(/[֐-׿]/)
  })
})

// ─── 4. State preservation — phone persisted across reload ───────────────────

test.describe('State preservation — localStorage returning-client', () => {
  test('phone and name are written to localStorage after a completed booking', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep4(page)
    await fillOTP(page, '246810')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })

    const stored = await page.evaluate(() => localStorage.getItem('meital_client'))
    expect(stored).not.toBeNull()
    const client = JSON.parse(stored)
    expect(client.phone).toBe('0501234567')
    expect(client.name).toBe('נועה כהן')
  })

  test('after reload, step 3 pre-fills phone from localStorage (returning-client UX)', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    // Seed a previous booking (simulates a returning client)
    await page.evaluate(() => {
      localStorage.setItem('meital_client', JSON.stringify({
        name:  'נועה כהן',
        phone: '0501234567',
      }))
    })
    // Reload simulates a page refresh
    await page.reload()
    // Navigate to step 3
    await goToStep3(page)
    // Phone field must be pre-filled from localStorage
    const phone = await page.locator('[data-qa="inp-phone"]').inputValue()
    expect(phone).toBe('0501234567')
  })

  test('reload during OTP entry resets to step 1, not a broken step 4', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
    await goToStep4(page)
    // Simulate a mid-OTP page refresh
    await page.reload()
    // Must land cleanly on step 1
    await expect(page.locator('#step-1')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#step-4')).not.toBeVisible()
    // App must have re-initialised: both service cards present
    await expect(page.locator('[data-qa^="card-service"]')).toHaveCount(2)
  })
})

// ─── 5. data-qa structural smoke — every functional element is reachable ──────────────
//
// Verifies every required data-qa attribute is present in the rendered DOM.
// Fails immediately if an element is renamed or removed without updating data-qa.

test.describe('data-qa structural smoke — every functional element is reachable', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('step 1: service cards and navigation', async ({ page }) => {
    await expect(page.locator('[data-qa^="card-service"]')).toHaveCount(2)
    await expect(page.locator('[data-qa="btn-next"]')).toBeVisible()
  })

  test('step 2: calendar cells, month nav, and slot buttons', async ({ page }) => {
    await goToStep2(page)
    await expect(page.locator('[data-qa="cal-day"]').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[data-qa="btn-prev-month"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-next-month"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-back"]')).toBeVisible()
    await page.locator('[data-qa="cal-day"].avail').first().click()
    await expect(page.locator('[data-qa="slot-btn"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('step 3: inputs and navigation', async ({ page }) => {
    await goToStep3(page)
    await expect(page.locator('[data-qa="inp-name"]')).toBeVisible()
    await expect(page.locator('[data-qa="inp-phone"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-next"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-back"]')).toBeVisible()
  })

  test('step 4: OTP inputs and resend button', async ({ page }) => {
    await goToStep4(page)
    await expect(page.locator('[data-qa="otp-digit"]')).toHaveCount(6)
    await expect(page.locator('[data-qa="otp-inputs-wrap"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-otp-resend"]')).toBeVisible()
  })

  test('step 5: confirmation rows and book-again button', async ({ page }) => {
    await goToStep4(page)
    await fillOTP(page, '246810')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[data-qa="confirm-details"]')).toBeVisible()
    await expect(page.locator('[data-qa="confirm-id"]')).toBeVisible()
    await expect(page.locator('[data-qa="confirm-row"]').first()).toBeVisible()
    await expect(page.locator('[data-qa="btn-book-again"]')).toBeVisible()
  })

  test('footer: privacy and accessibility modal triggers', async ({ page }) => {
    await expect(page.locator('[data-qa="btn-open-privacy"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-open-accessibility"]')).toBeVisible()
  })
})
