/**
 * E2E — social / CTA link coverage for frontend/landing.html
 *
 * Six locations tested:
 *   1. #header-social-strip  — desktop nav bar (hidden on mobile via CSS)
 *   2. #mobile-social-strip  — mobile menu drawer (visible after menu-btn click)
 *   3. #hero-cta .btn-primary — hero Booking CTA (wizard); .btn-outline — WhatsApp secondary
 *   4. #contact-wa-btn .btn-wa — contact section WhatsApp CTA
 *   5. #contact-social        — contact section social strip (all 5 icons)
 *   6. #footer-social         — footer social strip (all 5 icons)
 *
 * No API mocking needed — landing.html is a fully static page.
 */
import { test, expect } from '../support/test-base.js'

const SOCIAL = [
  { key: 'whatsapp',  label: 'וואטסאפ',   hrefMatch: /wa\.me\/972547686865/ },
  { key: 'instagram', label: 'אינסטגרם',  hrefMatch: /instagram\.com\/meytal\.sheva/ },
  { key: 'tiktok',    label: 'טיקטוק',    hrefMatch: /tiktok\.com\/@meytal\.sheva/ },
  { key: 'waze',      label: 'ווייז',     hrefMatch: /waze\.com/ },
  { key: 'easy',      label: 'Easy',       hrefMatch: /easy\.co\.il\/page\/10159641/ },
]

// Regex: number is correct regardless of ?text= pre-fill parameter
const WA_HREF = /https:\/\/wa\.me\/972547686865/

async function assertExternalAttrs(link) {
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
}

// 1. DESKTOP — header social strip
test.describe('Desktop header social strip (#header-social-strip)', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') })

  for (const { label, hrefMatch } of SOCIAL) {
    test(`${label} — correct href, target=_blank, rel=noopener`, async ({ page }) => {
      const link = page.locator(`#header-social-strip a[aria-label="${label}"]`)
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', hrefMatch)
      await assertExternalAttrs(link)
    })
  }
})

// 2. MOBILE — mobile menu social strip
test.describe('Mobile menu social strip (#mobile-social-strip)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#menu-btn').click()
    await expect(page.locator('#mobile-nav')).not.toHaveAttribute('aria-hidden', 'true')
  })

  for (const { label, hrefMatch } of SOCIAL) {
    test(`${label} — correct href, target=_blank, rel=noopener`, async ({ page }) => {
      const link = page.locator(`#mobile-social-strip a[aria-label="${label}"]`)
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', hrefMatch)
      await assertExternalAttrs(link)
    })
  }
})

// 3. HERO Booking CTA — WhatsApp only (PR#109: booking wizard removed from landing)
test.describe('Hero Booking CTA (#hero-cta .btn-primary)', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') })

  test('primary CTA is visible and does NOT link to booking wizard', async ({ page }) => {
    const btn = page.locator('#hero-cta a.btn-primary')
    await expect(btn).toBeVisible()
    const href = await btn.getAttribute('href')
    expect(href ?? '').not.toMatch(/index\.html|booking\.html/)
  })

  test('primary CTA has accessible aria-label for booking', async ({ page }) => {
    const label = await page.locator('#hero-cta a.btn-primary').getAttribute('aria-label')
    expect(label?.length).toBeGreaterThan(0)
  })
})

// 4. CONTACT SECTION WhatsApp CTA
test.describe('Contact WhatsApp CTA (#contact-wa-btn .btn-wa)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#contact-wa-btn').scrollIntoViewIfNeeded()
  })

  test('links to WhatsApp number', async ({ page }) => {
    const btn = page.locator('#contact-wa-btn a.btn-wa')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('href', WA_HREF)
  })

  test('opens in new tab with rel=noopener', async ({ page }) => {
    await assertExternalAttrs(page.locator('#contact-wa-btn a.btn-wa'))
  })

  test('has Hebrew aria-label', async ({ page }) => {
    await expect(page.locator('#contact-wa-btn a.btn-wa')).toHaveAttribute('aria-label', 'צרי קשר בווטסאפ')
  })

  test('href includes pre-filled message text', async ({ page }) => {
    const href = await page.locator('#contact-wa-btn a.btn-wa').getAttribute('href')
    expect(href, 'Contact WhatsApp CTA is missing ?text= pre-fill').toContain('?text=')
  })
})

// 5. CONTACT LINKS (phone + email — replaced social strip in d22a9c2)
test.describe('Contact links (#contact-links)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#contact-links').scrollIntoViewIfNeeded()
  })

  test('phone link is present with correct tel: href', async ({ page }) => {
    const link = page.locator('#contact-links a[href^="tel:"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /tel:\+972547686865/)
  })

  test('email link is present with correct mailto: href', async ({ page }) => {
    const link = page.locator('#contact-links a[href^="mailto:"]')
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /mailto:meital_sheva7@hotmail\.com/)
  })
})

// 6. FOOTER SOCIAL STRIP
test.describe('Footer social strip (#footer-social)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.locator('#footer-social').scrollIntoViewIfNeeded()
  })

  for (const { label, hrefMatch } of SOCIAL) {
    test(`${label} — correct href, target=_blank, rel=noopener`, async ({ page }) => {
      const link = page.locator(`#footer-social a[aria-label="${label}"]`)
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', hrefMatch)
      await assertExternalAttrs(link)
    })
  }
})

// 7. MOBILE — strip visibility
test.describe('Mobile viewport — strip visibility', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test.beforeEach(async ({ page }) => { await page.goto('/') })

  test('header social strip is hidden on mobile (CSS display:none)', async ({ page }) => {
    await expect(page.locator('#header-social-strip')).not.toBeVisible()
  })

  test('footer social strip shows all 5 icons on mobile', async ({ page }) => {
    await page.locator('#footer-social').scrollIntoViewIfNeeded()
    await expect(page.locator('#footer-social a')).toHaveCount(SOCIAL.length)
  })

  test('contact links section has phone and email on mobile', async ({ page }) => {
    await page.locator('#contact-links').scrollIntoViewIfNeeded()
    await expect(page.locator('#contact-links a[href^="tel:"]')).toBeVisible()
    await expect(page.locator('#contact-links a[href^="mailto:"]')).toBeVisible()
  })

  test('contact WhatsApp CTA is visible on mobile', async ({ page }) => {
    await page.locator('#contact-wa-btn').scrollIntoViewIfNeeded()
    const btn = page.locator('#contact-wa-btn a.btn-wa')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveAttribute('href', WA_HREF)
    const href = await btn.getAttribute('href')
    expect(href, 'Mobile contact WA CTA missing ?text= pre-fill').toContain('?text=')
  })
})

// 8. REGRESSION GUARDS
test.describe('Regression guards', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/') })

  test('no link has href="#" (broken placeholder guard)', async ({ page }) => {
    const broken = page.locator('.social-icon[href="#"]')
    const count = await broken.count()
    expect(count, 'Social icon with href="#" found — social config has unfilled placeholders').toBe(0)
  })

  test('every .social-icon has rel="noopener noreferrer"', async ({ page }) => {
    const icons = page.locator('.social-icon')
    const count = await icons.count()
    expect(count, 'No .social-icon elements found').toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const rel = await icons.nth(i).getAttribute('rel')
      expect(rel, `.social-icon[${i}] missing rel`).toMatch(/noopener/)
    }
  })

  test('no unhandled JS errors on landing page load', async ({ page }) => {
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.reload()
    await page.waitForLoadState('networkidle')
    expect(errors, `JS errors: ${errors.join('; ')}`).toHaveLength(0)
  })
})