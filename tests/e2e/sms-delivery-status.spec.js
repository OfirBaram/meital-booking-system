/**
 * tests/e2e/sms-delivery-status.spec.js
 * SMS delivery visibility — admin console.
 *
 * Motivation: on 2026-05-30 clients stopped receiving approve/cancel SMS and
 * the admin had NO way to see it — failures were swallowed and nothing was
 * recorded. This spec locks the notify -> log -> display contract that fixes
 * that, so a future regression in the visibility chain fails loudly:
 *   1. Each booking card shows whether its client SMS was sent (✅) or failed (❌).
 *   2. The SMS-log panel populates with SENT/ERROR rows and shows the failure
 *      reason for errors.
 *   3. After an approve, the refreshed booking reflects the SMS delivery status.
 *
 * Mock contract mirrors admin-dashboard.spec.js (GAS + SB Edge Function globs).
 */
import { test, expect } from '../support/test-base.js'

const GAS_GLOB     = 'https://script.google.com/macros/s/**'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const FAKE_TOKEN   = 'test-admin-token-32chars-exactly'

/** Two future Approved bookings — one notified (SENT), one failed (ERROR).
 *  Approved + future => visible under the default "all" filter. */
const SMS_BOOKINGS = {
  success: true,
  bookings: [
    {
      id: 'b-sent', name: 'דנה כהן', phone: '0501111111',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-01', time: '10:00', status: 'Approved',
      timestamp: '2099-11-01T10:00:00+03:00', duration: 90, smsStatus: 'SENT',
    },
    {
      id: 'b-fail', name: 'רונית לוי', phone: '0502222222',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-02', time: '11:00', status: 'Approved',
      timestamp: '2099-11-02T11:00:00+03:00', duration: 90, smsStatus: 'ERROR',
    },
  ],
}

/** SMS log with a successful OTP and a failed client approval (with reason). */
const SMS_LOG = {
  success: true,
  entries: [
    { to: '+972501111111', ts: '2099-12-01', status: 'SENT',
      context: 'ClientApproval', snippet: 'ההזמנה שלך אושרה', detail: '' },
    { to: '+972502222222', ts: '2099-12-02', status: 'ERROR',
      context: 'ClientCancellation', snippet: 'התור שלך בוטל',
      detail: 'Twilio 21610: Attempt to send to unsubscribed recipient' },
  ],
}

const MOCK_SLOTS = { success: true, slots: [] }

/**
 * Route both backends. `listBookingsResponder` lets a test vary the
 * list-bookings response across calls (used by the approve-flow test).
 */
async function setupMocks(page, { listBookingsResponder, smsLog = SMS_LOG } = {}) {
  const json = (route, data) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })

  await page.route(GAS_GLOB, async (route, request) => {
    if (request.method() !== 'POST') return route.continue()
    json(route, { success: true })
  })

  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const url = request.url()
    let body = {}
    try { body = JSON.parse(request.postData()) } catch { /* */ }
    const action = body.action || ''

    if (url.endsWith('/list-bookings')) {
      return json(route, listBookingsResponder ? listBookingsResponder() : SMS_BOOKINGS)
    }
    if (url.endsWith('/change-status')) return json(route, { success: true })
    if (url.endsWith('/admin-slots'))   return json(route, action === 'getSlots' ? MOCK_SLOTS : { success: true })
    if (url.endsWith('/admin-clients')) return json(route, { success: true, clients: [], appointments: [] })
    if (url.endsWith('/sms-log'))       return json(route, smsLog)
    return json(route, { success: true })
  })
}

async function login(page) {
  await page.locator('#js-token-input').fill(FAKE_TOKEN)
  await page.locator('#js-login-btn').click()
  await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
}

// ─── 1. Per-booking delivery badge ───────────────────────────────────────────

