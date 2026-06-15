/**
 * admin-sheet.js — bottom sheet controller
 *
 * Pure (unit-testable, no DOM):
 *   sheetReducer(state, action)  — state machine
 *   INITIAL_SHEET_STATE          — initial closed state
 *   SNAP_HEIGHTS                 — vh values for each snap point
 *
 * DOM (browser-only, E2E-tested):
 *   initSheet()                  — wire listeners once on DOMContentLoaded
 *   openSheet(type, payload, snap) — show sheet with content
 *   closeSheet()                 — hide with exit animation
 *
 * Content types:
 *   'day' — date header + booking list + add-slot footer button
 *
 * Actions dispatched on document for admin.js to handle:
 *   CustomEvent 'sheet:action'  { detail: { action, id, date } }
 *
 * Bug fixes applied vs. initial version:
 *   FIX-1 (HIGH)   _animateClose has a 400ms timeout fallback so _closing
 *                  never gets stuck when animationend fails to fire
 *                  (prefers-reduced-motion, DOM removal, etc.)
 *   FIX-2 (MEDIUM) closeSheet() resets _drag state when called externally
 *                  during an active drag, restoring panel.style.transition.
 *   FIX-3 (MEDIUM) openSheet() while _closing uses a _pendingOpen variable
 *                  (last-write-wins) instead of stacking animationend
 *                  listeners that would call _doOpen multiple times.
 */

// ── Pure state ────────────────────────────────────────────────────────────────

export const INITIAL_SHEET_STATE = {
  open:    false,
  type:    null,
  payload: null,
  snap:    'full',
}

export const SNAP_HEIGHTS = {
  peek: '35vh',
  half: '60vh',
  full: '95vh',
}

const VALID_SNAPS = new Set(['peek', 'half', 'full'])

// Hoisted so _esc is never reconstructed per call
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// ── Pure day-sheet helpers (unit-testable) ──────────────────────────────────────

/**
 * Bookable start times for the add-slot picker: 08:00 → 19:30 in 30-min steps.
 * 20:00 is intentionally excluded (no service can start that late).
 */
export function slotTimeOptions() {
  const out = []
  for (let h = 8; h <= 19; h++) {
    out.push(String(h).padStart(2, '0') + ':00')
    out.push(String(h).padStart(2, '0') + ':30')
  }
  return out
}

/**
 * Set of 'HH:MM' times already in use on a day, so the picker can flag them.
 * A time is "used" if an active booking (Pending/Approved) or any slot sits on it.
 * Rejected/Cancelled bookings free the time and do not count.
 */
export function usedTimeSet(bookings, slots) {
  const used = new Set()
  for (const b of (bookings || [])) {
    if ((b.status === 'Pending' || b.status === 'Approved') && b.time) used.add(b.time)
  }
  for (const s of (slots || [])) {
    if (s.time) used.add(s.time)
  }
  return used
}

/**
 * Pure reducer — derives next state from current state + action.
 * Returns a new object; never mutates the input.
 *
 * @param {{ open, type, payload, snap }} state
 * @param {{ type: string, [key]: any }} action
 * @returns {{ open, type, payload, snap }}
 */
export function sheetReducer(state, action) {
  switch (action.type) {
    case 'OPEN':
      return {
        open:    true,
        type:    action.sheetType,
        payload: action.payload !== undefined ? action.payload : null,
        snap:    VALID_SNAPS.has(action.snap) ? action.snap : 'full',
      }
    case 'CLOSE':
      return { ...INITIAL_SHEET_STATE }
    case 'SET_SNAP':
      return VALID_SNAPS.has(action.snap)
        ? { ...state, snap: action.snap }
        : state
    default:
      return state
  }
}

// ── DOM controller ────────────────────────────────────────────────────────────

let _state       = { ...INITIAL_SHEET_STATE }
let _closing     = false
let _initialized = false
let _pendingOpen = null   // FIX-3: store latest queued open (last-write-wins)

