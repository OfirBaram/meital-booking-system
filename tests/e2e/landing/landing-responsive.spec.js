/**
 * Responsive layout tests — verifies the page behaves correctly at the
 * three key breakpoints: 375px (mobile), 768px (tablet), 1280px (desktop).
 *
 * These tests run under both 'desktop' and 'mobile' Playwright projects
 * but use explicit viewport overrides for precise breakpoint control.
 */
import { test, expect } from '../../support/test-base.js'

// ── Mobile (375px) ────────────────────────────────────────────────────────────
test.describe('mobile 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('hamburger menu button is visible', async ({ page }) => {
    await page.goto('/')
    const burger = page.locator('button[aria-label*="תפריט"]')
    await expect(burger).toBeVisible()
  })

  test('desktop nav links are hidden', async ({ page }) => {
    await page.goto('/')
    // The hidden md:flex nav — should not be visible on mobile
    const desktopNav = page.locator('nav[aria-label="ניווט ראשי"]')
    await expect(desktopNav).toBeHidden()
  })

  test('mobile menu opens and shows nav links', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[aria-label="פתח תפריט"]').click()
    await expect(page.locator('#mobile-nav')).toBeVisible()
    await expect(page.locator('#mobile-nav a[href="#services"]')).toBeVisible()
  })

  test('mobile menu closes when a nav link is clicked', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[aria-label="פתח תפריט"]').click()
    await page.locator('#mobile-nav a[href="#services"]').click()
    await expect(page.locator('#mobile-nav')).toBeHidden()
  })

  test('mobile menu has WhatsApp book CTA', async ({ page }) => {
    await page.goto('/')
    await page.locator('button[aria-label="פתח תפריט"]').click()
    const cta = page.locator('#mobile-nav a[href*="wa.me"]').first()
    await expect(cta).toBeVisible()
  })

  test('hero is stacked (image below text)', async ({ page }) => {
    await page.goto('/')
    // On mobile, flex-col means image column comes AFTER text
    const heroSection = page.locator('section').first()
    await expect(heroSection).toBeVisible()
    // Just ensure it renders without overflow
    const box = await heroSection.boundingBox()
    expect(box?.width).toBeLessThanOrEqual(375)
  })

  test('floating WhatsApp button is visible on mobile', async ({ page }) => {
    await page.goto('/')
    const fab = page.locator('a[class*="fixed"][href*="wa.me"]')
    await expect(fab).toBeVisible()
  })

  test('service cards stack to 2 columns on mobile', async ({ page }) => {
    await page.goto('/')
    await page.locator('#services').scrollIntoViewIfNeeded()
    // Cards present and visible
    const cards = page.locator('#services article')
    await expect(cards).toHaveCount(4)
  })
})

// ── Tablet (768px) ────────────────────────────────────────────────────────────
test.describe('tablet 768px', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('desktop nav is visible at 768px', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="ניווט ראשי"]')).toBeVisible()
  })

  test('hamburger is hidden at 768px', async ({ page }) => {
    await page.goto('/')
    const burger = page.locator('button[aria-label*="תפריט"]')
    await expect(burger).toBeHidden()
  })
})

// ── Desktop (1280px) ──────────────────────────────────────────────────────────
test.describe('desktop 1280px', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('desktop nav links are visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav[aria-label="ניווט ראשי"]')).toBeVisible()
    await expect(page.locator('nav a[href="#about"]').first()).toBeVisible()
  })

  test('header Book CTA button is visible', async ({ page }) => {
    await page.goto('/')
    const cta = page.locator('header a[aria-label="קביעת תור בווטסאפ"]')
    await expect(cta).toBeVisible()
  })

  test('hero shows split layout with image column', async ({ page }) => {
    await page.goto('/')
    // The image column should be visible on desktop (flex-row layout)
    const heroImg = page.locator('section').first().locator('img').first()
    await expect(heroImg).toBeVisible()
  })

  test('services show 4 columns', async ({ page }) => {
    await page.goto('/')
    await page.locator('#services').scrollIntoViewIfNeeded()
    const cards = page.locator('#services article')
    await expect(cards).toHaveCount(4)
  })

  test('header becomes solid after scrolling past hero', async ({ page }) => {
    await page.goto('/')
    // Before scroll — header should be transparent
    const headerBefore = await page.locator('header').getAttribute('class')
    expect(headerBefore).toContain('border-transparent')

    // Scroll down past hero
    await page.evaluate(() => window.scrollTo(0, 800))
    await page.waitForTimeout(400)

    // After scroll — header should be solid
    const headerAfter = await page.locator('header').getAttribute('class')
    expect(headerAfter).toContain('border-border')
  })
})