test.describe('SMS delivery — per-booking badge', () => {
  test('booking cards show ✅ sent and ❌ failed per client', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await login(page)
    await page.locator('[data-qa="nav-tab-bookings"]').click()

    const sent = page.locator('[data-booking="b-sent"] [data-qa="sms-status"]')
    const fail = page.locator('[data-booking="b-fail"] [data-qa="sms-status"]')

    await expect(sent).toBeVisible({ timeout: 5_000 })
    await expect(sent).toHaveAttribute('data-sms-status', 'SENT')
    await expect(sent).toContainText('נשלח')

    await expect(fail).toHaveAttribute('data-sms-status', 'ERROR')
    await expect(fail).toContainText('נכשל')

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── 2. SMS-log panel populates with reasons ─────────────────────────────────

test.describe('SMS delivery — log panel', () => {
  test('log panel lists SENT/ERROR rows and shows the failure reason', async ({ page }) => {
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await setupMocks(page)
    await page.goto('/admin.html')
    await login(page)

    // The SMS-log panel lives under the diary tab; force a refresh to load it.
    await page.locator('[data-qa="nav-tab-diary"]').click()
    await page.locator('#js-log-refresh').click()

    const entries = page.locator('#js-sms-log [data-qa="log-entry"]')
    await expect(entries).toHaveCount(2, { timeout: 5_000 })

    // The error row surfaces the Twilio reason so the admin knows WHY it failed.
    const detail = page.locator('#js-sms-log [data-qa="log-detail"]')
    await expect(detail).toHaveCount(1)
    await expect(detail).toContainText('Twilio 21610')

    // Both status icons present.
    await expect(page.locator('#js-sms-log')).toContainText('✅')
    await expect(page.locator('#js-sms-log')).toContainText('❌')

    // Deployment Gate: no inline onclick, no JS errors.
    expect(await page.locator('#js-sms-log [onclick]').count()).toBe(0)
    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})

// ─── 3. Approve flow reflects delivery status on refresh ─────────────────────

test.describe('SMS delivery — approve updates the badge', () => {
  test('after approving, the refreshed card shows the SMS was sent', async ({ page }) => {
    test.setTimeout(25_000) // the optimistic toastUndo commits after a 5s window
    const jsErrors = []
    page.on('pageerror', err => jsErrors.push(err.message))

    // First load: one Pending booking, no SMS yet. After approval + reload, the
    // same booking comes back Approved with smsStatus SENT.
    let calls = 0
    const pending = {
      id: 'b-approve', name: 'מאיה לוי', phone: '0503333333',
      service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
      date: '2099-12-10', time: '09:00', status: 'Pending',
      timestamp: '2099-11-10T09:00:00+03:00', duration: 90, smsStatus: null,
    }
    const listBookingsResponder = () => {
      calls += 1
      const status   = calls === 1 ? 'Pending' : 'Approved'
      const smsStatus = calls === 1 ? null : 'SENT'
      return { success: true, bookings: [{ ...pending, status, smsStatus }] }
    }

    await setupMocks(page, { listBookingsResponder })
    await page.goto('/admin.html')
    await login(page)
    await page.locator('[data-qa="nav-tab-bookings"]').click()

    // Initially Pending — no delivery badge.
    await expect(page.locator('[data-booking="b-approve"]')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-booking="b-approve"] [data-qa="sms-status"]')).toHaveCount(0)

    // Approve. Buttons inside .swipe-card must be triggered via dispatchEvent —
    // setPointerCapture hijacks synthetic .click() (project rule).
    const changeStatusReq = page.waitForRequest(r => r.url().endsWith('/change-status'), { timeout: 12_000 })
    await page.locator('[data-booking="b-approve"] [data-action="Approved"]').dispatchEvent('click')
    await changeStatusReq

    // After the reload, the card reflects the recorded SMS delivery (✅ sent).
    const badge = page.locator('[data-booking="b-approve"] [data-qa="sms-status"]')
    await expect(badge).toHaveAttribute('data-sms-status', 'SENT', { timeout: 10_000 })
    await expect(badge).toContainText('נשלח')

    expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  })
})
