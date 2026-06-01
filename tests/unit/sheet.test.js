/**
 * tests/unit/sheet.test.js
 * Unit tests for the pure state machine in frontend/admin-sheet.js.
 *
 * Coverage:
 *   INITIAL_SHEET_STATE  — shape and default values
 *   SNAP_HEIGHTS         — structure and ordering
 *   sheetReducer OPEN    — type, payload, snap defaults, unknown snap
 *   sheetReducer CLOSE   — full reset, idempotent on already-closed
 *   sheetReducer SET_SNAP — value change, no-op on invalid, preserves rest
 *   sheetReducer unknown — returns state unchanged
 *
 * DOM functions (initSheet, openSheet, closeSheet) are covered by E2E tests.
 */
import { describe, it, expect } from 'vitest'
import {
  sheetReducer,
  INITIAL_SHEET_STATE,
  SNAP_HEIGHTS,
  slotTimeOptions,
  usedTimeSet,
} from '../../frontend/admin-sheet.js'

// ─── INITIAL_SHEET_STATE ──────────────────────────────────────────────────────

describe('INITIAL_SHEET_STATE', () => {
  it('open is false', () => {
    expect(INITIAL_SHEET_STATE.open).toBe(false)
  })
  it('type is null', () => {
    expect(INITIAL_SHEET_STATE.type).toBeNull()
  })
  it('payload is null', () => {
    expect(INITIAL_SHEET_STATE.payload).toBeNull()
  })
  it('default snap is full', () => {
    expect(INITIAL_SHEET_STATE.snap).toBe('full')
  })
  it('has exactly the four expected keys', () => {
    expect(Object.keys(INITIAL_SHEET_STATE).sort()).toEqual(['open','payload','snap','type'].sort())
  })
})

// ─── SNAP_HEIGHTS ─────────────────────────────────────────────────────────────

describe('SNAP_HEIGHTS', () => {
  it('defines peek, half, and full', () => {
    expect(SNAP_HEIGHTS).toHaveProperty('peek')
    expect(SNAP_HEIGHTS).toHaveProperty('half')
    expect(SNAP_HEIGHTS).toHaveProperty('full')
  })

  it('all values are strings ending in "vh"', () => {
    for (const v of Object.values(SNAP_HEIGHTS)) {
      expect(typeof v).toBe('string')
      expect(v).toMatch(/vh$/)
    }
  })

  it('peek < half < full (numeric order)', () => {
    const n = s => parseFloat(s)
    expect(n(SNAP_HEIGHTS.peek)).toBeLessThan(n(SNAP_HEIGHTS.half))
    expect(n(SNAP_HEIGHTS.half)).toBeLessThan(n(SNAP_HEIGHTS.full))
  })
})

// ─── sheetReducer — OPEN ─────────────────────────────────────────────────────

describe('sheetReducer — OPEN', () => {
  const BASE = { ...INITIAL_SHEET_STATE }

  it('sets open to true', () => {
    expect(sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null }).open).toBe(true)
  })

  it('sets type from action.sheetType', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'booking', payload: null })
    expect(s.type).toBe('booking')
  })

  it('stores the payload object by reference', () => {
    const p = { dateStr: '2026-06-01', entry: null }
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: p })
    expect(s.payload).toBe(p)
  })

  it('defaults snap to "full" when action.snap is omitted', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null })
    expect(s.snap).toBe('full')
  })

  it('accepts snap="peek"', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null, snap: 'peek' })
    expect(s.snap).toBe('peek')
  })

  it('accepts snap="half" explicitly', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null, snap: 'half' })
    expect(s.snap).toBe('half')
  })

  it('accepts snap="full"', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null, snap: 'full' })
    expect(s.snap).toBe('full')
  })

  it('falls back to "full" for an unknown snap value', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day', payload: null, snap: 'mega' })
    expect(s.snap).toBe('full')
  })

  it('a second OPEN replaces the previous state (no stacking)', () => {
    let s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day',     payload: { a: 1 } })
    s     = sheetReducer(s,    { type: 'OPEN', sheetType: 'booking', payload: { b: 2 } })
    expect(s.type).toBe('booking')
    expect(s.payload).toEqual({ b: 2 })
    expect(s.open).toBe(true)
  })

  it('undefined payload is stored as null', () => {
    const s = sheetReducer(BASE, { type: 'OPEN', sheetType: 'day' })
    expect(s.payload).toBeNull()
  })

  it('does not mutate the input state', () => {
    const frozen = Object.freeze({ ...INITIAL_SHEET_STATE })
    expect(() => sheetReducer(frozen, { type: 'OPEN', sheetType: 'day', payload: null }))
      .not.toThrow()
    expect(frozen.open).toBe(false)
  })
})