export function initSheet() {
  if (_initialized) return
  _initialized = true

  const closeBtn = document.getElementById('js-sheet-close')
  const backdrop = document.getElementById('js-sheet-backdrop')
  if (closeBtn) closeBtn.addEventListener('click', closeSheet)
  if (backdrop) backdrop.addEventListener('click', closeSheet)

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _state.open) closeSheet()
  })

  const sheetContent = document.getElementById('js-sheet-content')
  if (sheetContent) {
    sheetContent.addEventListener('click', e => {
      // Tab switching — data-tab-target buttons toggle panel visibility
      const tabBtn = e.target.closest('[data-tab-target]')
      if (tabBtn) {
        const target = tabBtn.dataset.tabTarget
        sheetContent.querySelectorAll('[data-tab-target]').forEach(b => {
          const isActive = b.dataset.tabTarget === target
          b.classList.toggle('bg-white',        isActive)
          b.classList.toggle('text-text-main',  isActive)
          b.classList.toggle('shadow-sm',       isActive)
          b.classList.toggle('text-text-muted', !isActive)
          b.classList.toggle('font-bold',       isActive)
        })
        sheetContent.querySelectorAll('[data-tab-panel]').forEach(p => {
          p.classList.toggle('hidden', p.dataset.tabPanel !== target)
        })
        return
      }

      // Sheet action buttons — dispatch event to admin.js
      const btn = e.target.closest('[data-sheet-action]')
      if (!btn) return
      const action = btn.dataset.sheetAction
      const timeEl = document.getElementById('js-slot-time-select')
      document.dispatchEvent(new CustomEvent('sheet:action', {
        detail: {
          action,
          id:     btn.dataset.id     || '',
          date:   btn.dataset.date   || '',
          slotId: btn.dataset.slotId || '',
          time:   (action === 'addSlot' && timeEl) ? timeEl.value : '',
        },
        bubbles: false,
      }))
    })
  }

  _initDrag()
}

export function openSheet(type, payload, snap = 'full') {
  if (_closing) {
    // FIX-3: record latest intent; _animateClose's onDone will execute it
    _pendingOpen = { type, payload, snap }
    return
  }
  _doOpen(type, payload, snap)
}

export function isSheetOpen() { return _state.open }

export function closeSheet() {
  if (!_state.open || _closing) return

  // FIX-2: if a drag is in progress, cleanly reset it before closing
  if (_drag.active) {
    _drag.active = false
    const panel = document.getElementById('js-sheet-panel')
    if (panel) panel.style.transition = ''
  }

  _state = sheetReducer(_state, { type: 'CLOSE' })
  _animateClose()
}

function _doOpen(type, payload, snap) {
  _state = sheetReducer(_state, { type: 'OPEN', sheetType: type, payload, snap })
  _renderContent()
  _animateOpen()
}

// ── Content rendering ──────────────────────────────────

function _renderContent() {
  const titleEl   = document.getElementById('js-sheet-title')
  const contentEl = document.getElementById('js-sheet-content')
  const footerEl  = document.getElementById('js-sheet-footer')
  if (!titleEl || !contentEl) return

  if (_state.type === 'day') {
    _renderDay(titleEl, contentEl, footerEl, _state.payload)
  }
}

// ── Date / service / contact helpers ───────────────────

const _HE_DAYS   = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
const _HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

function _fmtDayDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return {
    dayName:   'יום ' + _HE_DAYS[d.getDay()],
    shortDate: d.getDate() + ' ב' + _HE_MONTHS[d.getMonth()],
  }
}

const _SVC_EMOJI    = { gel_hands:'💅', regular_feet:'🦶', gel_combo:'✨', gel_classic:'💅', gel_feet:'🦶' }
const _SVC_DURATION = { gel_hands:60,  regular_feet:30,  gel_combo:90,  gel_classic:90,  gel_feet:120  }
const _SVC_LABEL    = {
  gel_hands:    "לק ג'ל לציפורניים",
  regular_feet: "לק רגיל לרגליים",
  gel_combo:    "לק ג'ל + לק רגיל לרגליים",
  gel_classic:  "לק ג'ל קלאסי (ישן)",
  gel_feet:     "לק ג'ל רגליים (ישן)",
}

