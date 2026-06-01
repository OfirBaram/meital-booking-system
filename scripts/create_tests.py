# -*- coding: utf-8 -*-
"""Create E2E and unit tests for the automation section."""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def write(p, content):
    path = ROOT / p
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8', newline='\n')

# ─────────────────────────────────────────────────────────────────────────────
# E2E Test
# ─────────────────────────────────────────────────────────────────────────────
E2E = """\
/**
 * tests/e2e/admin-automation.spec.js
 * Automation Section (clients tab) — Daily Reminders + Auto-Block Slots
 *
 * Coverage:
 *  1. "זמנים" tab removed — no nav button, no #tab-slots
 *  2. Automation section visible in clients tab
 *  3. Daily Reminders card loads last-run timestamp
 *  4. Send reminders button calls GAS and shows toast
 *  5. Auto-block toggle defaults to ON (enabled=true)
 *  6. Disabling toggle makes settings panel semi-transparent
 *  7. Save config calls GAS saveAutoBlockConfig with correct payload
 *  8. Run-now shows blocked count toast
 *  9. No JS console errors throughout
 */
import { test, expect } from '../support/test-base.js'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

const MOCK_BOOKINGS_RESP = {
  success:  true,
  bookings: [
    {
      id: 'uuid-1', name: 'לקוחה א', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-15', time: '11:00', status: 'Approved',
      timestamp: '2099-11-15T11:00:00+03:00', duration: 90,
    },
  ],
}

async function setupMocks(page, gasOverrides = {}, sbOverrides = {}) {
  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* */ }
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (gasOverrides[body.action]) return gasOverrides[body.action](route, body)
    switch (body.action) {
      case 'getSystemInfo':       return respond({ success: true, reminderLastRun: '2026-06-01' })
      case 'getAutoBlockConfig':  return respond({ success: true, enabled: true, time: 20 })
      case 'saveAutoBlockConfig': return respond({ success: true, enabled: body.enabled, time: body.time })
      case 'runAutoBlock':        return respond({ success: true, blocked: 3, date: '2026-06-02' })
      case 'sendReminders':       return respond({ success: true, sent: 1, skipped: false })
      default:                    return respond({ success: true })
    }
  })
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url  = request.url()
    const path = url.split('/functions/v1/').pop()
    if (sbOverrides[path]) return sbOverrides[path](route, request)
    const respond = (data) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === 'list-bookings') return respond(MOCK_BOOKINGS_RESP)
    if (path === 'admin-clients') return respond({ success: true, clients: [] })
    if (path === 'sms-log')       return respond({ success: true, entries: [] })
    return respond({ success: true })
  })
}

async function loginAndGoToClients(page) {
  await page.goto('/admin.html')
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  await page.locator('[data-tab="clients"]').click()
  await expect(page.locator('#tab-clients')).toBeVisible({ timeout: 5_000 })
}

// ─── 1. Slots tab removed ─────────────────────────────────────────────────────
test.describe('Slots tab removed', () => {
  test('no slots nav button in DOM', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    await setupMocks(page)
    await page.goto('/admin.html')
    await expect(page.locator('#js-login')).toBeVisible({ timeout: 8_000 })
    await expect(page.locator('[data-tab="slots"]')).toHaveCount(0)
    expect(jsErrors, jsErrors.join(' | ')).toHaveLength(0)
  })

  test('tab-slots element does not exist', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/admin.html')
    await expect(page.locator('#tab-slots')).toHaveCount(0)
  })
})

// ─── 2. Automation section in clients tab ────────────────────────────────────
test.describe('Automation section', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
  })

  test('automation section card is rendered', async ({ page }) => {
    await expect(page.locator('#js-automation-section')).toBeVisible()
  })

  test('daily reminders submit button is visible', async ({ page }) => {
    await expect(page.locator('#js-reminder-submit')).toBeVisible()
  })

  test('auto-block toggle, save, run-now buttons visible', async ({ page }) => {
    await expect(page.locator('#js-autoblock-toggle')).toBeVisible()
    await expect(page.locator('[data-qa="btn-autoblock-save"]')).toBeVisible()
    await expect(page.locator('[data-qa="btn-autoblock-run"]')).toBeVisible()
  })

  test('client list is below divider (still rendered)', async ({ page }) => {
    await expect(page.locator('#js-clients-list')).toBeVisible()
  })

  test('no JS errors when switching to clients tab', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))
    jsErrors.length = 0
    await page.locator('[data-tab="bookings"]').click()
    await page.locator('[data-tab="clients"]').click()
    await expect(page.locator('#tab-clients')).toBeVisible()
    expect(jsErrors, jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── 3. Reminders last-run ───────────────────────────────────────────────────
test.describe('Daily reminders last-run', () => {
  test('shows date when reminderLastRun is set', async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
    await expect(page.locator('#js-reminder-last')).toContainText('2026', { timeout: 5_000 })
  })

  test('shows "טרם נשלח" when reminderLastRun is null', async ({ page }) => {
    await setupMocks(page, {
      getSystemInfo: (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, reminderLastRun: null }),
      }),
    })
    await loginAndGoToClients(page)
    await expect(page.locator('#js-reminder-last')).toContainText('טרם נשלח', { timeout: 5_000 })
  })
})

// ─── 4. Send reminders ───────────────────────────────────────────────────────
test.describe('Send reminders', () => {
  test('button calls sendReminders and shows success toast', async ({ page }) => {
    let called = false
    await setupMocks(page, {
      sendReminders: (route, body) => {
        called = true
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, sent: 2, skipped: false }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('#js-reminder-submit').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(called).toBe(true)
  })
})

// ─── 5. Auto-block toggle ────────────────────────────────────────────────────
test.describe('Auto-block toggle', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
  })

  test('toggle is ON by default (enabled=true from config)', async ({ page }) => {
    await expect(page.locator('#js-autoblock-toggle')).toBeChecked({ timeout: 5_000 })
  })

  test('time select defaults to 20', async ({ page }) => {
    await expect(page.locator('[data-qa="sel-autoblock-time"]')).toHaveValue('20', { timeout: 5_000 })
  })

  test('unchecking makes settings semi-transparent', async ({ page }) => {
    await page.locator('#js-autoblock-toggle').click()
    await expect(page.locator('#js-autoblock-toggle')).not.toBeChecked()
    const opacity = await page.locator('#js-autoblock-settings').evaluate(el => el.style.opacity)
    expect(parseFloat(opacity)).toBeLessThan(1)
  })
})

// ─── 6. Save config ──────────────────────────────────────────────────────────
test.describe('Save auto-block config', () => {
  test('save calls saveAutoBlockConfig with correct payload', async ({ page }) => {
    const calls = []
    await setupMocks(page, {
      saveAutoBlockConfig: (route, body) => {
        calls.push(body)
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, enabled: body.enabled, time: body.time }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="sel-autoblock-time"]').selectOption('19')
    await page.locator('[data-qa="btn-autoblock-save"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(calls[0].time).toBe(19)
    expect(calls[0].enabled).toBe(true)
  })

  test('success toast mentions "נשמרו"', async ({ page }) => {
    await setupMocks(page)
    await loginAndGoToClients(page)
    await page.locator('[data-qa="btn-autoblock-save"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('נשמרו')
  })
})

// ─── 7. Run now ──────────────────────────────────────────────────────────────
test.describe('Run auto-block now', () => {
  test('run-now calls runAutoBlock and shows blocked count', async ({ page }) => {
    let called = false
    await setupMocks(page, {
      runAutoBlock: (route) => {
        called = true
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ success: true, blocked: 5, date: '2026-06-02' }),
        })
      },
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="btn-autoblock-run"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    expect(called).toBe(true)
    await expect(page.locator('#js-toast-msg')).toContainText('5')
  })

  test('disabled auto-block shows "כבויה" toast', async ({ page }) => {
    await setupMocks(page, {
      runAutoBlock: (route) => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, skipped: true, reason: 'disabled' }),
      }),
    })
    await loginAndGoToClients(page)
    await page.locator('[data-qa="btn-autoblock-run"]').click()
    await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('#js-toast-msg')).toContainText('כבויה')
  })
})
"""

