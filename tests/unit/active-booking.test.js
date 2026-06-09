/**
 * tests/unit/active-booking.test.js
 *
 * Unit tests for the check-active-booking logic.
 * Mirrors the filtering rule: only 'Pending' and 'Approved' appointments
 * count as active and block a new booking.  'Cancelled' and 'Rejected'
 * must NOT block — this is the root fix for the bug where admin-cancelled
 * Pending bookings prevented the customer from re-booking.
 */
import { describe, it, expect } from 'vitest'

// ── Mirror: the exact filter used in check-active-booking/index.ts ────────────
// .in('status', ['Pending', 'Approved'])
// The bookings_view applies initcap() so DB 'pending'/'approved' become
// 'Pending'/'Approved'.  The filter matches those Capitalized values.

const ACTIVE_STATUSES = new Set(['Pending', 'Approved'])

function isActiveBooking(row) {
  return ACTIVE_STATUSES.has(row.status)
}

function findActiveBooking(rows) {
  return rows.find(isActiveBooking) ?? null
}

// ─── isActiveBooking ──────────────────────────────────────────────────────────

describe('isActiveBooking()', () => {
  it('returns true for Pending', () => {
    expect(isActiveBooking({ status: 'Pending' })).toBe(true)
  })

  it('returns true for Approved', () => {
    expect(isActiveBooking({ status: 'Approved' })).toBe(true)
  })

  it('returns false for Cancelled — the bug case', () => {
    expect(isActiveBooking({ status: 'Cancelled' })).toBe(false)
  })

  it('returns false for Rejected', () => {
    expect(isActiveBooking({ status: 'Rejected' })).toBe(false)
  })

  it('returns false for lowercase cancelled (should never happen via view, defensive)', () => {
    expect(isActiveBooking({ status: 'cancelled' })).toBe(false)
  })

  it('returns false for unknown status', () => {
    expect(isActiveBooking({ status: 'Unknown' })).toBe(false)
  })
})

// ─── findActiveBooking ────────────────────────────────────────────────────────

describe('findActiveBooking()', () => {
  it('returns null for empty list', () => {
    expect(findActiveBooking([])).toBeNull()
  })

  it('returns null when only Cancelled bookings exist — the bug scenario', () => {
    const rows = [
      { id: 'a', status: 'Cancelled', date: '2026-06-11', time: '10:00' },
      { id: 'b', status: 'Cancelled', date: '2026-06-12', time: '11:00' },
    ]
    expect(findActiveBooking(rows)).toBeNull()
  })

  it('returns null when only Rejected bookings exist', () => {
    const rows = [
      { id: 'a', status: 'Rejected', date: '2026-06-11', time: '10:00' },
    ]
    expect(findActiveBooking(rows)).toBeNull()
  })

  it('returns null for a mix of Cancelled and Rejected (no active)', () => {
    const rows = [
      { id: 'a', status: 'Cancelled', date: '2026-06-11', time: '10:00' },
      { id: 'b', status: 'Rejected',  date: '2026-06-10', time: '09:00' },
    ]
    expect(findActiveBooking(rows)).toBeNull()
  })

  it('returns the Pending row', () => {
    const rows = [{ id: 'x', status: 'Pending', date: '2026-06-15', time: '12:00' }]
    expect(findActiveBooking(rows)?.id).toBe('x')
  })

  it('returns the Approved row', () => {
    const rows = [{ id: 'y', status: 'Approved', date: '2026-06-15', time: '14:00' }]
    expect(findActiveBooking(rows)?.id).toBe('y')
  })

  it('finds active booking even when mixed with Cancelled history', () => {
    const rows = [
      { id: 'old', status: 'Cancelled', date: '2026-05-01', time: '09:00' },
      { id: 'new', status: 'Pending',   date: '2026-06-15', time: '10:00' },
    ]
    expect(findActiveBooking(rows)?.id).toBe('new')
  })
})

// ─── state machine valid transitions (mirrors change_appointment_status SQL) ──

const VALID_TRANSITIONS = {
  pending:  ['approved', 'rejected', 'cancelled'],
  approved: ['cancelled'],
}

function isValidTransition(from, to) {
  return (VALID_TRANSITIONS[from] ?? []).includes(to)
}

describe('isValidTransition() — mirrors change_appointment_status SQL', () => {
  it('pending → approved is valid', () => {
    expect(isValidTransition('pending', 'approved')).toBe(true)
  })

  it('pending → rejected is valid', () => {
    expect(isValidTransition('pending', 'rejected')).toBe(true)
  })

  it('pending → cancelled is valid — the bug fix', () => {
    expect(isValidTransition('pending', 'cancelled')).toBe(true)
  })

  it('approved → cancelled is valid', () => {
    expect(isValidTransition('approved', 'cancelled')).toBe(true)
  })

  it('approved → approved is invalid', () => {
    expect(isValidTransition('approved', 'approved')).toBe(false)
  })

  it('cancelled → anything is invalid (terminal state)', () => {
    expect(isValidTransition('cancelled', 'pending')).toBe(false)
    expect(isValidTransition('cancelled', 'approved')).toBe(false)
  })

  it('rejected → anything is invalid (terminal state)', () => {
    expect(isValidTransition('rejected', 'cancelled')).toBe(false)
  })

  it('unknown status → anything is invalid', () => {
    expect(isValidTransition('unknown', 'approved')).toBe(false)
  })
})
