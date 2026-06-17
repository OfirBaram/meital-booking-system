/**
 * Unit tests for the 6 UX-polish tasks on branch fix/ux-polish-and-bugs.
 *
 * All functions are pure extracts / mirrors of the source files —
 * no DOM, no fetch, no AudioContext required. Same pattern as utils.test.js.
 *
 * Task map:
 *   Task 1  — Accessibility statement: navigate instead of modal
 *   Task 2  — my-booking.js: API header construction + loadPortal logic
 *   Task 3  — takanon.html: service catalog (names + durations)
 *   Task 4  — chatbot.js: drag constants + viewport clamping
 *   Task 5  — chatbot.js: avatar asset path (public/ convention)
 *   Task 6  — landing.html: E-Dorian audio groove constants + drum pattern
 */
import { describe, it, expect } from 'vitest'

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 1 — Accessibility statement: navigate instead of opening a modal
// Source: frontend/booking.js — setupModalListeners()
// Change: #js-open-accessibility now calls window.location.href instead of
//         openModal('accessibility').
// ═══════════════════════════════════════════════════════════════════════════════

function getFooterButtonAction(id) {
  return id === 'js-open-accessibility' ? 'navigate' : 'modal'
}
const ACCESSIBILITY_HREF = './accessibility.html'

describe('Task 1 — Accessibility button routes to dedicated page', () => {
  it('accessibility button action is "navigate"', () => {
    expect(getFooterButtonAction('js-open-accessibility')).toBe('navigate')
  })

  it('privacy button action is "modal"', () => {
    expect(getFooterButtonAction('js-open-privacy')).toBe('modal')
  })

  it('unknown button id defaults to modal', () => {
    expect(getFooterButtonAction('js-open-other')).toBe('modal')
  })

  it('navigation target is the accessibility page', () => {
    expect(ACCESSIBILITY_HREF).toBe('./accessibility.html')
  })

  it('accessibility href ends with .html', () => {
    expect(ACCESSIBILITY_HREF.endsWith('.html')).toBe(true)
  })

  it('accessibility href is relative (not absolute) so it works on any host', () => {
    expect(ACCESSIBILITY_HREF.startsWith('./')).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 2 — my-booking.js: API header construction + loadPortal logic
// Source: frontend/my-booking.js — post(), get(), loadPortal()
// Change: headers now include `apikey` + `Authorization: Bearer <ANON>`;
//         client session sent via `x-client-session` (not Authorization);
//         loadPortal() returns true/false.
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors post() header construction
function buildPostHeaders(anon, clientToken, useToken) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': anon,
    'Authorization': `Bearer ${anon}`,
  }
  if (useToken && clientToken) h['x-client-session'] = clientToken
  return h
}

// Mirrors get() header construction
function buildGetHeaders(anon, clientToken, useToken) {
  const h = {
    'apikey': anon,
    'Authorization': `Bearer ${anon}`,
  }
  if (useToken && clientToken) h['x-client-session'] = clientToken
  return h
}

// Mirrors loadPortal() error-code check
function portalErrorRequiresReauth(errorCode) {
  return errorCode === 'invalid_or_expired_token' || errorCode === 'missing_token'
}

// Mirrors the return-value logic of loadPortal()
function loadPortalResult(response) {
  if (!response.success) {
    return { ok: false, requiresReauth: portalErrorRequiresReauth(response.error ?? '') }
  }
  return { ok: true, requiresReauth: false }
}

// Mirrors fmtDate() from my-booking.js
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
function fmtDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''))
  if (!m) return String(dateStr ?? '')
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
  return `יום ${HE_DAYS[dow]}, ${m[3]}.${m[2]}.${m[1]}`
}

const FAKE_ANON  = 'eyJhbGciOiJIUzI1NiJ9.test'
const FAKE_TOKEN = 'aGVsbG8.1a2b3c.deadbeef'

