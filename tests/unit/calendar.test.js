/**
 * tests/unit/calendar.test.js
 * Unit tests for the pure utility functions in frontend/admin-calendar.js.
 *
 * These functions have zero DOM dependency and are pure transforms:
 *   computeCalendarGrid  — builds the 35/42-cell grid for a month
 *   buildCalData         — groups bookings by date with flags
 *   calDayStatus         — derives dot indicators from a calData entry
 *   formatCalTitle       — returns a Hebrew-locale title string
 *
 * Fixed "today" strings are passed to computeCalendarGrid so tests are
 * fully deterministic regardless of when CI runs.
 *
 * Verified day-of-week facts used in this file:
 *   January  2026: Jan  1 = Thursday (dow 4) → 35 cells
 *   May      2026: May  1 = Friday   (dow 5) → 42 cells
 *   March    2026: Mar  1 = Sunday   (dow 0) → 35 cells, no leading padding
 */
import { describe, it, expect } from 'vitest'
import {
  computeCalendarGrid,
  buildCalData,
  calDayStatus,
  formatCalTitle,
} from '../../frontend/admin-calendar.js'

// ─── Pre-computed grids (module-level for reuse across tests) ─────────────────

const JAN_GRID = computeCalendarGrid(2026, 1,  '2026-01-15')  // Jan 2026, today=15th
const MAY_GRID = computeCalendarGrid(2026, 5,  '2026-05-15')  // May 2026, today=15th
const MAR_GRID = computeCalendarGrid(2026, 3,  '2026-03-01')  // March 2026, today=1st

// ─── computeCalendarGrid ──────────────────────────────────────────────────────

describe('computeCalendarGrid — January 2026 (starts Thursday, 35 cells)', () => {
  it('returns exactly 35 cells', () => {
    expect(JAN_GRID).toHaveLength(35)
  })

  it('first cell is Sunday Dec 28 2025 (4 days before Jan 1)', () => {
    expect(JAN_GRID[0].dateStr).toBe('2025-12-28')
  })

  it('first 4 cells are flagged isOtherMonth', () => {
    for (let i = 0; i < 4; i++) {
      expect(JAN_GRID[i].isOtherMonth).toBe(true)
    }
  })

  it('cell 4 is Jan 1 and NOT other-month', () => {
    expect(JAN_GRID[4].dateStr).toBe('2026-01-01')
    expect(JAN_GRID[4].isOtherMonth).toBe(false)
  })

  it('last cell is Jan 31 (no trailing padding)', () => {
    expect(JAN_GRID[34].dateStr).toBe('2026-01-31')
    expect(JAN_GRID[34].isOtherMonth).toBe(false)
  })

  it('Jan 2 (cell 5) is flagged isFriday', () => {
    expect(JAN_GRID[5].dateStr).toBe('2026-01-02')
    expect(JAN_GRID[5].isFriday).toBe(true)
    expect(JAN_GRID[5].isSaturday).toBe(false)
  })

  it('Jan 3 (cell 6) is flagged isSaturday', () => {
    expect(JAN_GRID[6].dateStr).toBe('2026-01-03')
    expect(JAN_GRID[6].isSaturday).toBe(true)
    expect(JAN_GRID[6].isFriday).toBe(false)
  })

  it('Jan 1 (Thursday) is not Friday or Saturday', () => {
    expect(JAN_GRID[4].isFriday).toBe(false)
    expect(JAN_GRID[4].isSaturday).toBe(false)
  })

  it('Jan 15 (_today) is flagged isToday', () => {
    expect(JAN_GRID[18].dateStr).toBe('2026-01-15')
    expect(JAN_GRID[18].isToday).toBe(true)
  })

  it('today is NOT flagged isPast', () => {
    expect(JAN_GRID[18].isPast).toBe(false)
  })

  it('Jan 14 (day before today) is isPast but not isToday', () => {
    expect(JAN_GRID[17].dateStr).toBe('2026-01-14')
    expect(JAN_GRID[17].isPast).toBe(true)
    expect(JAN_GRID[17].isToday).toBe(false)
  })

  it('Jan 16 (future) is neither isPast nor isToday', () => {
    expect(JAN_GRID[19].dateStr).toBe('2026-01-16')
    expect(JAN_GRID[19].isPast).toBe(false)
    expect(JAN_GRID[19].isToday).toBe(false)
  })

  it('cells 0-3 (prev-month) are isPast for a today in Jan', () => {
    for (let i = 0; i < 4; i++) {
      expect(JAN_GRID[i].isPast).toBe(true)
    }
  })
})