// ─── sheetReducer — CLOSE ────────────────────────────────────────────────────

describe('sheetReducer — CLOSE', () => {
  const OPEN_STATE = { open: true, type: 'day', payload: { x: 1 }, snap: 'full' }

  it('sets open to false', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'CLOSE' }).open).toBe(false)
  })

  it('resets type to null', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'CLOSE' }).type).toBeNull()
  })

  it('resets payload to null', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'CLOSE' }).payload).toBeNull()
  })

  it('resets snap to "full"', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'CLOSE' }).snap).toBe('full')
  })

  it('produces a state equal to INITIAL_SHEET_STATE', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'CLOSE' })).toEqual(INITIAL_SHEET_STATE)
  })

  it('closing an already-closed state returns a closed state', () => {
    const s = sheetReducer({ ...INITIAL_SHEET_STATE }, { type: 'CLOSE' })
    expect(s.open).toBe(false)
    expect(s).toEqual(INITIAL_SHEET_STATE)
  })
})

// ─── sheetReducer — SET_SNAP ─────────────────────────────────────────────────

describe('sheetReducer — SET_SNAP', () => {
  const OPEN_STATE = { open: true, type: 'day', payload: { x: 1 }, snap: 'half' }

  it('changes snap to "peek"', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'SET_SNAP', snap: 'peek' }).snap).toBe('peek')
  })

  it('changes snap to "full"', () => {
    expect(sheetReducer(OPEN_STATE, { type: 'SET_SNAP', snap: 'full' }).snap).toBe('full')
  })

  it('preserves open, type, and payload', () => {
    const s = sheetReducer(OPEN_STATE, { type: 'SET_SNAP', snap: 'full' })
    expect(s.open).toBe(true)
    expect(s.type).toBe('day')
    expect(s.payload).toBe(OPEN_STATE.payload)
  })

  it('unknown snap value returns state unchanged', () => {
    const s = sheetReducer(OPEN_STATE, { type: 'SET_SNAP', snap: 'enormous' })
    expect(s).toEqual(OPEN_STATE)
  })

  it('SET_SNAP on a closed state preserves closed=false', () => {
    const s = sheetReducer({ ...INITIAL_SHEET_STATE }, { type: 'SET_SNAP', snap: 'full' })
    expect(s.open).toBe(false)
    expect(s.snap).toBe('full')
  })
})

// ─── sheetReducer — unknown action ───────────────────────────────────────────

describe('sheetReducer — unknown action type', () => {
  it('returns the state object unchanged', () => {
    const state = { open: true, type: 'day', payload: null, snap: 'half' }
    const s = sheetReducer(state, { type: 'SOMETHING_ELSE' })
    expect(s).toEqual(state)
  })
})

// ─── slotTimeOptions — add-slot picker times (08:00 → 19:30) ──────────────────

describe('slotTimeOptions', () => {
  const times = slotTimeOptions()

  it('starts at 08:00', () => {
    expect(times[0]).toBe('08:00')
  })
  it('ends at 19:30 (20:00 excluded)', () => {
    expect(times[times.length - 1]).toBe('19:30')
    expect(times).not.toContain('20:00')
  })
  it('is in 30-minute steps', () => {
    expect(times[1]).toBe('08:30')
    expect(times[2]).toBe('09:00')
  })
  it('has 24 options (08:00–19:30 inclusive, half-hourly)', () => {
    expect(times).toHaveLength(24)
  })
})

// ─── usedTimeSet — which times the picker should flag as taken ────────────────

describe('usedTimeSet', () => {
  it('flags times of active bookings (Pending/Approved)', () => {
    const used = usedTimeSet(
      [{ status: 'Pending', time: '08:00' }, { status: 'Approved', time: '09:00' }],
      [],
    )
    expect(used.has('08:00')).toBe(true)
    expect(used.has('09:00')).toBe(true)
  })

  it('does NOT flag times of Rejected/Cancelled bookings (the slot is free again)', () => {
    const used = usedTimeSet(
      [{ status: 'Rejected', time: '10:00' }, { status: 'Cancelled', time: '11:00' }],
      [],
    )
    expect(used.has('10:00')).toBe(false)
    expect(used.has('11:00')).toBe(false)
  })

  it('flags times of any existing slot regardless of status', () => {
    const used = usedTimeSet([], [{ time: '12:00', status: 'available' }, { time: '13:00', status: 'locked' }])
    expect(used.has('12:00')).toBe(true)
    expect(used.has('13:00')).toBe(true)
  })

  it('returns an empty set for no bookings and no slots', () => {
    expect(usedTimeSet([], []).size).toBe(0)
    expect(usedTimeSet(null, null).size).toBe(0)
  })
})
