/**
 * tests/backend_unit_tests.js
 * Unit tests for the GAS backend helper functions: _fmtDate, _fmtTime, _isoDate.
 *
 * Strategy: mirror the three helpers verbatim from gas-backend.js and provide
 * a Vitest-compatible mock of Utilities.formatDate (GAS global) backed by
 * Intl.DateTimeFormat so timezone-sensitive output matches the real GAS behaviour.
 *
 * Maintenance rule: if a helper body changes in gas-backend.js, update the
 * mirror below so tests stay accurate.
 *
 * Source: gas-backend.js lines 93-109
 */

import { describe, it, expect, vi } from 'vitest'

// ─── Mock: Utilities.formatDate ───────────────────────────────────────────────
// Reproduces GAS behaviour including the "Invalid argument: timeZone" error
// that was the root cause of the approval crash (CFG.TZ was undefined).

const Utilities = {
  formatDate(date, tz, fmt) {
    if (!tz) throw new Error('Invalid argument: timeZone')
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      year:    'numeric',
      month:   '2-digit',
      day:     '2-digit',
      hour:    '2-digit',
      minute:  '2-digit',
      hour12:  false,
    }).formatToParts(date)
    const get = t => (parts.find(p => p.type === t) || {}).value || '00'
    const hh  = get('hour') === '24' ? '00' : get('hour')
    return fmt
      .replace('yyyy', get('year'))
      .replace('MM',   get('month'))
      .replace('dd',   get('day'))
      .replace('HH',   hh)
      .replace('mm',   get('minute'))
  },
}

// ─── Mirrors of gas-backend.js helpers (lines 93-109) ────────────────────────

function _fmtDate(raw) {
  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'dd/MM/yyyy')
  const m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(raw || '').trim()
}

function _fmtTime(raw) {
  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'HH:mm')
  return String(raw || '').trim()
}

function _isoDate(raw) {
  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'yyyy-MM-dd')
  return String(raw || '').trim()
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

// 26 May 2026 at 14:30 Israel time (DST → UTC+3, so UTC 11:30)
const DATE_OBJ = new Date('2026-05-26T11:30:00Z')

// Sheets stores time-only cells as "Dec 30 1899 HH:MM" objects.
// 10:45 Israel (Dec = UTC+2, so 1899-12-30T08:45:00Z)
const SHEETS_TIME_OBJ = new Date('1899-12-30T08:45:00Z')

// Midnight UTC — notorious for off-by-one DST bugs
const MIDNIGHT_UTC = new Date('2026-05-26T00:00:00Z')

// ─── _fmtDate ─────────────────────────────────────────────────────────────────

