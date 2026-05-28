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
  snap:    'half',
}

export const SNAP_HEIGHTS = {
  peek: '35vh',
  half: '60vh',
  full: '92vh',
}

const VALID_SNAPS = new Set(['peek', 'half', 'full'])

// Hoisted so _esc is never reconstructed per call
const _ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

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
        snap:    VALID_SNAPS.has(action.snap) ? action.snap : 'half',
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
      const btn = e.target.closest('[data-sheet-action][data-id]')
      if (!btn) return
      document.dispatchEvent(new CustomEvent('sheet:action', {
        detail: { action: btn.dataset.sheetAction, id: btn.dataset.id || '', date: btn.dataset.date || '' },
        bubbles: false,
      }))
    })
  }

  _initDrag()
}

export function openSheet(type, payload, snap = 'half') {
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

// ── Content rendering ─────────────────────────────────────────────────────────

function _renderContent() {
  const titleEl   = document.getElementById('js-sheet-title')
  const contentEl = document.getElementById('js-sheet-content')
  const footerEl  = document.getElementById('js-sheet-footer')
  if (!titleEl || !contentEl) return

  if (_state.type === 'day') {
    _renderDay(titleEl, contentEl, footerEl, _state.payload)
  }
}

function _renderDay(titleEl, contentEl, footerEl, payload) {
  if (!payload) return
  const { dateStr, entry } = payload
  titleEl.textContent = (dateStr || '').replace(/-/g, '/')

  if (!entry || !entry.bookings || entry.bookings.length === 0) {
    contentEl.innerHTML =
      '<div class="flex flex-col items-center justify-center py-12 text-center">'
      + '<div class="text-4xl mb-3">💅</div>'
      + '<p class="text-sm font-medium text-text-muted">אין הזמנות ביום זה</p>'
      + '</div>'
  } else {
    const sorted = entry.bookings.slice().sort((a, b) =>
      (a.time || '') < (b.time || '') ? -1 : 1)
    contentEl.innerHTML = sorted.map(_bookingRow).join('')
  }

  if (footerEl) {
    const _times = [];
    for (let h = 8; h <= 20; h++) {
      _times.push(String(h).padStart(2, '0') + ':00');
      if (h < 20) _times.push(String(h).padStart(2, '0') + ':30');
    }
    footerEl.innerHTML =
      '<div class="flex gap-2 items-center">'
      + '<label class="text-xs text-text-muted shrink-0">שעה:</label>'
      + '<select id="js-slot-time-select"'
      + ' class="flex-1 border border-secondary/50 rounded-xl px-3 py-2 text-sm bg-surface'
      + ' focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0">'
      + _times.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('')
      + '</select>'
      + '<button data-sheet-action="addSlot" data-date="' + _esc(dateStr) + '"'
      + ' class="shrink-0 bg-primary text-white font-bold px-4 py-2.5 rounded-xl'
      + ' hover:bg-primary-dk active:scale-[0.98] transition-all text-sm whitespace-nowrap">'
      + '+ הוסף'
      + '</button>'
      + '</div>'
    footerEl.classList.remove('hidden')
    footerEl.querySelector('[data-sheet-action]').addEventListener('click', _onSheetAction)
  }
}

function _bookingRow(b) {
  const BADGE = {
    Pending:   'bg-amber-100 text-amber-700',
    Approved:  'bg-green-100 text-green-700',
    Rejected:  'bg-red-100 text-red-600',
    Cancelled: 'bg-gray-100 text-gray-400',
  }
  const LABEL = {
    Pending: 'ממתין', Approved: 'מאושר', Rejected: 'נדחה', Cancelled: 'בוטל',
  }
  const badge = BADGE[b.status] || 'bg-gray-100 text-gray-500'
  const label = LABEL[b.status] || _esc(b.status)
  const phone = String(b.phone || '').replace('+972', '0')
    .replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')
  const svc = b.serviceName || b.service || ''
  const actionsHtml = _bookingActions(b)

  return (
    '<div class="bg-cream rounded-2xl p-3.5 border border-secondary/30 shadow-sm card-in"'
    + ' data-booking="' + _esc(b.id) + '">'
    + '<div class="flex items-start justify-between mb-1.5">'
    + '<div>'
    + '<div class="font-bold text-sm text-text-main leading-tight">' + _esc(b.name) + '</div>'
    + '<div class="text-xs text-text-muted mt-0.5">' + _esc(phone) + '</div>'
    + '</div>'
    + '<span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full ' + badge + '">'
    + label + '</span>'
    + '</div>'
    + '<div class="flex items-center gap-3 text-xs text-text-muted">'
    + '<span class="font-medium">' + _esc(b.time || '') + '</span>'
    + '<span>' + _esc(svc) + '</span>'
    + '</div>'
    + actionsHtml
    + '</div>'
  )
}

function _bookingActions(b) {
  const id = _esc(b.id)
  if (b.status === 'Pending') {
    return (
      '<div class="flex gap-2 mt-2.5">'
      + '<button data-sheet-action="approve" data-id="' + id + '"'
      + ' class="flex-1 bg-green-500 text-white text-xs font-bold py-2 rounded-xl'
      + ' hover:bg-green-600 active:scale-95 transition-all">אשר ✓</button>'
      + '<button data-sheet-action="reject" data-id="' + id + '"'
      + ' class="flex-1 bg-red-400 text-white text-xs font-bold py-2 rounded-xl'
      + ' hover:bg-red-500 active:scale-95 transition-all">דחה ✕</button>'
      + '</div>'
    )
  }
  if (b.status === 'Approved') {
    return (
      '<div class="mt-2.5">'
      + '<button data-sheet-action="cancel" data-id="' + id + '"'
      + ' class="w-full bg-gray-100 text-gray-500 text-xs font-bold py-2 rounded-xl'
      + ' hover:bg-gray-200 active:scale-95 transition-all">בטל הזמנה</button>'
      + '</div>'
    )
  }
  return ''
}

function _onSheetAction(e) {
  const btn    = e.currentTarget
  const action = btn.dataset.sheetAction || btn.dataset.action || ''
  const id     = btn.dataset.id   || ''
  const date   = btn.dataset.date || ''
  const timeEl = document.getElementById('js-slot-time-select')
  const time   = (action === 'addSlot' && timeEl) ? timeEl.value : ''
  document.dispatchEvent(new CustomEvent('sheet:action', {
    detail: { action, id, date, time },
    bubbles: false,
  }))
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
