/**
 * Unit tests for the pure utility functions defined in frontend/booking.js.
 *
 * These functions have zero DOM dependency and are pure transforms,
 * so they are replicated here verbatim to keep booking.js unmodified
 * (no ES module exports added to a vanilla-JS browser file).
 *
 * Maintenance rule: if a function body changes in booking.js, update
 * the copy here too — the test name references the source location.
 */
import { describe, it, expect } from 'vitest'

// ─── Mirrors of frontend/booking.js utility functions ────────────────────────

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function isValidPhone(raw) {
  return /^05[0-9]{8}$/.test(raw.replace(/\D/g, ''))
}

function isValidName(n) {
  return n.trim().length >= 2
}

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : raw
}

function toISO8601Jerusalem(dateStr, timeStr) {
  return {
    local:    `${dateStr}T${timeStr}:00`,
    timezone: 'Asia/Jerusalem',
    tagged:   `${dateStr}T${timeStr}:00+03:00`,
  }
}

// ─── addMinutes ───────────────────────────────────────────────────────────────

describe('addMinutes', () => {
  it('adds 90 min to a clean hour', () => {
    expect(addMinutes('09:00', 90)).toBe('10:30')
  })
  it('adds 120 min crossing the hour', () => {
    expect(addMinutes('10:30', 120)).toBe('12:30')
  })
  it('handles a roll that lands exactly on the hour', () => {
    expect(addMinutes('13:30', 90)).toBe('15:00')
  })
  it('pads single-digit hours with leading zero', () => {
    expect(addMinutes('08:00', 30)).toBe('08:30')
  })
  it('handles late-afternoon slots', () => {
    expect(addMinutes('16:30', 90)).toBe('18:00')
  })
  it('handles a 0-minute addition', () => {
    expect(addMinutes('12:00', 0)).toBe('12:00')
  })
})

// ─── isValidPhone ─────────────────────────────────────────────────────────────

describe('isValidPhone', () => {
  it('accepts valid Israeli mobile prefixes: 050', () => {
    expect(isValidPhone('0501234567')).toBe(true)
  })
  it('accepts valid Israeli mobile prefixes: 052', () => {
    expect(isValidPhone('0521234567')).toBe(true)
  })
  it('accepts valid Israeli mobile prefixes: 054', () => {
    expect(isValidPhone('0541234567')).toBe(true)
  })
  it('accepts numbers with a hyphen (UI display format)', () => {
    expect(isValidPhone('050-1234567')).toBe(true)
  })
  it('rejects a landline prefix (02x)', () => {
    expect(isValidPhone('0212345678')).toBe(false)
  })
  it('rejects a number that is too short', () => {
    expect(isValidPhone('050123456')).toBe(false)
  })
  it('rejects a number that is too long', () => {
    expect(isValidPhone('05012345678')).toBe(false)
  })
  it('rejects an empty string', () => {
    expect(isValidPhone('')).toBe(false)
  })
  it('rejects a non-05X prefix', () => {
    expect(isValidPhone('0601234567')).toBe(false)
  })
})

// ─── isValidName ──────────────────────────────────────────────────────────────

describe('isValidName', () => {
  it('accepts a typical Hebrew name', () => {
    expect(isValidName('נועה')).toBe(true)
  })
  it('accepts exactly 2 characters', () => {
    expect(isValidName('אב')).toBe(true)
  })
  it('rejects a single character', () => {
    expect(isValidName('נ')).toBe(false)
  })
  it('rejects an empty string', () => {
    expect(isValidName('')).toBe(false)
  })
  it('rejects whitespace-only strings (trims before counting)', () => {
    expect(isValidName('   ')).toBe(false)
  })
  it('trims surrounding spaces before counting', () => {
    expect(isValidName(' אב ')).toBe(true)
  })
})

// ─── formatPhone ──────────────────────────────────────────────────────────────

describe('formatPhone', () => {
  it('inserts hyphen after area code in a 10-digit number', () => {
    expect(formatPhone('0501234567')).toBe('050-1234567')
  })
  it('strips existing hyphen then re-formats', () => {
    expect(formatPhone('050-1234567')).toBe('050-1234567')
  })
  it('returns the raw value unchanged if not 10 digits', () => {
    expect(formatPhone('123')).toBe('123')
  })
  it('handles E.164 prefix stripped variant', () => {
    expect(formatPhone('0541234567')).toBe('054-1234567')
  })
})

// ─── toISO8601Jerusalem ───────────────────────────────────────────────────────

describe('toISO8601Jerusalem', () => {
  const result = toISO8601Jerusalem('2026-05-15', '09:00')

  it('sets the local datetime string', () => {
    expect(result.local).toBe('2026-05-15T09:00:00')
  })
  it('tags the timestamp with static +03:00 Israel offset', () => {
    expect(result.tagged).toBe('2026-05-15T09:00:00+03:00')
  })
  it('includes the IANA timezone name for GAS DST resolution', () => {
    expect(result.timezone).toBe('Asia/Jerusalem')
  })
  it('works for a different date and time', () => {
    const r2 = toISO8601Jerusalem('2026-12-01', '16:30')
    expect(r2.local).toBe('2026-12-01T16:30:00')
    expect(r2.tagged).toBe('2026-12-01T16:30:00+03:00')
  })
})
