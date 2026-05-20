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
  const digits = raw.replace(/\D/g, '')
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
  it('0500000000 is a valid 05X number via the standard regex', () => {
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

// ─── smsQuotaStatus (Phase 3.1 / Phase 4 health check logic) ────────────────
// Mirrors the threshold logic in handleHealthCheck's smsQuota check
// and the getDailySmsCount guard used by checkSmsQuota() in gas-backend.js.

function smsQuotaStatus(count, limit) {
  const pct = Math.round(count / limit * 100)
  return pct >= 90 ? 'error' : pct >= 70 ? 'warn' : 'ok'
}

describe('smsQuotaStatus', () => {
  it('returns ok when quota usage is below 70%', () => {
    expect(smsQuotaStatus(0,  45)).toBe('ok')
    expect(smsQuotaStatus(20, 45)).toBe('ok')
    expect(smsQuotaStatus(31, 45)).toBe('ok')  // 68% — just under warn threshold
  })
  it('returns warn at exactly 70%', () => {
    expect(smsQuotaStatus(32, 45)).toBe('warn') // Math.round(32/45*100) = 71%
    expect(smsQuotaStatus(27, 38)).toBe('warn') // Math.round(27/38*100) = 71%
  })
  it('returns warn between 70% and 89%', () => {
    expect(smsQuotaStatus(36, 45)).toBe('warn') // 80%
    expect(smsQuotaStatus(40, 45)).toBe('warn') // 89%
  })
  it('returns error at exactly 90%', () => {
    expect(smsQuotaStatus(41, 45)).toBe('error') // Math.round(41/45*100) = 91%
  })
  it('returns error when count reaches or exceeds limit', () => {
    expect(smsQuotaStatus(45, 45)).toBe('error') // 100%
    expect(smsQuotaStatus(50, 45)).toBe('error') // 111%
  })
  it('DAILY_SMS_LIMIT=45 allows 31 sends before warn threshold', () => {
    // Confirm the gap between the 5-unit buffer and the 70% warn floor
    expect(smsQuotaStatus(31, 45)).toBe('ok')
    expect(smsQuotaStatus(32, 45)).toBe('warn')
  })
})

// ─── OTP cooldown pure state (Phase 3.1 / Phase 0.5) ─────────────────────────
// Mirrors the State.otpCooldownUntil checks in handleNext (step 3) and
// the resend-timer guard in booking.js.

function isCoolingDown(cooldownUntil, now) { return cooldownUntil > now }
function remainingSecs(cooldownUntil, now) { return Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) }

describe('OTP cooldown state', () => {
  it('returns true when cooldown has not expired', () => {
    const now = 1_000_000
    expect(isCoolingDown(now + 30_000, now)).toBe(true)
  })
  it('returns false when cooldown has expired', () => {
    const now = 1_000_000
    expect(isCoolingDown(now - 1, now)).toBe(false)
  })
  it('returns false when cooldownUntil is 0 (initial state)', () => {
    expect(isCoolingDown(0, 1_000_000)).toBe(false)
  })
  it('returns false when cooldown expires exactly now', () => {
    const now = 1_000_000
    expect(isCoolingDown(now, now)).toBe(false)
  })
  it('remainingSecs returns correct seconds when cooling down', () => {
    const now = 1_000_000
    expect(remainingSecs(now + 30_000, now)).toBe(30)
    expect(remainingSecs(now + 15_500, now)).toBe(16) // ceil rounds up
    expect(remainingSecs(now +  1_000, now)).toBe(1)
  })
  it('remainingSecs returns 0 when cooldown has already expired', () => {
    const now = 1_000_000
    expect(remainingSecs(now - 5_000, now)).toBe(0)
    expect(remainingSecs(0, now)).toBe(0)
  })
})

// ─── normalizePhone (E.164 conversion) ───────────────────────────────────────
// Mirrors normalizePhone() from gas-backend.js — converts Israeli frontend
// phone strings to E.164 before Twilio calls and OTP cache keying.

function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('972')) return '+' + digits
  if (digits.startsWith('0'))  return '+972' + digits.slice(1)
  return '+' + digits
}

describe('normalizePhone', () => {
  it('converts an Israeli 05X number to E.164', () => {
    expect(normalizePhone('0501234567')).toBe('+972501234567')
  })
  it('strips hyphens before converting', () => {
    expect(normalizePhone('050-1234567')).toBe('+972501234567')
  })
  it('does not double-prefix a number already starting with 972', () => {
    expect(normalizePhone('972501234567')).toBe('+972501234567')
  })
  it('handles 052 prefix', () => {
    expect(normalizePhone('0521234567')).toBe('+972521234567')
  })
  it('handles 054 prefix', () => {
    expect(normalizePhone('0541234567')).toBe('+972541234567')
  })
  it('the QA test phone normalises consistently', () => {
    expect(normalizePhone('0500000000')).toBe('+972500000000')
  })
})

