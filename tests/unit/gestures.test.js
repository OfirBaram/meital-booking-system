/**
 * tests/unit/gestures.test.js
 * Unit tests for pure gesture-threshold functions in admin-gestures.js
 * and buildSwipeCard in admin-render.js.
 *
 * Coverage:
 *   swipeCommitted(dx, cardWidth)   — commit threshold > 60%
 *   swipeRevealRatio(dx, cardWidth) — linear 0→1 clamped at 1
 *   buildSwipeCard(booking)         — HTML structure, data attributes
 */
import { describe, it, expect } from 'vitest'
import { swipeCommitted, swipeRevealRatio } from '../../frontend/admin-gestures.js'
import { buildSwipeCard } from '../../frontend/admin-render.js'

// ─── swipeCommitted ───────────────────────────────────────────────────────────

describe('swipeCommitted', () => {
  it('returns false when dx is 0', () => {
    expect(swipeCommitted(0, 300)).toBe(false)
  })

  it('returns false when |dx| is exactly 60% of cardWidth (boundary is exclusive)', () => {
    expect(swipeCommitted(180, 300)).toBe(false)  // 180/300 = 0.60 exactly → NOT committed
  })

  it('returns true when |dx| is just above 60% of cardWidth', () => {
    expect(swipeCommitted(181, 300)).toBe(true)   // 181/300 ≈ 0.603 → committed
  })

  it('returns false at 35% of cardWidth (mid-drag, not yet committed)', () => {
    expect(swipeCommitted(105, 300)).toBe(false)  // 105/300 = 0.35
  })

  it('returns true at 65% of cardWidth', () => {
    expect(swipeCommitted(195, 300)).toBe(true)   // 195/300 = 0.65
  })

  it('returns true at 100% of cardWidth', () => {
    expect(swipeCommitted(300, 300)).toBe(true)
  })

  it('handles negative dx (swipe left) symmetrically', () => {
    expect(swipeCommitted(-181, 300)).toBe(true)
    expect(swipeCommitted(-105, 300)).toBe(false)
  })

  it('returns false for zero cardWidth (guard)', () => {
    expect(swipeCommitted(100, 0)).toBe(false)
  })

  it('returns false for negative cardWidth (guard)', () => {
    expect(swipeCommitted(100, -50)).toBe(false)
  })

  it('returns false for NaN cardWidth', () => {
    expect(swipeCommitted(100, NaN)).toBe(false)
  })

  it('tiny dx on very wide card is false', () => {
    expect(swipeCommitted(1, 1000)).toBe(false)
  })

  it('large dx on very narrow card is true', () => {
    expect(swipeCommitted(100, 50)).toBe(true)   // 100/50 = 2.0 > 0.60
  })
})

// ─── swipeRevealRatio ─────────────────────────────────────────────────────────

describe('swipeRevealRatio', () => {
  it('returns 0 for dx = 0', () => {
    expect(swipeRevealRatio(0, 300)).toBe(0)
  })

  it('returns 0 for zero cardWidth', () => {
    expect(swipeRevealRatio(100, 0)).toBe(0)
  })

  it('returns 0 for negative cardWidth', () => {
    expect(swipeRevealRatio(100, -50)).toBe(0)
  })

  it('returns 0.5 when dx = 30% of cardWidth (half of 60% threshold)', () => {
    // 90 / (300 * 0.60) = 90/180 = 0.5
    expect(swipeRevealRatio(90, 300)).toBeCloseTo(0.5)
  })

  it('returns 1.0 when dx exactly equals 60% of cardWidth', () => {
    // 180 / (300 * 0.60) = 180/180 = 1.0
    expect(swipeRevealRatio(180, 300)).toBe(1)
  })

  it('clamps to 1.0 when dx exceeds 60% of cardWidth', () => {
    expect(swipeRevealRatio(200, 300)).toBe(1)
    expect(swipeRevealRatio(300, 300)).toBe(1)
    expect(swipeRevealRatio(900, 300)).toBe(1)
  })

  it('is symmetric for negative dx (swipe left)', () => {
    expect(swipeRevealRatio(-90, 300)).toBeCloseTo(0.5)
    expect(swipeRevealRatio(-180, 300)).toBe(1)
  })

  it('increases linearly from 0 to 1 as dx goes from 0 to 60% of width', () => {
    const w = 200
    const threshold = w * 0.60  // 120
    for (const pct of [0.1, 0.3, 0.5, 0.8, 1.0]) {
      const expected = pct
      const actual   = swipeRevealRatio(threshold * pct, w)
      expect(actual).toBeCloseTo(expected, 5)
    }
  })
})

// ─── buildSwipeCard ───────────────────────────────────────────────────────────

describe('buildSwipeCard', () => {
  const PENDING_BOOKING = {
    id: 'uuid-p', name: 'דנה', phone: '0501234567',
    service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
    date: '2026-07-01', time: '10:00', status: 'Pending',
  }
  const APPROVED_BOOKING = { ...PENDING_BOOKING, id: 'uuid-a', status: 'Approved' }
  const REJECTED_BOOKING = { ...PENDING_BOOKING, id: 'uuid-r', status: 'Rejected' }
  const CANCELLED_BOOKING = { ...PENDING_BOOKING, id: 'uuid-c', status: 'Cancelled' }

  it('wraps Pending booking in .swipe-wrapper', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('class="swipe-wrapper"')
  })

  it('wraps Approved booking in .swipe-wrapper', () => {
    const html = buildSwipeCard(APPROVED_BOOKING)
    expect(html).toContain('class="swipe-wrapper"')
  })

  it('does NOT wrap Rejected booking (returns plain card)', () => {
    const html = buildSwipeCard(REJECTED_BOOKING)
    expect(html).not.toContain('swipe-wrapper')
  })

  it('does NOT wrap Cancelled booking (returns plain card)', () => {
    const html = buildSwipeCard(CANCELLED_BOOKING)
    expect(html).not.toContain('swipe-wrapper')
  })

  it('sets data-swipe-id to the booking id', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('data-swipe-id="uuid-p"')
  })

  it('sets data-swipe-status to the booking status', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('data-swipe-status="Pending"')
  })

  it('Pending card has both approve and reject reveal layers', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('swipe-reveal approve')
    expect(html).toContain('swipe-reveal reject')
  })

  it('Approved card has reject layer but no approve layer', () => {
    const html = buildSwipeCard(APPROVED_BOOKING)
    expect(html).toContain('swipe-reveal reject')
    expect(html).not.toContain('swipe-reveal approve')
  })

  it('reject layer for Approved card shows cancel label', () => {
    const html = buildSwipeCard(APPROVED_BOOKING)
    expect(html).toContain('בטל')
  })

  it('reject layer for Pending card shows reject label', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('דחה')
  })

  it('inner .swipe-card div wraps the booking card content', () => {
    const html = buildSwipeCard(PENDING_BOOKING)
    expect(html).toContain('class="swipe-card"')
    // The inner card should still contain the booking name
    expect(html).toContain('דנה')
  })

  it('XSS: id with special chars is escaped in data-swipe-id', () => {
    const evil = { ...PENDING_BOOKING, id: '"onload="alert(1)' }
    const html = buildSwipeCard(evil)
    expect(html).not.toContain('"onload=')
    expect(html).toContain('&quot;')
  })
})
