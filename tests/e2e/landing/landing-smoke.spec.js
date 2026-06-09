/**
 * Smoke tests — the page loads, core sections render, no JS crashes.
 * Run against both desktop and mobile via playwright.landing.config.js projects.
 */
import { test, expect } from '../../support/test-base.js'

test('page returns 200 and renders without white-screen', async ({ page }) => {
  const res = await page.goto('/')
  expect(res?.status()).toBe(200)
  // Body must have content — guard against blank-page regression
  const body = await page.textContent('body')
  expect(body?.trim().length).toBeGreaterThan(100)
})

test('h1 is visible and contains Hebrew text', async ({ page }) => {
  await page.goto('/')
  const h1 = page.locator('h1')
  await expect(h1).toBeVisible()
  const text = await h1.textContent()
  // Must contain at least one Hebrew character (֐-׿)
  expect(/[֐-׿]/.test(text ?? '')).toBe(true)
})

test('header is fixed and contains site name', async ({ page }) => {
  await page.goto('/')
  const header = page.locator('header[role="banner"]')
  await expect(header).toBeVisible()
  await expect(header).toContainText('מיטל')
})

test('hero WhatsApp CTA is visible', async ({ page }) => {
  await page.goto('/')
  const cta = page.locator('section').first().locator('a[href*="wa.me"]').first()
  await expect(cta).toBeVisible()
})

test('floating WhatsApp button is visible', async ({ page }) => {
  await page.goto('/')
  const fab = page.locator('a.wa-float, a[aria-label*="וואטסאפ"][class*="fixed"]')
  await expect(fab).toBeVisible()
})

test('about section renders', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#about')).toBeVisible()
  await expect(page.locator('#about h2')).toBeVisible()
})

test('services section renders all 4 service cards', async ({ page }) => {
  await page.goto('/')
  await page.locator('#services').scrollIntoViewIfNeeded()
  const cards = page.locator('#services article')
  await expect(cards).toHaveCount(4)
})

test('gallery section renders 6 images', async ({ page }) => {
  await page.goto('/')
  await page.locator('#gallery').scrollIntoViewIfNeeded()
  const images = page.locator('#gallery img')
  await expect(images).toHaveCount(6)
})

test('testimonials section renders 3 reviews', async ({ page }) => {
  await page.goto('/')
  await page.locator('blockquote').first().scrollIntoViewIfNeeded()
  const reviews = page.locator('blockquote')
  await expect(reviews).toHaveCount(3)
})

test('contact section is visible with WhatsApp CTA', async ({ page }) => {
  await page.goto('/')
  await page.locator('#contact').scrollIntoViewIfNeeded()
  await expect(page.locator('#contact h2')).toBeVisible()
  await expect(page.locator('#contact a[href*="wa.me"]').first()).toBeVisible()
})

test('footer renders with site name and legal links', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer[role="contentinfo"]')
  await expect(footer).toBeVisible()
  await expect(footer).toContainText('מיטל')
  await expect(footer.locator('a[href="/takanon"]')).toBeVisible()
  await expect(footer.locator('a[href="/privacy"]')).toBeVisible()
})

test('no unhandled JS page errors on load', async ({ page }) => {
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(errors, `Page errors: ${errors.join('; ')}`).toHaveLength(0)
})

test('FAQ section renders with at least 3 items', async ({ page }) => {
  await page.goto('/')
  await page.locator('#faq').scrollIntoViewIfNeeded()
  await expect(page.locator('#faq')).toBeVisible()
  await expect(page.locator('#faq h2')).toBeVisible()
  const items = page.locator('#faq details')
  const count = await items.count()
  expect(count, 'Expected at least 3 FAQ items').toBeGreaterThanOrEqual(3)
})

test('service cards display pricing information', async ({ page }) => {
  await page.goto('/')
  await page.locator('#services').scrollIntoViewIfNeeded()
  // At least one service should show a price badge (contains ₪)
  const priceBadge = page.locator('#services').getByText(/₪/)
  await expect(priceBadge.first()).toBeVisible()
})