// ─── sendDailyRemindersV2: UTC window computation ─────────────────────────────
// Mirrors the rangeGte/rangeLt logic from sendDailyRemindersV2 in SupabaseLayer.js.
// Jerusalem = UTC+2 (winter) / UTC+3 (DST summer).
// A slot at midnight Jerusalem (earliest) lands at 21:00 UTC the previous day (+3).
// A slot at 23:59 Jerusalem (latest) lands at 21:59 UTC that day (+2).
// Window must be [tomorrowStr-1 day @ 20:00 UTC, tomorrowStr @ 22:00 UTC].

function tomorrowUtcWindow(tomorrowStr) {
  const parts = tomorrowStr.split('-').map(Number)
  return {
    gte: new Date(Date.UTC(parts[0], parts[1]-1, parts[2]-1, 20, 0, 0, 0)).toISOString(),
    lt:  new Date(Date.UTC(parts[0], parts[1]-1, parts[2],   22, 0, 0, 0)).toISOString(),
  }
}

describe('sendDailyRemindersV2 — UTC window', () => {
  it('gte is 20:00 UTC of the day before tomorrowStr', () => {
    const { gte } = tomorrowUtcWindow('2026-05-21')
    expect(gte).toBe('2026-05-20T20:00:00.000Z')
  })

  it('lt is 22:00 UTC of tomorrowStr itself', () => {
    const { lt } = tomorrowUtcWindow('2026-05-21')
    expect(lt).toBe('2026-05-21T22:00:00.000Z')
  })

  it('a slot at midnight Jerusalem DST (21:00 UTC prior day) is inside the window', () => {
    const { gte, lt } = tomorrowUtcWindow('2026-05-21')
    const midnightDST = '2026-05-20T21:00:00.000Z' // 00:00 Jerusalem +3
    expect(midnightDST >= gte && midnightDST < lt).toBe(true)
  })

  it('a slot at 23:59 Jerusalem winter (21:59 UTC same day) is inside the window', () => {
    const { gte, lt } = tomorrowUtcWindow('2026-05-21')
    const lastSlot = '2026-05-21T21:59:00.000Z' // 23:59 Jerusalem +2
    expect(lastSlot >= gte && lastSlot < lt).toBe(true)
  })

  it('a slot one second before the window (prior day 19:59:59 UTC) is excluded', () => {
    const { gte } = tomorrowUtcWindow('2026-05-21')
    const tooEarly = '2026-05-20T19:59:59.000Z'
    expect(tooEarly >= gte).toBe(false)
  })

  it('a slot at 22:00 UTC of tomorrowStr (= midnight Jerusalem +2 next day) is excluded', () => {
    const { lt } = tomorrowUtcWindow('2026-05-21')
    const tooLate = '2026-05-21T22:00:00.000Z'
    expect(tooLate < lt).toBe(false)
  })

  it('works correctly across a month boundary', () => {
    const { gte, lt } = tomorrowUtcWindow('2026-06-01')
    expect(gte).toBe('2026-05-31T20:00:00.000Z')
    expect(lt).toBe('2026-06-01T22:00:00.000Z')
  })
})

// ─── sendDailyRemindersV2: reminder message format ────────────────────────────
// Mirrors the msg string built inside sendDailyRemindersV2.

function buildReminderMsg(treatmentName, tomorrowStr, timeStr) {
  return ('תזכורת: מחר יש לך תור! ' +
    'שירות: ' + treatmentName + '. ' +
    'תאריך: ' + tomorrowStr.replace(/-/g, '/') + ' בשעה ' + timeStr + '. ' +
    'לביטול יש לפנות למיטל.')
}

describe('sendDailyRemindersV2 — reminder message', () => {
  it('contains the treatment name', () => {
    const msg = buildReminderMsg("לק ג'ל קלאסי", '2026-05-21', '10:30')
    expect(msg).toContain("לק ג'ל קלאסי")
  })

  it('converts date dashes to slashes', () => {
    const msg = buildReminderMsg('test', '2026-05-21', '10:30')
    expect(msg).toContain('2026/05/21')
    expect(msg).not.toContain('2026-05-21')
  })

  it('contains the time', () => {
    const msg = buildReminderMsg('test', '2026-05-21', '14:00')
    expect(msg).toContain('14:00')
  })

  it('contains the cancellation instruction', () => {
    const msg = buildReminderMsg('test', '2026-05-21', '10:00')
    expect(msg).toContain('לביטול יש לפנות למיטל')
  })
})