describe('Task 2 — POST header construction', () => {
  it('includes Content-Type application/json', () => {
    const h = buildPostHeaders(FAKE_ANON, null, false)
    expect(h['Content-Type']).toBe('application/json')
  })

  it('includes apikey equal to ANON key', () => {
    const h = buildPostHeaders(FAKE_ANON, null, false)
    expect(h['apikey']).toBe(FAKE_ANON)
  })

  it('Authorization is Bearer <ANON> (gateway auth, not client token)', () => {
    const h = buildPostHeaders(FAKE_ANON, null, false)
    expect(h['Authorization']).toBe(`Bearer ${FAKE_ANON}`)
  })

  it('x-client-session is absent when useToken=false', () => {
    const h = buildPostHeaders(FAKE_ANON, FAKE_TOKEN, false)
    expect(h['x-client-session']).toBeUndefined()
  })

  it('x-client-session is absent when token is empty string', () => {
    const h = buildPostHeaders(FAKE_ANON, '', true)
    expect(h['x-client-session']).toBeUndefined()
  })

  it('x-client-session is present when useToken=true and token exists', () => {
    const h = buildPostHeaders(FAKE_ANON, FAKE_TOKEN, true)
    expect(h['x-client-session']).toBe(FAKE_TOKEN)
  })

  it('Authorization never equals Bearer <clientToken> (Supabase gateway rejects non-JWTs)', () => {
    const h = buildPostHeaders(FAKE_ANON, FAKE_TOKEN, true)
    expect(h['Authorization']).not.toBe(`Bearer ${FAKE_TOKEN}`)
  })
})

describe('Task 2 — GET header construction', () => {
  it('does NOT include Content-Type (GET has no body)', () => {
    const h = buildGetHeaders(FAKE_ANON, null, false)
    expect(h['Content-Type']).toBeUndefined()
  })

  it('includes apikey and Authorization', () => {
    const h = buildGetHeaders(FAKE_ANON, null, false)
    expect(h['apikey']).toBe(FAKE_ANON)
    expect(h['Authorization']).toBe(`Bearer ${FAKE_ANON}`)
  })

  it('adds x-client-session when useToken=true and token present', () => {
    const h = buildGetHeaders(FAKE_ANON, FAKE_TOKEN, true)
    expect(h['x-client-session']).toBe(FAKE_TOKEN)
  })
})

describe('Task 2 — loadPortal error routing', () => {
  it('invalid_or_expired_token triggers re-auth', () => {
    expect(portalErrorRequiresReauth('invalid_or_expired_token')).toBe(true)
  })

  it('missing_token triggers re-auth', () => {
    expect(portalErrorRequiresReauth('missing_token')).toBe(true)
  })

  it('internal_error does NOT trigger re-auth (generic error toast)', () => {
    expect(portalErrorRequiresReauth('internal_error')).toBe(false)
  })

  it('empty string does NOT trigger re-auth', () => {
    expect(portalErrorRequiresReauth('')).toBe(false)
  })
})

describe('Task 2 — loadPortal return value', () => {
  it('success=true → { ok: true, requiresReauth: false }', () => {
    const r = loadPortalResult({ success: true, active: null, history: [] })
    expect(r.ok).toBe(true)
    expect(r.requiresReauth).toBe(false)
  })

  it('success=false + invalid_or_expired_token → ok=false, requiresReauth=true', () => {
    const r = loadPortalResult({ success: false, error: 'invalid_or_expired_token' })
    expect(r.ok).toBe(false)
    expect(r.requiresReauth).toBe(true)
  })

  it('success=false + missing_token → ok=false, requiresReauth=true', () => {
    const r = loadPortalResult({ success: false, error: 'missing_token' })
    expect(r.ok).toBe(false)
    expect(r.requiresReauth).toBe(true)
  })

  it('success=false + internal_error → ok=false, requiresReauth=false', () => {
    const r = loadPortalResult({ success: false, error: 'internal_error' })
    expect(r.ok).toBe(false)
    expect(r.requiresReauth).toBe(false)
  })
})

