/**
 * tests/e2e/desktop-responsive.spec.js
 * Desktop layout and responsiveness - 9 tests at 1280x800.
 */
import { test, expect } from '../support/test-base.js'

const DESKTOP      = { width: 1280, height: 800 }
const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

const MOCK_BOOKINGS = {
  success: true,
  bookings: [
    { id: 'u1', name: 'לקוחה א', phone: '0501111111',
      service: 'gel_hands', serviceName: "לק ג'ל לציפורניים",
      date: '2099-12-01', time: '10:00', status: 'Pending',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90 },
  ],
}

async function mockAdminRoutes(page) {
  await page.route(GAS_GLOB, async (route, req) => {
    if (req.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(req.postData()) } catch { /* ignore */ }
    const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    if (body.action === 'listBookings')  return ok(MOCK_BOOKINGS)
    if (body.action === 'getSystemInfo') return ok({ success: true, reminderLastRun: null })
    return ok({ success: true })
  })
  await page.route(SB_FUNC_GLOB, async (route, req) => {
    const url = req.url()
    const ok  = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
    if (url.endsWith('/list-bookings'))  return ok(MOCK_BOOKINGS)
    if (url.endsWith('/admin-slots'))    return ok({ success: true, slots: [] })
    if (url.endsWith('/admin-clients'))  return ok({ success: true, clients: [] })
    if (url.endsWith('/sms-log'))        return ok({ success: true, entries: [] })
    if (url.endsWith('/twilio-stats'))   return ok({
      success: true,
      balance: { amount: '12.50', currency: 'USD' },
      spend: { today: '0', week: '0', month: '0', year: '0', allTime: '0', currency: 'USD' },
    })
    return ok({ success: true })
  })
}

async function mockBookingRoutes(page) {
  const ok = d => ({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
  await page.route(GAS_GLOB, r => r.fulfill(ok({ success: true, slots: {} })))
  await page.route(SB_FUNC_GLOB, r => r.fulfill(ok({ success: true, slots: {} })))
}

async function doLogin(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
}

// ── 1-4: Booking page ────────────────────────────────────────

test.describe('Booking page - desktop 1280x800', () => {
  test.use({ viewport: DESKTOP })

  test('loads without JS errors', async ({ page }) => {
    const errs = []
    page.on('pageerror', e => errs.push(e.message))
    await mockBookingRoutes(page)
    await page.goto('/booking.html')
    await page.waitForLoadState('domcontentloaded')
    expect(errs, 'JS errors: ' + errs.join(' | ')).toHaveLength(0)
  })

  test('no horizontal overflow', async ({ page }) => {
    await mockBookingRoutes(page)
    await page.goto('/booking.html')
    await page.waitForLoadState('domcontentloaded')
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const cw = await page.evaluate(() => document.documentElement.clientWidth)
    expect(sw, 'horizontal overflow detected').toBeLessThanOrEqual(cw)
  })

  test('service cards render in 2-column grid', async ({ page }) => {
    await mockBookingRoutes(page)
    await page.goto('/booking.html')
    const cards = page.locator('#js-services > *')
    await expect(cards).toHaveCount(2, { timeout: 5_000 })
    const [b0, b1] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()])
    expect(b0).not.toBeNull()
    expect(b1).not.toBeNull()
    // Same row: tops within 5px
    expect(Math.abs(b0.y - b1.y)).toBeLessThan(5)
    // Different columns: left edges differ by >50px
    expect(Math.abs(b0.x - b1.x)).toBeGreaterThan(50)
  })

  test('main content wider than mobile 448px', async ({ page }) => {
    await mockBookingRoutes(page)
    await page.goto('/booking.html')
    await page.waitForLoadState('domcontentloaded')
    const box = await page.locator('main').first().boundingBox()
    expect(box.width).toBeGreaterThan(500)
  })
})

// ── 5-9: Admin dashboard ─────────────────────────────────────

test.describe('Admin dashboard - desktop 1280x800', () => {
  test.use({ viewport: DESKTOP })

  test.beforeEach(async ({ page }) => {
    await mockAdminRoutes(page)
    await page.goto('/admin.html')
  })

  test('loads without JS errors on desktop', async ({ page }) => {
    const errs = []
    page.on('pageerror', e => errs.push(e.message))
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })
    expect(errs, 'JS errors: ' + errs.join(' | ')).toHaveLength(0)
  })

  test('no horizontal overflow after login', async ({ page }) => {
    await doLogin(page)
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    const cw = await page.evaluate(() => document.documentElement.clientWidth)
    expect(sw, 'horizontal overflow').toBeLessThanOrEqual(cw + 1)
  })

  test('nav tabs are in a horizontal row', async ({ page }) => {
    await doLogin(page)
    const tabs = page.locator('.nav-tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(4)
    const boxes = await Promise.all(
      Array.from({ length: Math.min(count, 4) }, (_, i) => tabs.nth(i).boundingBox())
    )
    const ys = boxes.filter(Boolean).map(b => b.y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(20)
  })

  test('content area wider than 600px on desktop', async ({ page }) => {
    await doLogin(page)
    const box = await page.locator('#tab-calendar').boundingBox()
    expect(box.width).toBeGreaterThan(600)
  })

  test('no JS errors switching all tabs on desktop', async ({ page }) => {
    const errs = []
    page.on('pageerror', e => errs.push(e.message))
    await doLogin(page)
    for (const tab of ['bookings', 'pulse', 'diary', 'clients']) {
      await page.locator('[data-qa="nav-tab-' + tab + '"]').click()
      await page.waitForTimeout(300)
    }
    expect(errs, 'JS errors switching tabs: ' + errs.join(' | ')).toHaveLength(0)
  })
})
