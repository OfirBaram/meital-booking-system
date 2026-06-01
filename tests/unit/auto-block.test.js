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
