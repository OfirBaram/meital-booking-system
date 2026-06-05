/**
 * Verifies every social/CTA link on the page:
 * - correct href (matches site-config)
 * - target="_blank" on external links
 * - rel="noopener noreferrer" for security
 * - nav anchor links point to existing sections
 */
import { test, expect } from '../../support/test-base.js'

const WA_HREF      = 'https://wa.me/972547686865'
const INSTAGRAM    = 'https://www.instagram.com/meytal.sheva/'
const TIKTOK       = 'https://www.tiktok.com/@meytal.sheva'
const WAZE_DOMAIN  = 'waze.com'

// ── WhatsApp ──────────────────────────────────────────────────────────────────
test('hero WhatsApp CTA — correct href and opens in new tab', async ({ page }) => {
  await page.goto('/')
  const link = page.locator('section').first().locator(`a[href*="${WA_HREF}"]`).first()
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
})

test('hero WhatsApp CTA — has pre-filled message in URL', async ({ page }) => {
  await page.goto('/')
  const href = await page.locator('section').first().locator(`a[href*="${WA_HREF}"]`).first().getAttribute('href')
  expect(href).toContain('?text=')
  expect(href).toContain('%D7')  // Hebrew-encoded chars
})

test('contact section WhatsApp CTA — correct href', async ({ page }) => {
  await page.goto('/')
  await page.locator('#contact').scrollIntoViewIfNeeded()
  const link = page.locator(`#contact a[href*="${WA_HREF}"]`).first()
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('target', '_blank')
})

test('floating WhatsApp button — correct href and aria-label', async ({ page }) => {
  await page.goto('/')
  const fab = page.locator('a[class*="fixed"][href*="wa.me"]')
  await expect(fab).toBeVisible()
  const href = await fab.getAttribute('href')
  expect(href).toContain('972547686865')
  await expect(fab).toHaveAttribute('aria-label')
})

test('header Book CTA — links to WhatsApp', async ({ page, viewport }) => {
  await page.goto('/')
  if ((viewport?.width ?? 1280) < 768) test.skip()
  const cta = page.locator('header a[aria-label="קביעת תור בווטסאפ"]')
  await expect(cta).toBeVisible()
  await expect(cta).toHaveAttribute('target', '_blank')
})

// ── Instagram ─────────────────────────────────────────────────────────────────
test('Instagram links — correct URL, new tab, rel', async ({ page }) => {
  await page.goto('/')
  const links = page.locator(`a[href="${INSTAGRAM}"]`)
  // Should appear in header (desktop) and/or footer
  const count = await links.count()
  expect(count).toBeGreaterThanOrEqual(1)
  for (let i = 0; i < count; i++) {
    await expect(links.nth(i)).toHaveAttribute('target', '_blank')
    await expect(links.nth(i)).toHaveAttribute('rel', /noopener/)
  }
})

// ── TikTok ────────────────────────────────────────────────────────────────────
test('TikTok links — correct URL, new tab, rel', async ({ page }) => {
  await page.goto('/')
  const links = page.locator(`a[href="${TIKTOK}"]`)
  const count = await links.count()
  expect(count).toBeGreaterThanOrEqual(1)
  for (let i = 0; i < count; i++) {
    await expect(links.nth(i)).toHaveAttribute('target', '_blank')
    await expect(links.nth(i)).toHaveAttribute('rel', /noopener/)
  }
})

// ── Waze ──────────────────────────────────────────────────────────────────────
test('Waze links — correct domain, navigate=yes, new tab', async ({ page }) => {
  await page.goto('/')
  const links = page.locator(`a[href*="${WAZE_DOMAIN}"]`)
  const count = await links.count()
  expect(count).toBeGreaterThanOrEqual(1)
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href')
    expect(href).toContain('navigate=yes')
    await expect(links.nth(i)).toHaveAttribute('target', '_blank')
  }
})

// ── Nav anchor links ──────────────────────────────────────────────────────────
test('nav links point to sections that exist on the page', async ({ page }) => {
  await page.goto('/')
  const anchors = ['about', 'services', 'gallery', 'contact']
  for (const id of anchors) {
    await expect(page.locator(`#${id}`), `#${id} section missing`).toBeAttached()
  }
})

test('clicking nav "שירותים" scrolls to services section', async ({ page }) => {
  await page.goto('/')
  const navLink = page.locator('nav a[href="#services"]').first()
  const isVisible = await navLink.isVisible()
  if (isVisible) {
    await navLink.click()
  } else {
    // Mobile: desktop nav hidden — navigate via hash
    await page.goto('/#services')
  }
  await expect(page.locator('#services')).toBeInViewport({ ratio: 0.1 })
})

// ── No broken # placeholders ──────────────────────────────────────────────────
test('no link has href="#" (broken placeholder)', async ({ page }) => {
  await page.goto('/')
  const broken = page.locator('a[href="#"]')
  const count  = await broken.count()
  expect(count, 'Found links with href="#" — check site-config').toBe(0)
})
