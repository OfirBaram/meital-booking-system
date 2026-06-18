/**
 * Full Booking Flow Integration Test
 *
 * Complete end-to-end scenario:
 * 1. Customer books an appointment (wizard → OTP → confirmation)
 * 2. Admin approves/rejects/cancels the booking via API
 * 3. Verify SMS is sent to customer (mock capture)
 * 4. Verify database state transitions (Pending → Approved/Rejected/Cancelled)
 *
 * Mock contract:
 * - Supabase: get-slots, send-otp, verify-and-book, change-status
 * - Database: track appointments state mutations
 * - SMS: capture customer notifications on status change
 */

import { test, expect } from '../support/test-base.js'

const TEST_SB_URL  = 'https://callmnxlcganwugxwiym.supabase.co'
const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
const TEST_PHONE   = '+972501234567'  // E.164 format (normalized from 0501234567)
const TEST_NAME    = 'נועה כהן'

// ─── Mock Database ───────────────────────────────────────────────────────────

class MockDB {
  constructor() {
    this.appointments = new Map()
    this.smsLogs = []
  }

  createAppointment(id, { name, phone, service, date, time }) {
    const appt = { id, name, phone, service, date, time, status: 'Pending', created: new Date().toISOString() }
    this.appointments.set(id, appt)
    console.log(`[MockDB] created: ${id} status=Pending`)
    return appt
  }

  updateStatus(id, newStatus) {
    const appt = this.appointments.get(id)
    if (!appt) throw new Error(`Appointment ${id} not found`)
    appt.status = newStatus
    console.log(`[MockDB] updated: ${id} status=${newStatus}`)
    return appt
  }

  logSMS(to, message) {
    this.smsLogs.push({ to, message, timestamp: new Date().toISOString() })
    console.log(`[MockDB] SMS: to=${to}`)
  }

  getSMSToPhone(phone) {
    return this.smsLogs.filter(s => s.to === phone)
  }
}

// ─── Deterministic Slots ──────────────────────────────────────────────────────

function makeMockSlots(year, month) {
  const slots = {}
  const floor = new Date()
  floor.setHours(0, 0, 0, 0)
  const days = new Date(year, month, 0).getDate()
  const BASE = ['09:00', '10:30', '12:00', '13:30']

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d)
    if (date < floor || date.getDay() === 5 || date.getDay() === 6) continue
    const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    slots[key] = BASE
  }
  return { success: true, slots }
}

// ─── Setup Mocks ─────────────────────────────────────────────────────────────

async function setupMocks(page, db) {
  // Mock config.js
  await page.route('**/config.js', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `const APP_CONFIG = { SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };
export default APP_CONFIG;
`,
    })
  )

  // Mock Supabase functions
  await page.route(SB_FUNC_GLOB, async (route, request) => {
    const path = new URL(request.url()).pathname.split('/').pop()

    if (path === 'get-site-config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true,
        services: [
          { id: 'gel_hands',    name_he: "לק ג'ל לציפורניים",           desc_he: 'תיאור', duration_min: 60, icon: '💅', sort_order: 0 },
          { id: 'regular_feet', name_he: 'לק רגיל לציפורניים ברגליים', desc_he: 'תיאור', duration_min: 30, icon: '🦶', sort_order: 1 },
        ],
        config: {},
      }) })
    }

    if (path === 'get-slots') {
      const u = new URL(request.url())
      const year = parseInt(u.searchParams.get('year'), 10)
      const month = parseInt(u.searchParams.get('month'), 10)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeMockSlots(year, month)),
      })
    }

    if (path === 'send-otp') {
      console.log('[mock] send-otp')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    }

    if (path === 'verify-and-book') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { }

      const otp = body.otp ?? ''
      const ok = otp !== '000000'

      if (ok && body.booking) {
        db.createAppointment(body.booking.id, {
          name: body.booking.name,
          phone: body.booking.phone,
          service: body.booking.service,
          date: body.booking.date,
          time: body.booking.time,
        })
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ok ? { success: true, bookingId: body.booking?.id, status: 'Pending' } : { success: false, error: 'invalid_otp' }),
      })
    }

    if (path === 'change-status') {
      let body = {}
      try { body = JSON.parse(request.postData()) } catch { }

      const { bookingId, newStatus } = body
      const appt = db.updateStatus(bookingId, newStatus)

      // Side-effect: SMS to customer
      if (appt) {
        const action = newStatus === 'Approved' ? 'אושרה' : newStatus === 'Rejected' ? 'נדחתה' : 'בוטלה'
        db.logSMS(appt.phone, `הזמנתך ${action} לתאריך ${appt.date} בשעה ${appt.time}`)
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, booking: appt }),
      })
    }

    return route.fulfill({ status: 400, body: '{}' })
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function goToOTPStep(page) {
  await expect(page.locator('#step-1')).toBeVisible()
  await page.locator('.service-card').first().click()
  await page.locator('#btn-next').click()

  await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  await page.locator('.cal-day.avail').first().click()
  await expect(page.locator('.time-slot').first()).toBeVisible({ timeout: 5_000 })
  await page.locator('.time-slot').first().click()
  await page.locator('#btn-next').click()

  await expect(page.locator('#step-3')).toBeVisible({ timeout: 8_000 })
  await page.locator('#inp-name').fill(TEST_NAME)
  await page.locator('#inp-phone').fill('0501234567')
  await page.locator('#btn-next').click()

  await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
}

