/**
 * Gallery image integrity check.
 *
 * Loads the landing page and verifies that every image in the gallery
 * grid is present and fully loaded (naturalWidth > 0). A broken src
 * or missing file would result in naturalWidth === 0 on the img element.
 */
import { test, expect } from '../support/test-base.js'

const SUPABASE_GLOB = 'https://*.supabase.co/**'

test.describe('Gallery images', () => {
  test('all gallery images load without broken src', async ({ page }) => {
    // Block Supabase calls so the test is self-contained
    await page.route(SUPABASE_GLOB, route => route.abort())

    await page.goto('/landing.html')

    // Wait for the gallery grid to be populated by JS
    await page.waitForSelector('#gallery-grid img', { timeout: 10_000 })

    // Collect all img elements inside the gallery grid (including hidden ones)
    const results = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('#gallery-grid img'))
      return imgs.map(img => ({
        src:          img.getAttribute('src') || img.src,
        naturalWidth: img.naturalWidth,
        complete:     img.complete,
      }))
    })

    expect(results.length, 'gallery should have at least 17 images').toBeGreaterThanOrEqual(17)

    const broken = results.filter(img => img.complete && img.naturalWidth === 0)
    if (broken.length > 0) {
      // Print which srcs are broken to make debugging easy
      const srcs = broken.map(b => b.src).join('\n  ')
      throw new Error(`${broken.length} broken gallery image(s):\n  ${srcs}`)
    }
  })

  test('gallery grid renders the expected number of visible items', async ({ page }) => {
    await page.route(SUPABASE_GLOB, route => route.abort())
    await page.goto('/landing.html')
    await page.waitForSelector('#gallery-grid img', { timeout: 10_000 })

    // Count non-hidden visible items (the initial visible set, not the "show more" hidden ones)
    const visibleCount = await page.evaluate(() =>
      document.querySelectorAll('#gallery-grid .gallery-item:not(.hidden)').length
    )
    // We have at least the original 12 visible items
    expect(visibleCount, 'at least 12 gallery items should be visible by default')
      .toBeGreaterThanOrEqual(12)
  })
})