describe('_fmtDate', () => {
  it('formats a JS Date object as dd/MM/yyyy in Israel timezone', () => {
    expect(_fmtDate(DATE_OBJ)).toBe('26/05/2026')
  })

  it('converts a YYYY-MM-DD string to dd/MM/yyyy without touching Utilities', () => {
    expect(_fmtDate('2026-05-26')).toBe('26/05/2026')
  })

  it('zero-pads day and month correctly', () => {
    expect(_fmtDate('2026-01-03')).toBe('03/01/2026')
  })

  it('midnight UTC Date: no off-by-one spill into the previous day', () => {
    // 2026-05-26T00:00Z = 03:00 Israel (DST+3) — must still be the 26th
    expect(_fmtDate(MIDNIGHT_UTC)).toBe('26/05/2026')
  })

  it('returns empty string for null', () => {
    expect(_fmtDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(_fmtDate(undefined)).toBe('')
  })

  it('returns empty string for empty string input', () => {
    expect(_fmtDate('')).toBe('')
  })

  it('passes through a dd/MM/yyyy string unchanged (already formatted)', () => {
    expect(_fmtDate('26/05/2026')).toBe('26/05/2026')
  })

  it('passes through a US-format date string unchanged (regex will not match)', () => {
    expect(_fmtDate('05/26/2026')).toBe('05/26/2026')
  })

  it('passes through an unrecognised string unchanged', () => {
    expect(_fmtDate('not-a-date')).toBe('not-a-date')
  })

  it('passes through a partial ISO string unchanged', () => {
    expect(_fmtDate('2026-05')).toBe('2026-05')
  })

  it('passes through a numeric value stringified', () => {
    expect(_fmtDate(0)).toBe('0')
  })
})

// ─── _fmtTime ─────────────────────────────────────────────────────────────────

describe('_fmtTime', () => {
  it('extracts HH:mm from a 1899-base Sheets time Date object', () => {
    // Regression: String(SHEETS_TIME_OBJ) would give "Sat Dec 30 1899 ..."
    const result = _fmtTime(SHEETS_TIME_OBJ)
    expect(result).toMatch(/^\d{2}:\d{2}$/)
    expect(result).toBe('10:45')
  })

  it('returns an HH:mm string unchanged', () => {
    expect(_fmtTime('14:30')).toBe('14:30')
  })

  it('returns zero-padded HH:mm unchanged', () => {
    expect(_fmtTime('08:05')).toBe('08:05')
  })

  it('returns empty string for null', () => {
    expect(_fmtTime(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(_fmtTime(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(_fmtTime('')).toBe('')
  })

  it('does not invoke Utilities for string input — so CFG.TZ=undefined would not crash it', () => {
    // If it called Utilities with undefined tz it would throw; no throw = safe
    expect(() => _fmtTime('10:00')).not.toThrow()
  })

  it('passes through an arbitrary string unchanged', () => {
    expect(_fmtTime('noon')).toBe('noon')
  })
})

// ─── _isoDate ─────────────────────────────────────────────────────────────────

describe('_isoDate', () => {
  it('formats a JS Date object as yyyy-MM-dd in Israel timezone', () => {
    expect(_isoDate(DATE_OBJ)).toBe('2026-05-26')
  })

  it('midnight UTC: no off-by-one to the previous day', () => {
    expect(_isoDate(MIDNIGHT_UTC)).toBe('2026-05-26')
  })

  it('returns a yyyy-MM-dd string unchanged', () => {
    expect(_isoDate('2026-05-26')).toBe('2026-05-26')
  })

  it('returns empty string for null', () => {
    expect(_isoDate(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(_isoDate(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(_isoDate('')).toBe('')
  })

  it('passes through an already-formatted dd/MM/yyyy string unchanged', () => {
    expect(_isoDate('26/05/2026')).toBe('26/05/2026')
  })

  it('passes through an arbitrary string unchanged', () => {
    expect(_isoDate('bad-date')).toBe('bad-date')
  })
})

// ─── Utilities mock regression guard ──────────────────────────────────────────
// Ensures the mock faithfully replicates the GAS "Invalid argument: timeZone"
// crash so future regressions (e.g. passing CFG.TZ again) are caught here first.

describe('Utilities.formatDate (mock behaviour)', () => {
  it('throws "Invalid argument: timeZone" when tz is null', () => {
    expect(() => Utilities.formatDate(new Date(), null, 'yyyy-MM-dd'))
      .toThrow('Invalid argument: timeZone')
  })

  it('throws "Invalid argument: timeZone" when tz is undefined', () => {
    expect(() => Utilities.formatDate(new Date(), undefined, 'yyyy-MM-dd'))
      .toThrow('Invalid argument: timeZone')
  })

  it('throws "Invalid argument: timeZone" when tz is empty string', () => {
    expect(() => Utilities.formatDate(new Date(), '', 'yyyy-MM-dd'))
      .toThrow('Invalid argument: timeZone')
  })

  it('does NOT throw with hardcoded Asia/Jerusalem', () => {
    expect(() => Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd'))
      .not.toThrow()
  })

  it('returns a string matching yyyy-MM-dd pattern', () => {
    const result = Utilities.formatDate(DATE_OBJ, 'Asia/Jerusalem', 'yyyy-MM-dd')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a string matching dd/MM/yyyy pattern', () => {
    const result = Utilities.formatDate(DATE_OBJ, 'Asia/Jerusalem', 'dd/MM/yyyy')
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })

  it('returns a string matching HH:mm pattern', () => {
    const result = Utilities.formatDate(DATE_OBJ, 'Asia/Jerusalem', 'HH:mm')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })

// ─── isAutoSmsEnabled (Auto-SMS master toggle) ────────────────────────────────
// Mirror of isAutoSmsEnabled() in gas-backend.js.
// Stored value null (unset) or 'true' → enabled; 'false' → disabled.

function isAutoSmsEnabled(storedValue) {
  return storedValue === null || storedValue === 'true';
}

describe('isAutoSmsEnabled', () => {
  it('returns true when property is null (default — never set)', () => {
    expect(isAutoSmsEnabled(null)).toBe(true);
  });

  it('returns true when property is the string "true"', () => {
    expect(isAutoSmsEnabled('true')).toBe(true);
  });

  it('returns false when property is the string "false"', () => {
    expect(isAutoSmsEnabled('false')).toBe(false);
  });
})

})