function _svcLine(b) {
  const svc      = b.service || ''
  const emoji    = _SVC_EMOJI[svc]              || '💅'
  const duration = b.duration_min || _SVC_DURATION[svc] || ''
  const label    = b.serviceName  || _SVC_LABEL[svc]    || svc
  return emoji + ' ' + _esc(String(label)) + (duration ? ' · ' + duration + " דק'" : '')
}

function _waHref(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '')
  const intl   = digits.startsWith('972') ? digits
               : digits.startsWith('0')   ? '972' + digits.slice(1)
               : digits
  return 'https://wa.me/' + intl
}

function _fmtPhoneLocal(phone) {
  return String(phone || '').replace('+972', '0').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
}

// ── Day sheet renderer ─────────────────────────────────

function _renderDay(titleEl, contentEl, footerEl, payload) {
  if (!payload) return
  const { dateStr, entry, slots = [], isPast = false } = payload

  const bookings  = (entry && entry.bookings) ? entry.bookings : []
  const freeSlots = (slots || []).filter(s => String(s.status).toLowerCase() === 'available')
  const blocked   = (slots || []).filter(s => String(s.status).toLowerCase() === 'blocked')
  const locked    = (slots || []).filter(s => String(s.status).toLowerCase() === 'locked')
  const pending   = bookings.filter(b => b.status === 'Pending')
  const approved  = bookings.filter(b => b.status === 'Approved')

  const dt = _fmtDayDate(dateStr)
  titleEl.innerHTML =
    '<div class="leading-snug">'
    + '<span class="font-black text-text-main">' + _esc(dt.dayName) + '</span>'
    + '<span class="text-text-muted font-medium text-sm"> · ' + _esc(dt.shortDate) + '</span>'
    + (isPast ? '<span class="mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-400 align-middle">עבר</span>' : '')
    + '</div>'

  const chips = []
  if (pending.length)   chips.push('<span class="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">' + pending.length + ' ממתינות</span>')
  if (approved.length)  chips.push('<span class="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">' + approved.length + ' מאושרות</span>')
  const unfulfilledCount = isPast ? (freeSlots.length + locked.length) : 0
  if (!isPast && freeSlots.length) chips.push('<span class="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-100 text-rose-600">' + freeSlots.length + ' פנויות</span>')
  if (!isPast && locked.length)    chips.push('<span class="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">🔒 ' + locked.length + ' חסום</span>')
  if (unfulfilledCount)            chips.push('<span class="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">📭 ' + unfulfilledCount + ' לא מומש</span>')

  const bookTabLabel  = 'הזמנות' + (bookings.length ? ' (' + bookings.length + ')' : '')
  const slotsTabCount = freeSlots.length + blocked.length + locked.length
  const slotsTabLabel = 'ניהול זמנים' + (slotsTabCount ? ' (' + slotsTabCount + ')' : '')

  const approveAllBanner = pending.length > 1
    ? '<div class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-3">'
      + '<div>'
      + '<div class="text-xs font-black text-amber-700">' + pending.length + ' הזמנות ממתינות לאישור</div>'
      + '<div class="text-[10px] text-amber-500 font-medium mt-0.5">אישור אחד לכולן</div>'
      + '</div>'
      + '<button data-sheet-action="approveAll" class="text-xs font-black bg-amber-500 text-white px-3.5 py-2 rounded-xl hover:bg-amber-600 active:scale-95 transition-all whitespace-nowrap">✓ אשר הכל</button>'
      + '</div>'
    : (pending.length === 1
      ? '<div class="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 mb-3">'
        + '<span class="text-amber-500 text-sm">⏳</span>'
        + '<span class="text-xs text-amber-700 font-bold">הזמנה ממתינה לאישורך</span>'
        + '</div>'
      : '')

  const sorted      = bookings.slice().sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
  const activeRows  = sorted.filter(b => b.status === 'Pending' || b.status === 'Approved')
  const historyRows = sorted.filter(b => b.status === 'Rejected' || b.status === 'Cancelled')

  let bookingsHtml = ''
  if (activeRows.length) bookingsHtml += activeRows.map(_bookingRow).join('')
  if (historyRows.length) {
    bookingsHtml +=
      '<div class="pt-1">'
      + '<div class="flex items-center gap-2 my-3">'
      + '<div class="flex-1 h-px bg-secondary/20"></div>'
      + '<span class="text-[10px] font-bold text-text-muted px-1">היסטוריה</span>'
      + '<div class="flex-1 h-px bg-secondary/20"></div>'
      + '</div>'
      + historyRows.map(_bookingRow).join('')
      + '</div>'
  }
  if (!bookings.length) {
    bookingsHtml =
      '<div class="flex flex-col items-center justify-center py-14 text-center">'
      + '<div class="text-5xl mb-3">💅</div>'
      + '<p class="text-sm font-bold text-text-muted">אין הזמנות ביום זה</p>'
      + ((!isPast && freeSlots.length)
          ? '<p class="text-xs text-rose-400 mt-1.5 font-medium">יש ' + freeSlots.length + ' זמנים פנויים</p>'
          : '')
      + '</div>'
  }

  let slotsHtml = ''
  if (!isPast) {
    const used = usedTimeSet(bookings, slots)
    const opts = slotTimeOptions().map(t =>
      '<option value="' + t + '">' + t + (used.has(t) ? ' · תפוס' : '') + '</option>'
    ).join('')
    slotsHtml +=
      '<div class="bg-cream rounded-2xl p-4 border border-secondary/30 mb-4">'
      + '<div class="text-xs font-black text-text-muted mb-2.5">+ הוסף תור חדש</div>'
      + '<div class="flex gap-2 items-center">'
      + '<select id="js-slot-time-select" class="flex-1 border border-secondary/50 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0">' + opts + '</select>'
      + '<button data-sheet-action="addSlot" data-date="' + _esc(dateStr) + '" class="shrink-0 bg-primary text-white font-bold px-4 py-2.5 rounded-xl hover:bg-primary-dk active:scale-[0.98] transition-all text-sm whitespace-nowrap">הוסף</button>'
      + '</div>'
      + '</div>'
  }
  if (isPast) {
    const allUnfulfilled = [...freeSlots, ...locked].sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
    if (allUnfulfilled.length) {
      slotsHtml += '<div class="text-[11px] font-black text-text-muted mb-2">📭 לא מומש</div>'
                + allUnfulfilled.map(_unfulfilledSlotRow).join('')
    }
    if (blocked.length) {
      const sortedBlocked = blocked.slice().sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
      slotsHtml += '<div class="text-[11px] font-black text-text-muted mt-4 mb-2">חסומים</div>'
                + sortedBlocked.map(_blockedSlotRow).join('')
    }
    if (!allUnfulfilled.length && !blocked.length) {
      slotsHtml += '<div class="flex flex-col items-center justify-center py-10 text-center"><p class="text-sm font-medium text-text-muted">יום עבר — אין תורים לנהל</p></div>'
    }
  } else {
    if (freeSlots.length) {
      const sortedFree = freeSlots.slice().sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
      slotsHtml += '<div class="text-[11px] font-black text-text-muted mb-2">זמנים פנויים</div>'
                + sortedFree.map(_freeSlotRow).join('')
    }
    if (locked.length) {
      const sortedLocked = locked.slice().sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
      slotsHtml += '<div class="text-[11px] font-black text-text-muted mt-4 mb-2">🔒 חסום (אוטומטי)</div>'
                + sortedLocked.map(_lockedSlotRow).join('')
    }
    if (blocked.length) {
      const sortedBlocked = blocked.slice().sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)
      slotsHtml += '<div class="text-[11px] font-black text-text-muted mt-4 mb-2">חסומים</div>'
                + sortedBlocked.map(_blockedSlotRow).join('')
    }
    if (!freeSlots.length && !locked.length && !blocked.length) {
      slotsHtml += '<div class="py-4 text-center text-xs text-text-muted">אין תורים מוגדרים ליום זה</div>'
    }
  }

  contentEl.innerHTML =
    (chips.length ? '<div class="flex flex-wrap gap-1.5 mb-4">' + chips.join('') + '</div>' : '')
    + '<div class="flex gap-1 mb-4 bg-secondary/10 rounded-2xl p-1">'
    + '<button data-tab-target="bookings" class="tab-btn flex-1 text-xs font-bold py-2.5 rounded-xl bg-white text-text-main shadow-sm transition-all">' + bookTabLabel + '</button>'
    + '<button data-tab-target="slots"    class="tab-btn flex-1 text-xs font-bold py-2.5 rounded-xl text-text-muted transition-all">' + slotsTabLabel + '</button>'
    + '</div>'
    + '<div data-tab-panel="bookings">' + approveAllBanner + bookingsHtml + '</div>'
    + '<div data-tab-panel="slots" class="hidden">' + slotsHtml + '</div>'

  if (footerEl) {
    footerEl.innerHTML = ''
    footerEl.classList.add('hidden')
  }
}

