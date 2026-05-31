/**
 * admin-gestures.js — pointer-based swipe-to-act gesture module
 *
 * Pure (unit-testable):
 *   swipeCommitted(dx, cardWidth)   — true when |dx| > 60% of card width
 *   swipeRevealRatio(dx, cardWidth) — linear 0→1 reveal opacity (clamped)
 *
 * DOM (browser-only):
 *   initCardSwipe(wrapper, opts)   — attaches pointer listeners to one card
 *     opts.onCommit(swipeId, target)  called when commit threshold crossed
 *       target: 'Approved' | 'Rejected' | 'Cancelled'
 *
 * Commit threshold: > 60% of card width in either direction.
 * Reveal starts from 0, reaches full opacity at the commit threshold.
 * Below 35% on release: spring back (CSS cubic-bezier transition).
 */

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Returns true when the swipe displacement exceeds the commit threshold.
 * Threshold is strictly greater than 60% of card width.
 * Returns false for zero or invalid cardWidth.
 *
 * @param {number} dx          displacement in pixels (positive = right)
 * @param {number} cardWidth   width of the card element in pixels
 * @returns {boolean}
 */
export function swipeCommitted(dx, cardWidth) {
  if (!cardWidth || cardWidth <= 0 || isNaN(cardWidth)) return false
  return Math.abs(dx) / cardWidth > 0.60
}

/**
 * Returns the reveal layer opacity (0→1) proportional to swipe distance.
 * Reaches 1.0 at the commit threshold (60% of card width) and is clamped there.
 *
 * @param {number} dx          displacement in pixels
 * @param {number} cardWidth   width of the card element in pixels
 * @returns {number}           0.0 – 1.0
 */
export function swipeRevealRatio(dx, cardWidth) {
  if (!cardWidth || cardWidth <= 0 || isNaN(cardWidth)) return 0
  return Math.min(1, Math.abs(dx) / (cardWidth * 0.60))
}

// ── DOM gesture handler ───────────────────────────────────────────────────────

/**
 * Attach pointer-based swipe gestures to a single `.swipe-wrapper` element.
 * Called by render() after inserting swipe card HTML into the DOM.
 *
 * @param {HTMLElement} wrapper   element with class="swipe-wrapper"
 * @param {{ onCommit: Function }} [opts]
 */
export function initCardSwipe(wrapper, opts = {}) {
  const card    = wrapper.querySelector('.swipe-card')
  const approve = wrapper.querySelector('.swipe-reveal.approve')
  const reject  = wrapper.querySelector('.swipe-reveal.reject')
  if (!card) return

  let startX = 0
  let active = false

  card.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return
    // Don't hijack taps that land on an interactive control — let their native
    // click fire (approve / reject / SMS / call / WhatsApp / delete). Without
    // this guard, setPointerCapture below swallows the tap and the button never
    // reacts (the classic "I click and nothing happens, no error" bug).
    if (e.target && e.target.closest && e.target.closest('button, a')) return
    startX = e.clientX
    active = true
    card.setPointerCapture(e.pointerId)
    card.classList.add('dragging')
  }, { passive: true })

  card.addEventListener('pointermove', e => {
    if (!active) return
    const dx    = e.clientX - startX
    const width = card.getBoundingClientRect().width
    const ratio = swipeRevealRatio(dx, width)

    card.style.transform = 'translate3d(' + dx + 'px,0,0)'

    if (dx > 0) {
      if (approve) approve.style.opacity = String(ratio)
      if (reject)  reject.style.opacity  = '0'
    } else if (dx < 0) {
      if (reject)  reject.style.opacity  = String(ratio)
      if (approve) approve.style.opacity = '0'
    } else {
      if (approve) approve.style.opacity = '0'
      if (reject)  reject.style.opacity  = '0'
    }
  })

  card.addEventListener('pointerup', e => {
    if (!active) return
    _settle(e.clientX - startX)
  })

  card.addEventListener('pointercancel', () => {
    if (!active) return
    _springBack()
  })

  function _settle(dx) {
    active = false
    card.classList.remove('dragging')

    const width  = card.getBoundingClientRect().width
    const status = wrapper.dataset.swipeStatus

    if (!swipeCommitted(dx, width)) {
      _springBack()
      return
    }

    // Map direction + status to target action
    let target = null
    if (dx > 0 && status === 'Pending')  target = 'Approved'
    if (dx < 0 && status === 'Pending')  target = 'Rejected'
    if (dx < 0 && status === 'Approved') target = 'Cancelled'

    if (!target) { _springBack(); return }

    opts.onCommit && opts.onCommit(wrapper.dataset.swipeId, target)
  }

  function _springBack() {
    active = false
    card.classList.remove('dragging')
    card.style.transform = 'translate3d(0,0,0)'
    if (approve) approve.style.opacity = '0'
    if (reject)  reject.style.opacity  = '0'
  }
}