describe('computeCalendarGrid — May 2026 (starts Friday, 42 cells)', () => {
  it('returns exactly 42 cells', () => {
    expect(MAY_GRID).toHaveLength(42)
  })

  it('first cell is April 26 (Sunday, 5 days before May 1)', () => {
    expect(MAY_GRID[0].dateStr).toBe('2026-04-26')
  })

  it('first 5 cells (April 26–30) are isOtherMonth', () => {
    for (let i = 0; i < 5; i++) {
      expect(MAY_GRID[i].isOtherMonth).toBe(true)
    }
  })

  it('cell 5 is May 1', () => {
    expect(MAY_GRID[5].dateStr).toBe('2026-05-01')
    expect(MAY_GRID[5].isOtherMonth).toBe(false)
  })

  it('May 1 (cell 5) is flagged isFriday', () => {
    expect(MAY_GRID[5].isFriday).toBe(true)
  })

  it('last 6 cells (June 1–6) are isOtherMonth', () => {
    for (let i = 36; i < 42; i++) {
      expect(MAY_GRID[i].isOtherMonth).toBe(true)
    }
  })

  it('last cell is June 6', () => {
    expect(MAY_GRID[41].dateStr).toBe('2026-06-06')
  })

  it('May 15 is isToday', () => {
    // cell index: 5 (May 1) + 14 (days) = cell[19]
    expect(MAY_GRID[19].dateStr).toBe('2026-05-15')
    expect(MAY_GRID[19].isToday).toBe(true)
  })
})

describe('computeCalendarGrid — March 2026 (starts Sunday, no leading padding)', () => {
  it('first cell is March 1 with isOtherMonth=false', () => {
    expect(MAR_GRID[0].dateStr).toBe('2026-03-01')
    expect(MAR_GRID[0].isOtherMonth).toBe(false)
  })

  it('has exactly 35 cells', () => {
    expect(MAR_GRID).toHaveLength(35)
  })

  it('March 1 is not Friday or Saturday', () => {
    expect(MAR_GRID[0].isFriday).toBe(false)
    expect(MAR_GRID[0].isSaturday).toBe(false)
  })
})