// ── Booking row ───────────────────────────────────────────────

function _bookingRow(b) {
  const BADGE = {
    Pending:   'bg-amber-100 text-amber-700',
    Approved:  'bg-green-100 text-green-700',
    Rejected:  'bg-red-100   text-red-600',
    Cancelled: 'bg-gray-100  text-gray-400',
  }
  const LABEL = { Pending: 'ממתין', Approved: 'מאושר', Rejected: 'נדחה', Cancelled: 'בוטל' }

  const badge      = BADGE[b.status] || 'bg-gray-100 text-gray-500'
  const label      = LABEL[b.status] || _esc(b.status)
  const id         = _esc(b.id)
  const phone      = _fmtPhoneLocal(b.phone)
  const isTerminal = b.status === 'Rejected' || b.status === 'Cancelled'

  return (
    '<div class="' + (isTerminal ? 'opacity-60 ' : '') + 'bg-cream rounded-2xl border border-secondary/30 shadow-sm card-in mb-3 overflow-hidden" data-booking="' + id + '">'  
    + '<div class="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-secondary/15">'
    + '<span class="font-black text-base text-text-main tabular-nums">' + _esc(b.time || '--:--') + '</span>'
    + '<span class="text-[10px] font-bold px-2.5 py-1 rounded-full ' + badge + '">' + label + '</span>'
    + '</div>'
    + '<div class="px-4 pt-3 pb-3.5">'
    + '<div class="font-black text-sm text-text-main mb-1.5">' + _esc(b.name) + '</div>'
    + '<div class="text-xs text-text-muted mb-3">' + _svcLine(b) + '</div>'
    + (!isTerminal
      ? '<div class="flex gap-2 mb-3">'
        + '<a href="tel:' + _esc(b.phone || '') + '" class="flex items-center gap-1.5 text-xs text-primary font-bold bg-primary/10 px-3 py-1.5 rounded-xl hover:bg-primary/20 transition-colors no-underline">📞 ' + _esc(phone) + '</a>'
        + '<a href="' + _waHref(b.phone) + '" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-colors no-underline">💬 WhatsApp</a>'
        + '</div>'
      : '')
    + _bookingActions(b)
    + '</div>'
    + '</div>'
  )
}

