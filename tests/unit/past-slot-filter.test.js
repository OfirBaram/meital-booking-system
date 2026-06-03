/**
 * tests/unit/past-slot-filter.test.js
 * Unit tests for:
 *   1. Client-side past-time filter (mirrors renderSlots logic in booking.js)
 *   2. Admin slot categorization by status and isPast flag (mirrors _renderDay in admin-sheet.js)
 */
import { describe, it, expect } from 'vitest'

// ─── Mirror: renderSlots past-time filter (booking.js) ───────────────────────
const TZ = 'Asia/Jerusalem'

function filterSlotsForDisplay(times, dateKey, nowMs) {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(nowMs))
  if (dateKey !== todayKey) return times
  const nowTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(nowMs))
  return times.filter(t => (typeof t === 'string' ? t : t.time) > nowTime)
}

// ─── Mirror: slot categorization in _renderDay (admin-sheet.js) ──────────────
function categorizeSlots(slots, isPast) {
  const freeSlots = (slots || []).filter(s => String(s.status).toLowerCase() === 'available')
  const blocked   = (slots || []).filter(s => String(s.status).toLowerCase() === 'blocked')
  const locked    = (slots || []).filter(s => String(s.status).toLowerCase() === 'locked')
  const unfulfilledCount = isPast ? (freeSlots.length + locked.length) : 0
  return { freeSlots, blocked, locked, unfulfilledCount }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('filterSlotsForDisplay() — client past-time filter', () => {
  // nowMs = Wednesday 2026-06-03 22:30 Jerusalem (19:30 UTC)
  const nowMs   = new Date('2026-06-03T19:30:00.000Z').getTime()
  const todayKey = '2026-06-03'
  const futureKey = '2026-06-04'

  it('removes a past slot (10:00 < 22:30) for today', () => {
    expect(filterSlotsForDisplay(['10:00'], todayKey, nowMs)).toEqual([])
  })

  it('keeps a future slot (23:00 > 22:30) for today', () => {
    expect(filterSlotsForDisplay(['23:00'], todayKey, nowMs)).toEqual(['23:00'])
  })

  it('removes the slot exactly at nowTime (22:30 is not strictly >)', () => {
    const exactNow = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(nowMs))
    expect(filterSlotsForDisplay([exactNow], todayKey, nowMs)).toEqual([])
  })

  it('returns only future times when today has mixed slots', () => {
    const result = filterSlotsForDisplay(['09:00', '14:00', '22:45', '23:30'], todayKey, nowMs)
    expect(result).toEqual(['22:45', '23:30'])
  })

  it('does NOT filter a future date (tomorrow)', () => {
    expect(filterSlotsForDisplay(['09:00', '10:00', '11:00'], futureKey, nowMs))
      .toEqual(['09:00', '10:00', '11:00'])
  })

  it('handles object slots with .time field', () => {
    const slots = [
      { id: 'a1', time: '09:00' },
      { id: 'a2', time: '23:15' },
    ]
    const result = filterSlotsForDisplay(slots, todayKey, nowMs)
    expect(result).toHaveLength(1)
    expect(result[0].time).toBe('23:15')
  })

  it('returns empty array when all slots have passed', () => {
    expect(filterSlotsForDisplay(['08:00', '09:00', '10:00'], todayKey, nowMs)).toEqual([])
  })

  it('returns original array unchanged for empty input', () => {
    expect(filterSlotsForDisplay([], todayKey, nowMs)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('categorizeSlots() — admin slot status split', () => {
  const availSlot  = { id: '1', time: '10:00', status: 'available' }
  const lockedSlot = { id: '2', time: '11:00', status: 'locked' }
  const blockedSlot = { id: '3', time: '12:00', status: 'blocked' }

  it('classifies available slot correctly', () => {
    const { freeSlots } = categorizeSlots([availSlot], false)
    expect(freeSlots).toHaveLength(1)
  })

  it('classifies locked slot correctly', () => {
    const { locked } = categorizeSlots([lockedSlot], false)
    expect(locked).toHaveLength(1)
  })

  it('classifies blocked slot correctly', () => {
    const { blocked } = categorizeSlots([blockedSlot], false)
    expect(blocked).toHaveLength(1)
  })

  it('locked slot was previously invisible — now categorized', () => {
    const { locked, freeSlots, blocked } = categorizeSlots([lockedSlot], false)
    expect(locked).toHaveLength(1)
    expect(freeSlots).toHaveLength(0)
    expect(blocked).toHaveLength(0)
  })

  it('unfulfilledCount = 0 on future day regardless of available+locked', () => {
    const { unfulfilledCount } = categorizeSlots([availSlot, lockedSlot], false)
    expect(unfulfilledCount).toBe(0)
  })

  it('unfulfilledCount = available+locked on past day', () => {
    const { unfulfilledCount } = categorizeSlots([availSlot, lockedSlot, blockedSlot], true)
    expect(unfulfilledCount).toBe(2)  // available + locked; blocked is not unfulfilled
  })

  it('unfulfilledCount = 0 on past day with no available/locked', () => {
    const { unfulfilledCount } = categorizeSlots([blockedSlot], true)
    expect(unfulfilledCount).toBe(0)
  })

  it('unfulfilledCount counts only locked (not blocked) on past day', () => {
    const slots = [lockedSlot, blockedSlot, blockedSlot]
    const { unfulfilledCount } = categorizeSlots(slots, true)
    expect(unfulfilledCount).toBe(1)  // 1 locked, 0 available
  })

  it('case-insensitive status matching', () => {
    const mixed = [
      { id: '1', time: '10:00', status: 'Available' },
      { id: '2', time: '11:00', status: 'LOCKED' },
      { id: '3', time: '12:00', status: 'Blocked' },
    ]
    const { freeSlots, locked, blocked } = categorizeSlots(mixed, false)
    expect(freeSlots).toHaveLength(1)
    expect(locked).toHaveLength(1)
    expect(blocked).toHaveLength(1)
  })

  it('handles null/undefined slots gracefully', () => {
    expect(() => categorizeSlots(null, false)).not.toThrow()
    expect(categorizeSlots(null, false).freeSlots).toHaveLength(0)
  })
})
