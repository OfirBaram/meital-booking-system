/**
 * E2E tests for the legal / accessibility modal layer.
 *
 * Covers: footer link click → modal open → correct content →
 * close (X, Esc, backdrop) → focus restored. Plus a regression
 * check that the main booking wizard is unaffected.
 *
 * All tests intercept the GAS URL so no real network calls are made.
 */
import { test, expect } from '@playwright/test'

const GAS_GLOB = 'https://script.google.com/macros/s/**'

async function setupMocks(page) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() === 'GET') {
      return route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ success: true, slots: {} }),
      })
    }
    return route.continue()
  })
}

// ─── Privacy modal ────────────────────────────────────────────────────────────

test.describe('Privacy modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('opens with correct Hebrew title and SMS mention', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await expect(page.locator('#js-modal-title')).toHaveText('מדיניות פרטיות')
    await expect(page.locator('#js-modal-body')).toContainText('SMS')
    await expect(page.locator('#js-modal-body')).toContainText('תיאום תורים')
    await expect(page.locator('#js-modal-body')).toContainText('meital_sheva7@hotmail.com')
  })

  test('close button is focused automatically after opening', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal-close')).toBeFocused({ timeout: 3_000 })
  })

  test('X button closes the modal', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await page.locator('#js-modal-close').click()
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
  })

  test('focus returns to the trigger after closing with X', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await page.locator('#js-modal-close').click()
    await expect(page.locator('#js-open-privacy')).toBeFocused({ timeout: 2_000 })
  })

  test('Escape key closes the modal', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await page.keyboard.press('Escape')
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
  })

  test('clicking the backdrop closes the modal', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await page.locator('#js-modal-backdrop').click()
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
  })
})

// ─── Accessibility modal ──────────────────────────────────────────────────────

test.describe('Accessibility modal', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('opens with correct Hebrew title and WCAG mention', async ({ page }) => {
    await page.locator('#js-open-accessibility').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await expect(page.locator('#js-modal-title')).toHaveText('הצהרת נגישות')
    await expect(page.locator('#js-modal-body')).toContainText('WCAG')
    await expect(page.locator('#js-modal-body')).toContainText('meital_sheva7@hotmail.com')
  })

  test('Escape key closes the accessibility modal', async ({ page }) => {
    await page.locator('#js-open-accessibility').click()
    await page.keyboard.press('Escape')
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
  })

  test('focus returns to the accessibility trigger after closing', async ({ page }) => {
    await page.locator('#js-open-accessibility').click()
    await page.locator('#js-modal-close').click()
    await expect(page.locator('#js-open-accessibility')).toBeFocused({ timeout: 2_000 })
  })
})

// ─── Regression — booking wizard intact ───────────────────────────────────────

test.describe('Regression — booking wizard', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('step 1 is visible with exactly 2 service cards', async ({ page }) => {
    await expect(page.locator('#step-1')).toBeVisible()
    await expect(page.locator('.service-card')).toHaveCount(2)
  })

  test('both footer legal links are present', async ({ page }) => {
    await expect(page.locator('#js-open-privacy')).toBeVisible()
    await expect(page.locator('#js-open-accessibility')).toBeVisible()
  })

  test('Next button is still disabled before service selection', async ({ page }) => {
    await expect(page.locator('#btn-next')).toBeDisabled()
  })

  test('modal does not block the booking flow — can still advance to step 2', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await page.locator('#js-modal-close').click()
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
    await page.locator('.service-card').first().click()
    await page.locator('#btn-next').click()
    await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
  })
})

// ─── Regression — mobile viewport ─────────────────────────────────────────────

test.describe('Regression — mobile viewport (390×844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await page.goto('/')
  })

  test('step 1 and footer links are visible on mobile', async ({ page }) => {
    await expect(page.locator('#step-1')).toBeVisible()
    await expect(page.locator('#js-open-privacy')).toBeVisible()
    await expect(page.locator('#js-open-accessibility')).toBeVisible()
  })

  test('privacy modal opens and closes on mobile', async ({ page }) => {
    await page.locator('#js-open-privacy').click()
    await expect(page.locator('#js-modal')).not.toHaveClass(/hidden/)
    await page.locator('#js-modal-close').click()
    await expect(page.locator('#js-modal')).toHaveClass(/hidden/)
  })
})