function _bookingActions(b) {
  const id = _esc(b.id)
  if (b.status === 'Pending') {
    return (
      '<div class="flex gap-2">'
      + '<button data-sheet-action="approve" data-id="' + id + '"'
      + ' class="flex-1 bg-green-500 text-white text-xs font-black py-3 rounded-xl'
      + ' hover:bg-green-600 active:scale-95 transition-all">✓ אשר</button>'
      + '<button data-sheet-action="reject" data-id="' + id + '"'
      + ' class="flex-1 bg-red-100 text-red-600 text-xs font-black py-3 rounded-xl'
      + ' hover:bg-red-200 active:scale-95 transition-all">✕ דחה</button>'
      + '</div>'
    )
  }
  if (b.status === 'Approved') {
    return (
      '<button data-sheet-action="cancel" data-id="' + id + '"'
      + ' class="w-full bg-gray-100 text-gray-500 text-xs font-bold py-2.5 rounded-xl'
      + ' hover:bg-gray-200 active:scale-95 transition-all">בטל הזמנה</button>'
    )
  }
  return ''
}

// ── Slot rows ─────────────────────────────────────────────────

function _freeSlotRow(s) {
  const id = _esc(s.id)
  return (
    '<div class="flex items-center justify-between bg-rose-50 border border-rose-100 rounded-xl px-4 py-3 mb-2" data-slot-id="' + id + '">'  
    + '<div>'
    + '<div class="text-sm font-black text-rose-600">' + _esc(s.time || '') + '</div>'
    + '<div class="text-[11px] text-rose-400 font-medium mt-0.5">פנוי להזמנה</div>'
    + '</div>'
    + '<div class="flex gap-2">'
    + '<button data-sheet-action="blockSlot" data-slot-id="' + id + '" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-text-muted border border-secondary/40 hover:bg-cream active:scale-95 transition-all">🔒 חסום</button>'
    + '<button data-sheet-action="deleteSlot" data-slot-id="' + id + '" aria-label="מחק תור" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-red-400 border border-secondary/40 hover:bg-red-50 active:scale-95 transition-all">מחק</button>'
    + '</div>'
    + '</div>'
  )
}