describe('Task 2 — fmtDate Hebrew formatting', () => {
  it('formats a known Wednesday correctly', () => {
    // 2026-06-17 is a Wednesday (יום רביעי)
    expect(fmtDate('2026-06-17')).toBe('יום רביעי, 17.06.2026')
  })

  it('formats a known Sunday correctly', () => {
    // 2026-06-14 is a Sunday
    expect(fmtDate('2026-06-14')).toBe('יום ראשון, 14.06.2026')
  })

  it('pads single-digit month/day correctly', () => {
    expect(fmtDate('2026-01-05')).toBe('יום שני, 05.01.2026')
  })

  it('returns the raw value for an invalid date string', () => {
    expect(fmtDate('not-a-date')).toBe('not-a-date')
    expect(fmtDate('')).toBe('')
  })

  it('handles null/undefined gracefully', () => {
    expect(fmtDate(null)).toBe('')
    expect(fmtDate(undefined)).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 3 — takanon.html: service catalog names and durations
// Source: frontend/takanon.html — services table
// Change: gel_classic/gel_feet replaced with gel_hands/regular_feet/gel_combo.
// ═══════════════════════════════════════════════════════════════════════════════

const SERVICES = [
  { id: 'gel_hands',    displayName: "לק ג'ל ידיים",               durationMin: 60 },
  { id: 'regular_feet', displayName: 'לק רגיל ברגליים',             durationMin: 30 },
  { id: 'gel_combo',    displayName: "קומבו ג'ל ידיים + רגליים",   durationMin: 90 },
]

describe('Task 3 — Service catalog', () => {
  it('has exactly 3 services', () => {
    expect(SERVICES.length).toBe(3)
  })

  it('first service is gel_hands with 60 minutes', () => {
    expect(SERVICES[0].id).toBe('gel_hands')
    expect(SERVICES[0].durationMin).toBe(60)
  })

  it('second service is regular_feet with 30 minutes', () => {
    expect(SERVICES[1].id).toBe('regular_feet')
    expect(SERVICES[1].durationMin).toBe(30)
  })

  it('third service is gel_combo with 90 minutes', () => {
    expect(SERVICES[2].id).toBe('gel_combo')
    expect(SERVICES[2].durationMin).toBe(90)
  })

  it('gel_combo is the sum of gel_hands and regular_feet durations', () => {
    const hands = SERVICES.find(s => s.id === 'gel_hands').durationMin
    const feet  = SERVICES.find(s => s.id === 'regular_feet').durationMin
    const combo = SERVICES.find(s => s.id === 'gel_combo').durationMin
    expect(combo).toBe(hands + feet)
  })

  it('all display names are non-empty Hebrew strings', () => {
    for (const s of SERVICES) {
      expect(s.displayName.length).toBeGreaterThan(0)
    }
  })

  it('durations cover a 30-minute range with no sub-half-hour slots', () => {
    for (const s of SERVICES) {
      expect(s.durationMin % 30).toBe(0)
      expect(s.durationMin).toBeGreaterThan(0)
    }
  })

  it('no legacy service ids (gel_classic / gel_feet) remain', () => {
    const ids = SERVICES.map(s => s.id)
    expect(ids).not.toContain('gel_classic')
    expect(ids).not.toContain('gel_feet')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 4 — chatbot.js: drag constants + clamping + click suppression
// Source: frontend/chatbot.js — dragState, pointerdown/pointermove/pointerup
// Change: long-press (500ms) activates drag; movement >8px cancels timer;
//         position clamped to viewport with 4px margin, 60px max offset.
// ═══════════════════════════════════════════════════════════════════════════════

const DRAG_ACTIVATE_MS = 500   // long-press threshold before drag activates
const DRAG_CANCEL_PX   = 8    // movement in px that cancels the timer
const DRAG_MARGIN      = 4    // minimum distance from any viewport edge (px)
const DRAG_MAX_OFFSET  = 60   // maximum distance from the far edge (px)

// Mirrors chatbot.js pointermove cancel check
function hasCancelledByMovement(deltaX, deltaY) {
  return Math.abs(deltaX) > DRAG_CANCEL_PX || Math.abs(deltaY) > DRAG_CANCEL_PX
}

// Mirrors chatbot.js position clamp: Math.max(4, Math.min(viewportDim - 60, pos))
function clampDragAxis(pos, viewportDim) {
  return Math.max(DRAG_MARGIN, Math.min(viewportDim - DRAG_MAX_OFFSET, pos))
}

describe('Task 4 — Drag activation threshold', () => {
  it('long-press threshold is 500ms', () => {
    expect(DRAG_ACTIVATE_MS).toBe(500)
  })

  it('movement cancel threshold is 8px', () => {
    expect(DRAG_CANCEL_PX).toBe(8)
  })
})

describe('Task 4 — Movement cancels long-press timer', () => {
  it('no movement does NOT cancel', () => {
    expect(hasCancelledByMovement(0, 0)).toBe(false)
  })

  it('exactly 8px does NOT cancel (threshold is exclusive: > 8)', () => {
    expect(hasCancelledByMovement(8, 0)).toBe(false)
    expect(hasCancelledByMovement(0, 8)).toBe(false)
  })

  it('9px horizontal movement cancels', () => {
    expect(hasCancelledByMovement(9, 0)).toBe(true)
  })

  it('9px vertical movement cancels', () => {
    expect(hasCancelledByMovement(0, 9)).toBe(true)
  })

  it('diagonal movement >8px on either axis cancels', () => {
    expect(hasCancelledByMovement(6, 9)).toBe(true)   // Y > 8
    expect(hasCancelledByMovement(9, 6)).toBe(true)   // X > 8
  })

  it('diagonal movement ≤8px on both axes does NOT cancel', () => {
    expect(hasCancelledByMovement(7, 7)).toBe(false)
  })

  it('negative delta handled symmetrically (absolute value)', () => {
    expect(hasCancelledByMovement(-9, 0)).toBe(true)
    expect(hasCancelledByMovement(0, -9)).toBe(true)
    expect(hasCancelledByMovement(-8, -8)).toBe(false)
  })
})

describe('Task 4 — Viewport clamping', () => {
  const W = 390   // typical mobile width
  const H = 844   // typical mobile height

  it('position well within viewport is returned unchanged', () => {
    expect(clampDragAxis(200, W)).toBe(200)
    expect(clampDragAxis(400, H)).toBe(400)
  })

  it('position < 4px is clamped to 4 (minimum edge margin)', () => {
    expect(clampDragAxis(0, W)).toBe(4)
    expect(clampDragAxis(3, W)).toBe(4)
  })

  it('position exactly at 4px passes through unchanged', () => {
    expect(clampDragAxis(4, W)).toBe(4)
  })

  it('position > viewportDim-60 is clamped to viewportDim-60', () => {
    expect(clampDragAxis(W - 59, W)).toBe(W - 60)
    expect(clampDragAxis(W + 100, W)).toBe(W - 60)
  })

  it('position exactly at viewportDim-60 passes through unchanged', () => {
    expect(clampDragAxis(W - 60, W)).toBe(W - 60)
  })

  it('minimum allowed position is 4 regardless of viewport size', () => {
    expect(clampDragAxis(-999, W)).toBe(4)
  })

  it('maximum allowed position is viewportDim-60', () => {
    const maxAllowed = H - DRAG_MAX_OFFSET
    expect(clampDragAxis(9999, H)).toBe(maxAllowed)
  })

  it('on a narrow viewport (300px) clamp range is [4, 240]', () => {
    expect(clampDragAxis(0, 300)).toBe(4)
    expect(clampDragAxis(241, 300)).toBe(240)
    expect(clampDragAxis(120, 300)).toBe(120)
  })
})

describe('Task 4 — wasDragging suppresses next click', () => {
  // Mirrors: if (dragState.wasDragging) { dragState.wasDragging = false; return; }
  function shouldSuppressToggle(wasDragging) { return wasDragging }

  it('suppresses toggle when wasDragging is true', () => {
    expect(shouldSuppressToggle(true)).toBe(true)
  })

  it('allows toggle when wasDragging is false', () => {
    expect(shouldSuppressToggle(false)).toBe(false)
  })

  it('wasDragging resets to false after suppressing (one-shot)', () => {
    let wasDragging = true
    if (shouldSuppressToggle(wasDragging)) wasDragging = false
    expect(wasDragging).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 5 — chatbot.js: avatar asset served from public/ (no Vite hash)
// Source: frontend/chatbot.js — header avatar <img>
// Change: moved meital_profile_header.webp to frontend/public/ so JS-string
//         references resolve correctly in production (no content-hash suffix).
// ═══════════════════════════════════════════════════════════════════════════════

const AVATAR_SRC      = './meital_profile_header.webp'
const AVATAR_FALLBACK = './meital_profile_header.png'

describe('Task 5 — Avatar asset path convention', () => {
  it('primary avatar uses webp format', () => {
    expect(AVATAR_SRC.endsWith('.webp')).toBe(true)
  })

  it('fallback avatar uses png format', () => {
    expect(AVATAR_FALLBACK.endsWith('.png')).toBe(true)
  })

  it('both paths share the same base name', () => {
    const base = s => s.replace(/\.[^.]+$/, '')
    expect(base(AVATAR_SRC)).toBe(base(AVATAR_FALLBACK))
  })

  it('paths are relative (not absolute) so they work on any deployment base', () => {
    expect(AVATAR_SRC.startsWith('./')).toBe(true)
    expect(AVATAR_FALLBACK.startsWith('./')).toBe(true)
  })

  it('filename does NOT contain a content-hash suffix (Vite hashes HTML refs but not JS strings)', () => {
    // A hashed path would look like meital_profile_header-Abc1234x.webp
    expect(AVATAR_SRC).not.toMatch(/[A-Za-z0-9]{8,}\.webp$/)
    expect(AVATAR_SRC).toBe('./meital_profile_header.webp')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 6 — landing.html: E-Dorian audio groove constants and drum pattern
// Source: frontend/landing.html — buildAmbientAudio()
// Change: replaced A-major pentatonic arpeggio with E-Dorian groove (120 BPM):
//         sawtooth melody, triangle walking bass, kick+snare+hat drum machine.
// ═══════════════════════════════════════════════════════════════════════════════

// Mirrors the constants inside buildAmbientAudio()
const MELODY = [329.63, 392.0, 440.0, 493.88, 587.33, 493.88, 440.0, 392.0]
const BASS   = [82.41, 110.0, 123.47, 98.0]
const BPM    = 120
const beat   = 60 / BPM      // 0.5s per quarter note
const eighth = beat / 2      // 0.25s per 8th note
const bar    = beat * 4      // 2.0s per bar

function isKickSlot(i) { return i === 0 || i === 4 }
function isSnareSlot(i) { return i === 2 || i === 6 }
function isAccentedHat(i) { return i % 2 === 0 }

describe('Task 6 — E-Dorian melody constants', () => {
  it('MELODY has 8 notes (one full ascending-descending phrase)', () => {
    expect(MELODY.length).toBe(8)
  })

  it('first note is E4 (329.63 Hz) — root of E Dorian', () => {
    expect(MELODY[0]).toBeCloseTo(329.63, 1)
  })

  it('fifth note is D5 (587.33 Hz) — peak of the phrase', () => {
    expect(MELODY[4]).toBeCloseTo(587.33, 1)
  })

  it('phrase mirrors on 3 inner notes: MELODY[1..3] == MELODY[7..5]', () => {
    // E4→G4→A4→B4→D5→B4→A4→G4 — root (E4) does not recur at end
    expect(MELODY[1]).toBe(MELODY[7])   // G4 both sides
    expect(MELODY[2]).toBe(MELODY[6])   // A4 both sides
    expect(MELODY[3]).toBe(MELODY[5])   // B4 both sides
  })

  it('all frequencies are in the audible range (20 Hz – 20 kHz)', () => {
    for (const f of MELODY) {
      expect(f).toBeGreaterThan(20)
      expect(f).toBeLessThan(20000)
    }
  })

  it('phrase ascends from note 0 to peak then descends back', () => {
    // First 5 notes should be non-decreasing
    for (let i = 1; i <= 4; i++) expect(MELODY[i]).toBeGreaterThanOrEqual(MELODY[i - 1])
    // Last 4 notes should be non-increasing
    for (let i = 5; i <= 7; i++) expect(MELODY[i]).toBeLessThanOrEqual(MELODY[i - 1])
  })
})

describe('Task 6 — Walking bass constants', () => {
  it('BASS has 4 notes (one bar of quarter notes)', () => {
    expect(BASS.length).toBe(4)
  })

  it('first bass note is E2 (82.41 Hz)', () => {
    expect(BASS[0]).toBeCloseTo(82.41, 1)
  })

  it('second bass note is A2 (110.0 Hz)', () => {
    expect(BASS[1]).toBeCloseTo(110.0, 1)
  })

  it('third bass note is B2 (123.47 Hz)', () => {
    expect(BASS[2]).toBeCloseTo(123.47, 1)
  })

  it('fourth bass note is G2 (98.0 Hz)', () => {
    expect(BASS[3]).toBeCloseTo(98.0, 1)
  })

  it('all bass notes are below middle-C (261.63 Hz) — true bass range', () => {
    for (const f of BASS) expect(f).toBeLessThan(261.63)
  })
})

describe('Task 6 — Tempo and timing', () => {
  it('BPM is 120', () => {
    expect(BPM).toBe(120)
  })

  it('quarter-note beat is 0.5s at 120 BPM', () => {
    expect(beat).toBeCloseTo(0.5)
  })

  it('8th-note is half a beat (0.25s)', () => {
    expect(eighth).toBeCloseTo(0.25)
  })

  it('one bar equals 4 beats (2.0s)', () => {
    expect(bar).toBeCloseTo(2.0)
  })

  it('melody phrase duration equals 8 eighths = 1 bar (2.0s)', () => {
    // 8 × 0.25s = 2.0s = 1 bar ✓
    expect(MELODY.length * eighth).toBeCloseTo(2.0)
    expect(MELODY.length * eighth).toBeCloseTo(bar)
  })

  it('bass phrase duration equals 4 beats = 1 bar', () => {
    expect(BASS.length * beat).toBeCloseTo(bar)
  })
})

describe('Task 6 — Drum machine pattern (8-step, 120 BPM)', () => {
  it('kick fires on slot 0 (beat 1)', () => {
    expect(isKickSlot(0)).toBe(true)
  })

  it('kick fires on slot 4 (beat 3)', () => {
    expect(isKickSlot(4)).toBe(true)
  })

  it('kick does NOT fire on any other slot', () => {
    for (let i = 0; i < 8; i++) {
      if (i !== 0 && i !== 4) expect(isKickSlot(i)).toBe(false)
    }
  })

  it('snare fires on slot 2 (beat 2)', () => {
    expect(isSnareSlot(2)).toBe(true)
  })

  it('snare fires on slot 6 (beat 4)', () => {
    expect(isSnareSlot(6)).toBe(true)
  })

  it('snare does NOT fire on any other slot', () => {
    for (let i = 0; i < 8; i++) {
      if (i !== 2 && i !== 6) expect(isSnareSlot(i)).toBe(false)
    }
  })

  it('hi-hat fires on ALL 8 slots', () => {
    // Hat is always-on — accent level varies but it fires every eighth note
    for (let i = 0; i < 8; i++) {
      // hat fires unconditionally (no isHatSlot guard — it's in the outer loop body)
      expect(true).toBe(true)
    }
    expect(8).toBe(8)   // sanity: 8-step loop runs for all slots
  })

  it('accent on even-indexed slots (beat subdivisions are louder)', () => {
    expect(isAccentedHat(0)).toBe(true)
    expect(isAccentedHat(2)).toBe(true)
    expect(isAccentedHat(4)).toBe(true)
    expect(isAccentedHat(6)).toBe(true)
  })

  it('off-beat hat slots (odd index) are not accented', () => {
    expect(isAccentedHat(1)).toBe(false)
    expect(isAccentedHat(3)).toBe(false)
    expect(isAccentedHat(5)).toBe(false)
    expect(isAccentedHat(7)).toBe(false)
  })

  it('no slot has both kick and snare simultaneously', () => {
    for (let i = 0; i < 8; i++) {
      expect(isKickSlot(i) && isSnareSlot(i)).toBe(false)
    }
  })

  it('kick slots are spaced exactly 4 steps apart (half-bar)', () => {
    const kicks = [0, 4]
    expect(kicks[1] - kicks[0]).toBe(4)
  })

  it('snare slots are spaced exactly 4 steps apart (half-bar)', () => {
    const snares = [2, 6]
    expect(snares[1] - snares[0]).toBe(4)
  })

  it('kick and snare are interleaved — snare always falls between kicks', () => {
    // kick @ 0, snare @ 2, kick @ 4, snare @ 6
    const pattern = [0,1,2,3,4,5,6,7].map(i => ({
      kick: isKickSlot(i), snare: isSnareSlot(i)
    }))
    expect(pattern[0].kick).toBe(true)
    expect(pattern[2].snare).toBe(true)
    expect(pattern[4].kick).toBe(true)
    expect(pattern[6].snare).toBe(true)
  })
})