write('tests/e2e/admin-automation.spec.js', E2E)
print('[OK]   Created tests/e2e/admin-automation.spec.js')

# ─────────────────────────────────────────────────────────────────────────────
# Unit Test
# ─────────────────────────────────────────────────────────────────────────────
UNIT = """\
/**
 * tests/unit/auto-block.test.js
 * Unit tests for the auto-block slots feature (pure logic).
 *
 * Mirrors the pure functions from:
 *   - supabase/functions/auto-block-slots/index.ts  (tomorrowRange)
 *   - admin.js                                       (reminder preview count)
 *   - gas-backend.js                                 (config parse & validate)
 */
import { describe, it, expect } from 'vitest'

// ─── Mirror: tomorrowRange ────────────────────────────────────────────────────
function tomorrowRange(nowMs) {
  const TZ      = 'Asia/Jerusalem'
  const tomorrow = new Date((nowMs || Date.now()) + 24 * 60 * 60 * 1000)
  const dateStr  = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(tomorrow)
  const fromUtc  = new Date(dateStr + 'T00:00:00+03:00').toISOString()
  const toUtc    = new Date(dateStr + 'T23:59:59+02:00').toISOString()
  return { dateStr, fromUtc, toUtc }
}

// ─── Mirror: countTomorrowApproved (from admin.js updateReminderPreview) ────────
function countTomorrowApproved(bookings, nowMs) {
  const tomorrow = new Date((nowMs || Date.now()) + 86400000).toISOString().slice(0, 10)
  return bookings.filter(b => b.status === 'Approved' && b.date === tomorrow).length
}

// ─── Mirror: parseAutoBlockConfig (from GAS handleGetAutoBlockConfig) ─────────
function parseAutoBlockConfig(props) {
  return {
    enabled: (props.AUTO_BLOCK_ENABLED !== 'false'),
    time:    parseInt(props.AUTO_BLOCK_TIME || '20', 10),
  }
}

// ─── Mirror: validateAutoBlockSave (from GAS handleSaveAutoBlockConfig) ───────
function validateAutoBlockSave(body) {
  const enabled = (body.enabled !== false)
  let   hour    = parseInt(body.time, 10)
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 20
  return { enabled, time: hour }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('tomorrowRange()', () => {
  it('returns the next calendar day in Jerusalem', () => {
    const now = new Date('2026-06-01T10:00:00+03:00').getTime()
    expect(tomorrowRange(now).dateStr).toBe('2026-06-02')
  })

  it('fromUtc is midnight Jerusalem summer (+03:00)', () => {
    const now = new Date('2026-06-01T10:00:00+03:00').getTime()
    // 2026-06-02T00:00:00+03:00 = 2026-06-01T21:00:00.000Z
    expect(tomorrowRange(now).fromUtc).toBe('2026-06-01T21:00:00.000Z')
  })

  it('toUtc is 23:59:59 Jerusalem winter (+02:00)', () => {
    const now = new Date('2026-06-01T10:00:00+03:00').getTime()
    // 2026-06-02T23:59:59+02:00 = 2026-06-02T21:59:59.000Z
    expect(tomorrowRange(now).toUtc).toBe('2026-06-02T21:59:59.000Z')
  })

  it('midnight boundary: still returns next day', () => {
    const now = new Date('2026-06-01T23:30:00+03:00').getTime()
    expect(tomorrowRange(now).dateStr).toBe('2026-06-02')
  })

  it('winter offset: 2026-01-01 → 2026-01-02', () => {
    const now = new Date('2026-01-01T12:00:00+02:00').getTime()
    expect(tomorrowRange(now).dateStr).toBe('2026-01-02')
  })
})

describe('countTomorrowApproved()', () => {
  const now = new Date('2026-06-01T10:00:00+03:00').getTime()

  it('counts only Approved bookings dated tomorrow', () => {
    const bookings = [
      { id: '1', status: 'Approved', date: '2026-06-02' },
      { id: '2', status: 'Pending',  date: '2026-06-02' },
      { id: '3', status: 'Approved', date: '2026-06-03' },
    ]
    expect(countTomorrowApproved(bookings, now)).toBe(1)
  })

  it('returns 0 for empty bookings', () => {
    expect(countTomorrowApproved([], now)).toBe(0)
  })

  it('returns 0 for Rejected/Cancelled', () => {
    const bookings = [
      { id: '1', status: 'Rejected',  date: '2026-06-02' },
      { id: '2', status: 'Cancelled', date: '2026-06-02' },
    ]
    expect(countTomorrowApproved(bookings, now)).toBe(0)
  })

  it('counts multiple approved', () => {
    const bs = [1,2,3].map(i => ({ id: String(i), status: 'Approved', date: '2026-06-02' }))
    expect(countTomorrowApproved(bs, now)).toBe(3)
  })
})

describe('parseAutoBlockConfig() defaults', () => {
  it('enabled defaults to true', () => {
    expect(parseAutoBlockConfig({}).enabled).toBe(true)
  })

  it('time defaults to 20', () => {
    expect(parseAutoBlockConfig({}).time).toBe(20)
  })

  it('reads enabled=false from "false" string', () => {
    expect(parseAutoBlockConfig({ AUTO_BLOCK_ENABLED: 'false' }).enabled).toBe(false)
  })

  it('reads enabled=true from "true" string', () => {
    expect(parseAutoBlockConfig({ AUTO_BLOCK_ENABLED: 'true' }).enabled).toBe(true)
  })

  it('parses custom time', () => {
    expect(parseAutoBlockConfig({ AUTO_BLOCK_TIME: '19' }).time).toBe(19)
  })
})

describe('validateAutoBlockSave() input validation', () => {
  it('clamps >23 to 20', () => expect(validateAutoBlockSave({ enabled: true, time: 99 }).time).toBe(20))
  it('clamps negative to 20', () => expect(validateAutoBlockSave({ enabled: true, time: -1 }).time).toBe(20))
  it('clamps NaN to 20', () => expect(validateAutoBlockSave({ enabled: true, time: NaN }).time).toBe(20))
  it('accepts 20', () => expect(validateAutoBlockSave({ enabled: true, time: 20 }).time).toBe(20))
  it('accepts 16', () => expect(validateAutoBlockSave({ enabled: true, time: 16 }).time).toBe(16))
  it('accepts 23', () => expect(validateAutoBlockSave({ enabled: true, time: 23 }).time).toBe(23))
  it('treats missing enabled as true', () => expect(validateAutoBlockSave({ time: 20 }).enabled).toBe(true))
  it('treats enabled=false correctly', () => expect(validateAutoBlockSave({ enabled: false, time: 20 }).enabled).toBe(false))
})
"""
write('tests/unit/auto-block.test.js', UNIT)
print('[OK]   Created tests/unit/auto-block.test.js')
print('Done!')