function _blockedSlotRow(s) {
  const id = _esc(s.id)
  return (
    '<div class="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 mb-2" data-slot-id="' + id + '">'  
    + '<div>'
    + '<div class="text-sm font-black text-gray-500">' + _esc(s.time || '') + '</div>'
    + '<div class="text-[11px] text-gray-400 font-medium mt-0.5">חסום</div>'
    + '</div>'
    + '<div class="flex gap-2">'
    + '<button data-sheet-action="blockSlot" data-slot-id="' + id + '" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-emerald-600 border border-secondary/40 hover:bg-emerald-50 active:scale-95 transition-all">🔓 שחרר</button>'
    + '<button data-sheet-action="deleteSlot" data-slot-id="' + id + '" aria-label="מחק תור" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-red-400 border border-secondary/40 hover:bg-red-50 active:scale-95 transition-all">מחק</button>'
    + '</div>'
    + '</div>'
  )
}

function _unfulfilledSlotRow(s) {
  const id = _esc(s.id)
  return (
    '<div class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-2" data-slot-id="' + id + '">'
    + '<div>'
    + '<div class="text-sm font-black text-gray-400">' + _esc(s.time || '') + '</div>'
    + '<div class="text-[11px] text-gray-400 font-medium mt-0.5">לא מומש</div>'
    + '</div>'
    + '<button data-sheet-action="deleteSlot" data-slot-id="' + id + '" aria-label="מחק תור" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-red-400 border border-secondary/40 hover:bg-red-50 active:scale-95 transition-all">מחק</button>'
    + '</div>'
  )
}

function _lockedSlotRow(s) {
  const id = _esc(s.id)
  return (
    '<div class="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-2" data-slot-id="' + id + '">'
    + '<div>'
    + '<div class="text-sm font-black text-amber-700">' + _esc(s.time || '') + '</div>'
    + '<div class="text-[11px] text-amber-500 font-medium mt-0.5">🔒 חסום</div>'
    + '</div>'
    + '<div class="flex gap-2">'
    + '<button data-sheet-action="unblockSlot" data-slot-id="' + id + '" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-emerald-600 border border-secondary/40 hover:bg-emerald-50 active:scale-95 transition-all">🔓 שחרר</button>'
    + '<button data-sheet-action="deleteSlot" data-slot-id="' + id + '" aria-label="מחק תור" class="text-xs font-bold px-3 py-1.5 rounded-xl bg-white text-red-400 border border-secondary/40 hover:bg-red-50 active:scale-95 transition-all">מחק</button>'
    + '</div>'
    + '</div>'
  )
}