async function typeOTP(page, code) {
  const inputs = page.locator('.otp-input')
  for (let i = 0; i < code.length; i++) {
    await inputs.nth(i).fill(code[i])
  }
}

async function extractBookingId(page) {
  const text = await page.locator('#js-confirm-id').textContent()
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0] : null
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Full Booking Flow Integration', () => {
  let db

  test.beforeEach(async ({ page }) => {
    db = new MockDB()
    await setupMocks(page, db)
  })

  test('Customer books → Admin approves → SMS sent → DB valid', async ({ page }) => {
    await page.goto('/')
    await goToOTPStep(page)
    await typeOTP(page, '123456')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })

    const bookingId = await extractBookingId(page)
    expect(bookingId).toBeTruthy()
    expect(db.appointments.get(bookingId)?.status).toBe('Pending')
    expect(db.appointments.get(bookingId)?.name).toBe(TEST_NAME)
    expect(db.appointments.get(bookingId)?.phone).toBe(TEST_PHONE)

    // Admin approves
    const approveResponse = await page.evaluate(
      async ({ bookingId, url }) => {
        return fetch(`${url}/functions/v1/change-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, newStatus: 'Approved' }),
        }).then(r => r.json())
      },
      { bookingId, url: TEST_SB_URL }
    )

    expect(approveResponse.success).toBe(true)
    expect(db.appointments.get(bookingId)?.status).toBe('Approved')

    // Verify SMS
    const sms = db.getSMSToPhone(TEST_PHONE)
    expect(sms.length).toBeGreaterThan(0)
    expect(sms[0].message).toContain('אושרה')
  })

  test('Admin rejects booking → SMS to customer', async ({ page }) => {
    await page.goto('/')
    await goToOTPStep(page)
    await typeOTP(page, '654321')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })

    const bookingId = await extractBookingId(page)
    expect(db.appointments.get(bookingId)?.status).toBe('Pending')

    // Reject
    await page.evaluate(
      async ({ bookingId, url }) => {
        return fetch(`${url}/functions/v1/change-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, newStatus: 'Rejected' }),
        }).then(r => r.json())
      },
      { bookingId, url: TEST_SB_URL }
    )

    expect(db.appointments.get(bookingId)?.status).toBe('Rejected')
    const sms = db.getSMSToPhone(TEST_PHONE)
    expect(sms.length).toBeGreaterThan(0)
    expect(sms[0].message).toContain('נדחתה')
  })

  test('Approve then cancel → state transitions', async ({ page }) => {
    await page.goto('/')
    await goToOTPStep(page)
    await typeOTP(page, '555555')
    await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })

    const bookingId = await extractBookingId(page)

    // Approve
    await page.evaluate(
      async ({ bookingId, url }) => {
        return fetch(`${url}/functions/v1/change-status`, {
          method: 'POST',
          body: JSON.stringify({ bookingId, newStatus: 'Approved' }),
        }).then(r => r.json())
      },
      { bookingId, url: TEST_SB_URL }
    )
    expect(db.appointments.get(bookingId)?.status).toBe('Approved')

    // Cancel
    await page.evaluate(
      async ({ bookingId, url }) => {
        return fetch(`${url}/functions/v1/change-status`, {
          method: 'POST',
          body: JSON.stringify({ bookingId, newStatus: 'Cancelled' }),
        }).then(r => r.json())
      },
      { bookingId, url: TEST_SB_URL }
    )
    expect(db.appointments.get(bookingId)?.status).toBe('Cancelled')
  })
})