describe('computeCalendarGrid — every cell has the required shape', () => {
  it('every cell has dateStr, dayNum, isOtherMonth, isToday, isPast, isFriday, isSaturday', () => {
    const keys = ['dateStr','dayNum','isOtherMonth','isToday','isPast','isFriday','isSaturday']
    for (const cell of JAN_GRID) {
      for (const k of keys) {
        expect(cell).toHaveProperty(k)
      }
    }
  })

  it('dateStr values are unique within the grid', () => {
    const dates = JAN_GRID.map(c => c.dateStr)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('dayNum matches the day component of dateStr', () => {
    for (const cell of JAN_GRID) {
      const expected = parseInt(cell.dateStr.slice(8), 10)
      expect(cell.dayNum).toBe(expected)
    }
  })
})

// ─── buildCalData ─────────────────────────────────────────────────────────────

describe('buildCalData', () => {
  it('returns empty object for empty array', () => {
    expect(buildCalData([])).toEqual({})
  })

  it('returns empty object for null/undefined', () => {
    expect(buildCalData(null)).toEqual({})
    expect(buildCalData(undefined)).toEqual({})
  })

  it('groups a single Pending booking under its date', () => {
    const out = buildCalData([{ id: '1', date: '2026-06-01', status: 'Pending' }])
    expect(out['2026-06-01']).toBeDefined()
    expect(out['2026-06-01'].hasPending).toBe(true)
    expect(out['2026-06-01'].hasApproved).toBe(false)
    expect(out['2026-06-01'].bookings).toHaveLength(1)
  })

  it('sets hasApproved for an Approved booking', () => {
    const out = buildCalData([{ id: '2', date: '2026-06-02', status: 'Approved' }])
    expect(out['2026-06-02'].hasApproved).toBe(true)
    expect(out['2026-06-02'].hasPending).toBe(false)
  })

  it('Rejected and Cancelled bookings do NOT set hasPending or hasApproved', () => {
    const out = buildCalData([
      { id: '3', date: '2026-06-03', status: 'Rejected'  },
      { id: '4', date: '2026-06-04', status: 'Cancelled' },
    ])
    expect(out['2026-06-03'].hasPending).toBe(false)
    expect(out['2026-06-03'].hasApproved).toBe(false)
    expect(out['2026-06-04'].hasPending).toBe(false)
    expect(out['2026-06-04'].hasApproved).toBe(false)
  })

  it('groups multiple bookings on the same date', () => {
    const out = buildCalData([
      { id: 'a', date: '2026-06-05', status: 'Pending'  },
      { id: 'b', date: '2026-06-05', status: 'Approved' },
    ])
    expect(out['2026-06-05'].bookings).toHaveLength(2)
    expect(out['2026-06-05'].hasPending).toBe(true)
    expect(out['2026-06-05'].hasApproved).toBe(true)
  })

  it('skips bookings with no date', () => {
    const out = buildCalData([{ id: 'x', date: null, status: 'Pending' }])
    expect(Object.keys(out)).toHaveLength(0)
  })

  it('produces separate keys for different dates', () => {
    const out = buildCalData([
      { id: '1', date: '2026-06-01', status: 'Pending'  },
      { id: '2', date: '2026-06-02', status: 'Approved' },
    ])
    expect(Object.keys(out)).toHaveLength(2)
  })

  it('the bookings array in each entry preserves the full booking object', () => {
    const booking = { id: 'z', date: '2026-06-10', status: 'Pending', name: 'דנה' }
    const out = buildCalData([booking])
    expect(out['2026-06-10'].bookings[0]).toBe(booking)
  })
})

// ─── calDayStatus ─────────────────────────────────────────────────────────────

describe('calDayStatus', () => {
  it('returns empty dots and false for undefined entry', () => {
    const s = calDayStatus(undefined)
    expect(s.dots).toEqual([])
    expect(s.hasPendingOrApproved).toBe(false)
  })

  it('returns empty dots and false for null entry', () => {
    const s = calDayStatus(null)
    expect(s.dots).toEqual([])
    expect(s.hasPendingOrApproved).toBe(false)
  })

  it('returns amber dot when only hasPending', () => {
    const s = calDayStatus({ hasPending: true, hasApproved: false })
    expect(s.dots).toContain('amber')
    expect(s.dots).not.toContain('green')
    expect(s.hasPendingOrApproved).toBe(true)
  })

  it('returns green dot when only hasApproved', () => {
    const s = calDayStatus({ hasPending: false, hasApproved: true })
    expect(s.dots).toContain('green')
    expect(s.dots).not.toContain('amber')
    expect(s.hasPendingOrApproved).toBe(true)
  })

  it('returns both amber and green when both flags are true', () => {
    const s = calDayStatus({ hasPending: true, hasApproved: true })
    expect(s.dots).toContain('amber')
    expect(s.dots).toContain('green')
    expect(s.dots).toHaveLength(2)
  })

  it('amber appears before green (pending first)', () => {
    const s = calDayStatus({ hasPending: true, hasApproved: true })
    expect(s.dots.indexOf('amber')).toBeLessThan(s.dots.indexOf('green'))
  })

  it('returns no dots when both flags are false', () => {
    const s = calDayStatus({ hasPending: false, hasApproved: false })
    expect(s.dots).toEqual([])
    expect(s.hasPendingOrApproved).toBe(false)
  })
})

// ─── calDayStatus — tone + active counts (Calendar Clarity) ──────────────────
// Mirrors the cell-tint priority in renderCalendar: pending → approved → free.
// Counts are ACTIVE only (Pending/Approved); Rejected/Cancelled never count.

describe('calDayStatus — tone + active counts', () => {
  it('null/undefined entry → tone "none" and zero counts', () => {
    for (const e of [null, undefined]) {
      const s = calDayStatus(e)
      expect(s.tone).toBe('none')
      expect(s.pendingCount).toBe(0)
      expect(s.approvedCount).toBe(0)
      expect(s.freeSlotCount).toBe(0)
    }
  })

  it('tone "pending" when any Pending booking exists', () => {
    const s = calDayStatus({ bookings: [{ status: 'Pending' }], hasPending: true })
    expect(s.tone).toBe('pending')
    expect(s.pendingCount).toBe(1)
  })

  it('tone "approved" when only Approved bookings (no pending)', () => {
    const s = calDayStatus({ bookings: [{ status: 'Approved' }, { status: 'Approved' }], hasApproved: true })
    expect(s.tone).toBe('approved')
    expect(s.approvedCount).toBe(2)
    expect(s.pendingCount).toBe(0)
  })

  it('tone "free" when no bookings but free slots exist', () => {
    const s = calDayStatus({ bookings: [], hasFreeSlot: true, freeSlotCount: 3 })
    expect(s.tone).toBe('free')
    expect(s.freeSlotCount).toBe(3)
    expect(s.pendingCount).toBe(0)
    expect(s.approvedCount).toBe(0)
  })

  it('pending wins over approved when both present', () => {
    const s = calDayStatus({
      bookings: [{ status: 'Pending' }, { status: 'Approved' }],
      hasPending: true, hasApproved: true,
    })
    expect(s.tone).toBe('pending')
    expect(s.pendingCount).toBe(1)
    expect(s.approvedCount).toBe(1)
  })

  it('Rejected/Cancelled do NOT count toward pending/approved or tone', () => {
    const s = calDayStatus({
      bookings: [{ status: 'Rejected' }, { status: 'Cancelled' }],
      freeSlotCount: 0,
    })
    expect(s.pendingCount).toBe(0)
    expect(s.approvedCount).toBe(0)
    expect(s.tone).toBe('none')
  })

  it('Rejected booking alongside a free slot → tone "free" (terminal booking ignored)', () => {
    const s = calDayStatus({ bookings: [{ status: 'Cancelled' }], hasFreeSlot: true, freeSlotCount: 2 })
    expect(s.tone).toBe('free')
    expect(s.freeSlotCount).toBe(2)
  })
})

// ─── formatCalTitle ───────────────────────────────────────────────────────────

describe('formatCalTitle', () => {
  const CASES = [
    [2026,  1, 'ינואר 2026'],
    [2026,  2, 'פברואר 2026'],
    [2026,  3, 'מרץ 2026'],
    [2026,  4, 'אפריל 2026'],
    [2026,  5, 'מאי 2026'],
    [2026,  6, 'יוני 2026'],
    [2026,  7, 'יולי 2026'],
    [2026,  8, 'אוגוסט 2026'],
    [2026,  9, 'ספטמבר 2026'],
    [2026, 10, 'אוקטובר 2026'],
    [2026, 11, 'נובמבר 2026'],
    [2026, 12, 'דצמבר 2026'],
  ]

  CASES.forEach(([year, month, expected]) => {
    it(`month ${month} → "${expected}"`, () => {
      expect(formatCalTitle(year, month)).toBe(expected)
    })
  })

  it('year appears as a plain number (not locale-formatted)', () => {
    expect(formatCalTitle(2030, 1)).toBe('ינואר 2030')
  })
})
