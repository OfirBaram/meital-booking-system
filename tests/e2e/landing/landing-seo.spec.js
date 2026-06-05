/**
 * SEO & structured data tests.
 * These tests read the raw HTML served by Next.js to verify that meta tags,
 * JSON-LD schemas and link tags are correctly rendered.
 */
import { test, expect } from '../../support/test-base.js'

test('title tag is present, non-empty, and contains business name', async ({ page }) => {
  await page.goto('/')
  const title = await page.title()
  expect(title.trim().length).toBeGreaterThan(0)
  expect(title).toContain('מיטל')
})

test('title tag mentions רמת גן for local SEO', async ({ page }) => {
  await page.goto('/')
  expect(await page.title()).toContain('רמת גן')
})

test('meta description is present and at least 100 characters', async ({ page }) => {
  await page.goto('/')
  const desc = await page.getAttribute('meta[name="description"]', 'content')
  expect(desc).toBeTruthy()
  expect((desc ?? '').length).toBeGreaterThanOrEqual(100)
})

test('Open Graph title is present', async ({ page }) => {
  await page.goto('/')
  const og = await page.getAttribute('meta[property="og:title"]', 'content')
  expect(og?.trim()).toBeTruthy()
})

test('Open Graph description is present', async ({ page }) => {
  await page.goto('/')
  const og = await page.getAttribute('meta[property="og:description"]', 'content')
  expect(og?.trim()).toBeTruthy()
})

test('Open Graph image is present', async ({ page }) => {
  await page.goto('/')
  const og = await page.getAttribute('meta[property="og:image"]', 'content')
  expect(og?.trim()).toBeTruthy()
})

test('Open Graph type is "website"', async ({ page }) => {
  await page.goto('/')
  const og = await page.getAttribute('meta[property="og:type"]', 'content')
  expect(og).toBe('website')
})

test('Twitter card meta is present', async ({ page }) => {
  await page.goto('/')
  const card = await page.getAttribute('meta[name="twitter:card"]', 'content')
  expect(card).toBe('summary_large_image')
})

test('canonical link is present', async ({ page }) => {
  await page.goto('/')
  const canonical = await page.getAttribute('link[rel="canonical"]', 'href')
  expect(canonical?.trim()).toBeTruthy()
})

test('hreflang he-IL link is present', async ({ page }) => {
  await page.goto('/')
  const hreflang = await page.getAttribute('link[hreflang="he-IL"]', 'href')
  expect(hreflang?.trim()).toBeTruthy()
})

test('JSON-LD script is present and valid JSON', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  expect(raw).toBeTruthy()
  expect(() => JSON.parse(raw ?? '')).not.toThrow()
})

test('JSON-LD contains NailSalon @type', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  const ld  = JSON.parse(raw ?? '{}')
  // Top-level or inside @graph
  const json = JSON.stringify(ld)
  expect(json).toContain('"NailSalon"')
})

test('JSON-LD contains aggregateRating', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  expect(raw).toContain('aggregateRating')
  expect(raw).toContain('ratingValue')
})

test('JSON-LD contains FAQPage schema', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  expect(raw).toContain('"FAQPage"')
  expect(raw).toContain('mainEntity')
})

test('JSON-LD NailSalon has address with addressLocality', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  expect(raw).toContain('PostalAddress')
  expect(raw).toContain('addressLocality')
})

test('JSON-LD contains geo coordinates', async ({ page }) => {
  await page.goto('/')
  const raw = await page.locator('script[type="application/ld+json"]').textContent()
  expect(raw).toContain('GeoCoordinates')
  expect(raw).toContain('latitude')
})

test('geo meta tags are present for local SEO', async ({ page }) => {
  await page.goto('/')
  const region = await page.getAttribute('meta[name="geo.region"]', 'content')
  expect(region).toBe('IL-TA')
  const placename = await page.getAttribute('meta[name="geo.placename"]', 'content')
  expect(placename).toBeTruthy()
})

test('/sitemap.xml returns 200', async ({ page }) => {
  const res = await page.goto('/sitemap.xml')
  expect(res?.status()).toBe(200)
  const ct = res?.headers()['content-type'] ?? ''
  expect(ct).toContain('xml')
})

test('/robots.txt returns 200 and allows crawling', async ({ page }) => {
  const res = await page.goto('/robots.txt')
  expect(res?.status()).toBe(200)
  const body = await page.textContent('pre') ?? await page.content()
  expect(body).toContain('Allow')
})