// ── Animations ────────────────────────────────────────────────────────────────

// Duration in ms — slightly longer than the CSS animation to act as a safety net
const _CLOSE_FALLBACK_MS = 400

function _animateOpen() {
  const overlay = document.getElementById('js-sheet')
  const panel   = document.getElementById('js-sheet-panel')
  if (!overlay || !panel) return

  panel.style.maxHeight = SNAP_HEIGHTS[_state.snap] || '60vh'
  overlay.classList.remove('hidden')
  document.body.style.overflow = 'hidden'

  requestAnimationFrame(() => {
    panel.classList.remove('sheet-exiting')
    panel.classList.add('sheet-entering')
    panel.addEventListener('animationend', () => {
      panel.classList.remove('sheet-entering')
    }, { once: true })
  })
}

function _animateClose() {
  const overlay = document.getElementById('js-sheet')
  const panel   = document.getElementById('js-sheet-panel')
  if (!overlay || !panel) return

  _closing = true
  panel.classList.remove('sheet-entering')
  panel.classList.add('sheet-exiting')

  // FIX-1: single idempotent handler shared between animationend and fallback
  let settled = false
  function onDone() {
    if (settled) return
    settled = true

    overlay.classList.add('hidden')
    panel.classList.remove('sheet-exiting')
    document.body.style.overflow = ''
    _closing = false

    // Clear stale content
    const contentEl = document.getElementById('js-sheet-content')
    const footerEl  = document.getElementById('js-sheet-footer')
    if (contentEl) contentEl.innerHTML = ''
    if (footerEl)  { footerEl.innerHTML = ''; footerEl.classList.add('hidden') }

    // FIX-3: execute any queued open (last-write-wins)
    if (_pendingOpen) {
      const next   = _pendingOpen
      _pendingOpen = null
      _doOpen(next.type, next.payload, next.snap)
    }
  }

  panel.addEventListener('animationend', onDone, { once: true })
  // FIX-1: safety fallback — fires if animationend never arrives
  setTimeout(onDone, _CLOSE_FALLBACK_MS)
}

// ── Drag-to-resize ────────────────────────────────────────────────────────────

let _drag = { active: false, startY: 0, startH: 0 }

function _initDrag() {
  const handle = document.getElementById('js-sheet-handle')
  const panel  = document.getElementById('js-sheet-panel')
  if (!handle || !panel) return

  handle.addEventListener('pointerdown', e => {
    if (!_state.open) return
    _drag.active = true
    _drag.startY = e.clientY
    _drag.startH = panel.getBoundingClientRect().height
    handle.setPointerCapture(e.pointerId)
    panel.style.transition = 'none'
  })

  handle.addEventListener('pointermove', e => {
    if (!_drag.active) return
    const dy   = _drag.startY - e.clientY
    const newH = Math.max(60, Math.min(window.innerHeight * 0.94, _drag.startH + dy))
    panel.style.maxHeight = newH + 'px'
  })

  handle.addEventListener('pointerup', () => {
    if (!_drag.active) return
    _drag.active = false
    panel.style.transition = ''

    const h  = panel.getBoundingClientRect().height
    const vh = window.innerHeight

    if      (h < vh * 0.18) closeSheet()
    else if (h < vh * 0.47) _snapTo('peek')
    else if (h < vh * 0.76) _snapTo('half')
    else                    _snapTo('full')
  })

  handle.addEventListener('pointercancel', () => {
    if (!_drag.active) return
    _drag.active = false
    panel.style.transition = ''
  })
}

function _snapTo(snap) {
  _state = sheetReducer(_state, { type: 'SET_SNAP', snap })
  const panel = document.getElementById('js-sheet-panel')
  if (panel) panel.style.maxHeight = SNAP_HEIGHTS[snap]
}

function _esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => _ESC_MAP[c])
}
