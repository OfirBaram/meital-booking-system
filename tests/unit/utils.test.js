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

const MOCK_PHONE_TEST = '0500000000'
function isValidPhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits === MOCK_PHONE_TEST) return true
  return /^05[0-9]{8}$/.test(digits)
}

function isValidName(n) {
  return n.trim().length >= 2
}

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : raw
}

function _jerusalemOffset(date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset',
  }).formatToParts(date)
  const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || ''
  const m  = tz.match(/GMT([+-])(\d+)/)
  if (!m) return '+03:00'
  return `${m[1]}${m[2].padStart(2, '0')}:00`
}

function toISO8601Jerusalem(dateStr, timeStr) {
  const d      = new Date(`${dateStr}T${timeStr}:00`)
  const offset = _jerusalemOffset(d)
  return {
    local:    `${dateStr}T${timeStr}:00`,
    timezone: 'Asia/Jerusalem',
    tagged:   `${dateStr}T${timeStr}:00${offset}`,
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
  it('accepts the QA bypass mock phone 0500000000', () => {
    expect(isValidPhone('0500000000')).toBe(true)
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
  it('tags summer timestamp with +03:00 (IDT)', () => {
    expect(result.tagged).toBe('2026-05-15T09:00:00+03:00')
  })
  it('includes the IANA timezone name for GAS DST resolution', () => {
    expect(result.timezone).toBe('Asia/Jerusalem')
  })
  it('tags winter timestamp with +02:00 (IST)', () => {
    const r2 = toISO8601Jerusalem('2026-12-01', '16:30')
    expect(r2.local).toBe('2026-12-01T16:30:00')
    expect(r2.tagged).toBe('2026-12-01T16:30:00+02:00')
  })
})

// ─── Legal modal — content resolution ────────────────────────────────────────
// Mirrors LEGAL_CONTENT from booking.js (title + body presence only)

const MODAL_CONTENT = {
  privacy:       { title: 'מדיניות פרטיות',  keywords: ['תיאום תורים', 'SMS'] },
  accessibility: { title: 'הצהרת נגישות', keywords: ['WCAG'] },
}

describe('Legal modal — content resolution', () => {
  it('privacy key has the correct Hebrew title', () => {
    expect(MODAL_CONTENT.privacy.title).toBe('מדיניות פרטיות')
  })
  it('accessibility key has the correct Hebrew title', () => {
    expect(MODAL_CONTENT.accessibility.title).toBe('הצהרת נגישות')
  })
  it('unknown key resolves to undefined (falsy)', () => {
    expect(MODAL_CONTENT['unknown']).toBeUndefined()
  })
  it('privacy content references SMS verification', () => {
    expect(MODAL_CONTENT.privacy.keywords).toContain('SMS')
  })
  it('privacy content references appointment scheduling (תיאום תורים)', () => {
    expect(MODAL_CONTENT.privacy.keywords).toContain('תיאום תורים')
  })
  it('accessibility content references WCAG standard', () => {
    expect(MODAL_CONTENT.accessibility.keywords).toContain('WCAG')
  })
})

// ─── Legal modal — open/close state logic ─────────────────────────────────────
// Mirrors the pure state transitions in openModal() / closeModal() from booking.js

function makeModalState() { return { open: false } }
function openModalPure(key, state) {
  if (MODAL_CONTENT[key]) state.open = true
}
function closeModalPure(state) { state.open = false }

describe('Legal modal — open/close state', () => {
  it('openModal transitions state from closed → open for privacy', () => {
    const s = makeModalState()
    openModalPure('privacy', s)
    expect(s.open).toBe(true)
  })
  it('openModal transitions state from closed → open for accessibility', () => {
    const s = makeModalState()
    openModalPure('accessibility', s)
    expect(s.open).toBe(true)
  })
  it('openModal with an unknown key does NOT open the modal', () => {
    const s = makeModalState()
    openModalPure('unknown', s)
    expect(s.open).toBe(false)
  })
  it('closeModal transitions state from open → closed', () => {
    const s = makeModalState()
    s.open = true
    closeModalPure(s)
    expect(s.open).toBe(false)
  })
  it('closeModal on an already-closed modal is a no-op', () => {
    const s = makeModalState()
    closeModalPure(s)
    expect(s.open).toBe(false)
  })
  it('open → close → open cycle ends in open state', () => {
    const s = makeModalState()
    openModalPure('privacy', s)
    closeModalPure(s)
    openModalPure('accessibility', s)
    expect(s.open).toBe(true)
  })
})

// ─── sanitize (XSS escaping) ──────────────────────────────────────────────────
// Mirrors sanitize() from frontend/booking.js

const _ESC_T = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }
function sanitize(str) {
  return String(str).replace(/[<>&"']/g, c => _ESC_T[c]).slice(0, 200)
}

describe('sanitize', () => {
  it('escapes < and >', () => {
    expect(sanitize('<script>')).toBe('&lt;script&gt;')
  })
  it('escapes ampersand', () => {
    expect(sanitize('a & b')).toBe('a &amp; b')
  })
  it('escapes double quotes', () => {
    expect(sanitize('"hello"')).toBe('&quot;hello&quot;')
  })
  it("escapes single quotes", () => {
    expect(sanitize("it's fine")).toBe("it&#39;s fine")
  })
  it('passes clean Hebrew text unchanged', () => {
    expect(sanitize('נועה כהן')).toBe('נועה כהן')
  })
  it('truncates strings longer than 200 chars', () => {
    expect(sanitize('a'.repeat(300)).length).toBe(200)
  })
  it('coerces non-strings to string', () => {
    expect(sanitize(123)).toBe('123')
  })
  it('leaves a clean phone number unchanged', () => {
    expect(sanitize('050-1234567')).toBe('050-1234567')
  })
  it('neutralises a classic XSS payload', () => {
    expect(sanitize('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;')
  })
})
// ─── _calMonthKey cache logic ─────────────────────────────────────────────────
// Mirrors the renderCalendar() early-return guard from frontend/booking.js

function makeCalState(year, month, selDate = null) {
  return { year, month, selDate }
}

function isMonthCached(cacheKey, state) {
  return cacheKey === `${state.year}-${state.month}`
}

describe('renderCalendar — same-month cache guard', () => {
  it('returns true when year and month match the cache key', () => {
    const s = makeCalState(2026, 4) // month is 0-indexed (April)
    expect(isMonthCached('2026-4', s)).toBe(true)
  })
  it('returns false when month changes (navigation forward)', () => {
    const s = makeCalState(2026, 5)
    expect(isMonthCached('2026-4', s)).toBe(false)
  })
  it('returns false when year changes', () => {
    const s = makeCalState(2027, 4)
    expect(isMonthCached('2026-4', s)).toBe(false)
  })
  it('cache key format matches `${year}-${month}` (not padded)', () => {
    const s = makeCalState(2026, 0)
    expect(isMonthCached('2026-0', s)).toBe(true)
    expect(isMonthCached('2026-00', s)).toBe(false)
  })
  it('after a month change the new key replaces the old one', () => {
    let cacheKey = '2026-4'
    const s = makeCalState(2026, 5)
    expect(isMonthCached(cacheKey, s)).toBe(false)
    cacheKey = `${s.year}-${s.month}` // simulate _calMonthKey = monthKey
    expect(isMonthCached(cacheKey, s)).toBe(true)
  })
})

// ─── prefetchedMonths guard (isMonthPrefetched) ───────────────────────────────
// Mirrors the State.prefetchedMonths.has() check in handleNext step 1

function isMonthPrefetched(prefetchedMonths, year, month) {
  return prefetchedMonths.has(`${year}-${month}`)
}

describe('handleNext step 1 — prefetch cache hit', () => {
  it('detects a cached month', () => {
    const set = new Set(['2026-5'])
    expect(isMonthPrefetched(set, 2026, 5)).toBe(true)
  })
  it('detects a missing month (shows skeleton)', () => {
    const set = new Set(['2026-4'])
    expect(isMonthPrefetched(set, 2026, 5)).toBe(false)
  })
  it('empty set always misses', () => {
    expect(isMonthPrefetched(new Set(), 2026, 5)).toBe(false)
  })
  it('set with multiple months hits the correct one', () => {
    const set = new Set(['2026-3', '2026-4', '2026-5'])
    expect(isMonthPrefetched(set, 2026, 4)).toBe(true)
    expect(isMonthPrefetched(set, 2026, 6)).toBe(false)
  })
})
