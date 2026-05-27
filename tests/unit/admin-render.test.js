// @vitest-environment jsdom
/**
 * Unit tests for frontend/admin-render.js
 *
 * Strategy: import the exported pure functions directly, call them with fixture
 * data, and assert on the resulting HTML/DOM without any live API calls.
 * The jsdom environment provides document.createElement so renderXxx functions
 * that inject innerHTML can be exercised in full.
 *
 * Critical regression guard (rule from CLAUDE.md §16):
 *   Every render function must produce HTML with ZERO onclick= attributes.
 *   Use data-action + addEventListener instead.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  esc,
  fmtPhone,
  buildCard,
  renderDiarySlots,
  renderClientList,
  renderClientHistory,
  renderSmsLog,
  LABELS,
  STATUS_CLS,
  SB_STATUS_LABEL,
  SB_STATUS_CLS,
} from '../../frontend/admin-render.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDiv() { return document.createElement('div') }
function noOp()    { return vi.fn() }

// ─── esc ─────────────────────────────────────────────────────────────────────

describe('esc', () => {
  it('escapes < and >', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;')
  })
  it('escapes &', () => {
    expect(esc('a & b')).toBe('a &amp; b')
  })
  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;')
  })
  it("escapes single quotes", () => {
    expect(esc("it's")).toBe("it&#39;s")
  })
  it('passes clean Hebrew text unchanged', () => {
    expect(esc('מיטל')).toBe('מיטל')
  })
  it('coerces non-string to string', () => {
    expect(esc(42)).toBe('42')
  })
  it('handles null/undefined gracefully', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })
})

// ─── fmtPhone ────────────────────────────────────────────────────────────────

describe('fmtPhone', () => {
  it('strips +972 prefix and formats', () => {
    expect(fmtPhone('+972501234567')).toBe('050-123-4567')
  })
  it('formats a plain 10-digit number', () => {
    expect(fmtPhone('0501234567')).toBe('050-123-4567')
  })
  it('returns unchanged if format not recognised', () => {
    expect(fmtPhone('abc')).toBe('abc')
  })
})

// ─── buildCard ───────────────────────────────────────────────────────────────

const BOOKING_PENDING  = { id: 'uuid-1', name: 'נועה כהן', phone: '0501234567', service: 'gel_classic', serviceName: "לק ג'ל קלאסי", date: '2026-06-01', time: '10:00', status: 'Pending' }
const BOOKING_APPROVED = { ...BOOKING_PENDING, id: 'uuid-2', status: 'Approved' }
const BOOKING_REJECTED = { ...BOOKING_PENDING, id: 'uuid-3', status: 'Rejected' }

describe('buildCard — no onclick (critical regression guard)', () => {
  it('Pending card contains zero onclick= attributes', () => {
    expect(buildCard(BOOKING_PENDING)).not.toContain('onclick=')
  })
  it('Approved card contains zero onclick= attributes', () => {
    expect(buildCard(BOOKING_APPROVED)).not.toContain('onclick=')
  })
  it('Rejected card contains zero onclick= attributes', () => {
    expect(buildCard(BOOKING_REJECTED)).not.toContain('onclick=')
  })
})

describe('buildCard — data-action attributes', () => {
  it('Pending card has Approved action button', () => {
    const html = buildCard(BOOKING_PENDING)
    expect(html).toContain('data-action="Approved"')
    expect(html).toContain('data-action="Rejected"')
  })
  it('Approved card has only Cancelled action button', () => {
    const html = buildCard(BOOKING_APPROVED)
    expect(html).toContain('data-action="Cancelled"')
    expect(html).not.toContain('data-action="Approved"')
  })
  it('Rejected card has no action buttons', () => {
    const html = buildCard(BOOKING_REJECTED)
    expect(html).not.toContain('data-action="Approved"')
    expect(html).not.toContain('data-action="Rejected"')
    expect(html).not.toContain('data-action="Cancelled"')
  })
  it('all cards have SMS action button', () => {
    expect(buildCard(BOOKING_PENDING)).toContain('data-action="sms"')
    expect(buildCard(BOOKING_APPROVED)).toContain('data-action="sms"')
  })
  it('booking id is in data-id and data-booking attributes', () => {
    const html = buildCard(BOOKING_PENDING)
    expect(html).toContain('data-id="uuid-1"')
    expect(html).toContain('data-booking="uuid-1"')
  })
  it('XSS: name is escaped in output', () => {
    const b = { ...BOOKING_PENDING, name: '<b>inject</b>' }
    const html = buildCard(b)
    expect(html).not.toContain('<b>inject</b>')
    expect(html).toContain('&lt;b&gt;inject&lt;/b&gt;')
  })
})

// ─── renderDiarySlots ─────────────────────────────────────────────────────────

const DIARY_AVAILABLE = { id: 1, date: '2026-06-01', time: '10:00', status: 'available' }
const DIARY_LOCKED    = { id: 2, date: '2026-06-01', time: '12:00', status: 'locked' }
const DIARY_BOOKED    = { id: 3, date: '2026-06-01', time: '14:00', status: 'booked' }

describe('renderDiarySlots — no onclick (critical regression guard)', () => {
  it('renders zero onclick= attributes for available slot', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.innerHTML).not.toContain('onclick=')
  })
  it('renders zero onclick= for locked slot', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_LOCKED], el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.innerHTML).not.toContain('onclick=')
  })
  it('renders zero onclick= for booked (disabled) slot', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_BOOKED], el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.innerHTML).not.toContain('onclick=')
  })
})

describe('renderDiarySlots — data-action attributes', () => {
  it('available slot has toggle and delete buttons with correct data-action', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.querySelector('[data-action="toggle-diary-slot"]')).toBeTruthy()
    expect(el.querySelector('[data-action="delete-diary-slot"]')).toBeTruthy()
  })
  it('data-slot-id is set correctly on toggle button', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete: noOp() })
    const btn = el.querySelector('[data-action="toggle-diary-slot"]')
    expect(btn.dataset.slotId).toBe('1')
  })
  it('data-slot-status is set correctly on toggle button', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete: noOp() })
    const btn = el.querySelector('[data-action="toggle-diary-slot"]')
    expect(btn.dataset.slotStatus).toBe('available')
  })
  it('booked slot buttons are disabled', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_BOOKED], el, { onToggle: noOp(), onDelete: noOp() })
    const btns = el.querySelectorAll('[data-action-btn]')
    btns.forEach(b => expect(b.disabled).toBe(true))
  })
  it('available slot buttons are NOT disabled', () => {
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete: noOp() })
    const btns = el.querySelectorAll('[data-action-btn]')
    btns.forEach(b => expect(b.disabled).toBe(false))
  })
})

describe('renderDiarySlots — callback wiring', () => {
  it('clicking toggle button calls onToggle with (slotId, status)', () => {
    const onToggle = vi.fn()
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle, onDelete: noOp() })
    el.querySelector('[data-action="toggle-diary-slot"]').click()
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onToggle).toHaveBeenCalledWith(1, 'available')
  })
  it('clicking delete button calls onDelete with slotId as number', () => {
    const onDelete = vi.fn()
    const el = makeDiv()
    renderDiarySlots([DIARY_AVAILABLE], el, { onToggle: noOp(), onDelete })
    el.querySelector('[data-action="delete-diary-slot"]').click()
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith(1)
  })
})

describe('renderDiarySlots — empty state', () => {
  it('renders empty message when no slots', () => {
    const el = makeDiv()
    renderDiarySlots([], el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.textContent).toContain('אין תורים')
  })
  it('renders empty message for null', () => {
    const el = makeDiv()
    renderDiarySlots(null, el, { onToggle: noOp(), onDelete: noOp() })
    expect(el.textContent).toContain('אין תורים')
  })
})

// ─── renderClientList ─────────────────────────────────────────────────────────

const CLIENTS = [
  { phone: '0501234567', full_name: 'דנה כהן',  created_at: '2026-01-15T10:00:00+02:00' },
  { phone: '0529876543', full_name: 'רונית לוי', created_at: null },
]

describe('renderClientList — no onclick (critical regression guard)', () => {
  it('renders zero onclick= attributes', () => {
    const el = makeDiv()
    renderClientList(CLIENTS, el, { onSelect: noOp() })
    expect(el.innerHTML).not.toContain('onclick=')
  })
})

describe('renderClientList — data-action attributes', () => {
  it('each client card has data-action="select-client"', () => {
    const el = makeDiv()
    renderClientList(CLIENTS, el, { onSelect: noOp() })
    expect(el.querySelectorAll('[data-action="select-client"]').length).toBe(2)
  })
  it('data-phone is set on each card', () => {
    const el = makeDiv()
    renderClientList(CLIENTS, el, { onSelect: noOp() })
    const cards = el.querySelectorAll('[data-action="select-client"]')
    expect(cards[0].dataset.phone).toBe('0501234567')
    expect(cards[1].dataset.phone).toBe('0529876543')
  })
  it('XSS: full_name is HTML-escaped', () => {
    const el = makeDiv()
    renderClientList([{ phone: '0501111111', full_name: '<img src=x>', created_at: null }], el, { onSelect: noOp() })
    expect(el.innerHTML).not.toContain('<img')
    expect(el.innerHTML).toContain('&lt;img')
  })
})

describe('renderClientList — callback wiring', () => {
  it('clicking a card calls onSelect with the phone number', () => {
    const onSelect = vi.fn()
    const el = makeDiv()
    renderClientList(CLIENTS, el, { onSelect })
    el.querySelectorAll('[data-action="select-client"]')[0].click()
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('0501234567')
  })
})

describe('renderClientList — empty state', () => {
  it('renders empty message for empty array', () => {
    const el = makeDiv()
    renderClientList([], el, { onSelect: noOp() })
    expect(el.textContent).toContain('לא נמצאו לקוחות')
  })
})

// ─── renderClientHistory ──────────────────────────────────────────────────────

const APPOINTMENTS = [
  { id: 'a-1', date: '2026-06-01', time: '10:00', status: 'Approved',
    treatment_name: "לק ג'ל קלאסי", admin_token: null },
  { id: 'a-2', date: '2026-06-15', time: '14:00', status: 'Pending',
    treatment_name: "לק ג'ל רגליים", admin_token: 'tok-abc' },
]

describe('renderClientHistory — no onclick (critical regression guard)', () => {
  it('renders zero onclick= attributes', () => {
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision: noOp() })
    expect(el.innerHTML).not.toContain('onclick=')
  })
})

describe('renderClientHistory — data-action attributes', () => {
  it('Pending appointment has two history-decide buttons', () => {
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision: noOp() })
    const btns = el.querySelectorAll('[data-action="history-decide"]')
    expect(btns.length).toBe(2)
  })
  it('decide buttons carry correct data-decision', () => {
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision: noOp() })
    const decisions = [...el.querySelectorAll('[data-action="history-decide"]')]
      .map(b => b.dataset.decision)
    expect(decisions).toContain('Approved')
    expect(decisions).toContain('Rejected')
  })
  it('decide buttons carry data-appt-id and data-admin-token', () => {
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision: noOp() })
    const btn = el.querySelector('[data-action="history-decide"]')
    expect(btn.dataset.apptId).toBe('a-2')
    expect(btn.dataset.adminToken).toBe('tok-abc')
  })
  it('Approved appointment has no action buttons', () => {
    const el = makeDiv()
    renderClientHistory([APPOINTMENTS[0]], el, { onDecision: noOp() })
    expect(el.querySelector('[data-action="history-decide"]')).toBeNull()
  })
})

describe('renderClientHistory — callback wiring', () => {
  it('clicking Approve calls onDecision with (id, token, "Approved")', () => {
    const onDecision = vi.fn()
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision })
    const approveBtn = [...el.querySelectorAll('[data-action="history-decide"]')]
      .find(b => b.dataset.decision === 'Approved')
    approveBtn.click()
    expect(onDecision).toHaveBeenCalledOnce()
    expect(onDecision).toHaveBeenCalledWith('a-2', 'tok-abc', 'Approved')
  })
  it('clicking Reject calls onDecision with (id, token, "Rejected")', () => {
    const onDecision = vi.fn()
    const el = makeDiv()
    renderClientHistory(APPOINTMENTS, el, { onDecision })
    const rejectBtn = [...el.querySelectorAll('[data-action="history-decide"]')]
      .find(b => b.dataset.decision === 'Rejected')
    rejectBtn.click()
    expect(onDecision).toHaveBeenCalledOnce()
    expect(onDecision).toHaveBeenCalledWith('a-2', 'tok-abc', 'Rejected')
  })
})

describe('renderClientHistory — empty state', () => {
  it('renders empty message for empty array', () => {
    const el = makeDiv()
    renderClientHistory([], el, { onDecision: noOp() })
    expect(el.textContent).toContain('אין הזמנות קודמות')
  })
})

// ─── renderSmsLog ─────────────────────────────────────────────────────────────

const SMS_ENTRIES = [
  { to: '+972501234567', ts: '2026-06-01', status: 'SENT',    context: 'OTP',   snippet: 'קוד: 123456' },
  { to: '+972509876543', ts: '2026-06-02', status: 'MOCK',    context: 'Admin', snippet: 'mock' },
  { to: '+972501111111', ts: '2026-06-03', status: 'ERROR',   context: 'OTP',   snippet: 'err' },
  { to: '+972502222222', ts: '2026-06-04', status: 'SKIPPED', context: 'OTP',   snippet: 'skip' },
]

describe('renderSmsLog', () => {
  it('renders one entry per log row', () => {
    const el = makeDiv()
    renderSmsLog(SMS_ENTRIES, el)
    expect(el.querySelectorAll('[data-qa="log-entry"]').length).toBe(4)
  })
  it('renders zero onclick= attributes', () => {
    const el = makeDiv()
    renderSmsLog(SMS_ENTRIES, el)
    expect(el.innerHTML).not.toContain('onclick=')
  })
  it('empty entries show empty message', () => {
    const el = makeDiv()
    renderSmsLog([], el)
    expect(el.textContent).toContain('אין רשומות')
  })
  it('XSS: snippet is HTML-escaped', () => {
    const el = makeDiv()
    renderSmsLog([{ to: '+972501234567', ts: '2026-06-01', status: 'SENT', context: 'OTP', snippet: '<b>xss</b>' }], el)
    expect(el.innerHTML).not.toContain('<b>xss</b>')
    expect(el.innerHTML).toContain('&lt;b&gt;xss&lt;/b&gt;')
  })
})

