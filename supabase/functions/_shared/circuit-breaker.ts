// _shared/circuit-breaker.ts
// Per-worker circuit breaker. After `threshold` CONSECUTIVE failures the circuit
// OPENS and the WhatsApp bot stops calling the brain (auto human-handover) until
// a cooldown elapses (then half-open: one attempt is allowed through). Pure and
// deterministic — `now` is injectable so it is unit-testable without timers.

export interface CircuitBreaker {
  isOpen(): boolean
  recordSuccess(): void
  recordFailure(): void
  state(): { open: boolean; consecutiveFailures: number }
}

export function createCircuitBreaker(
  threshold = 3,
  cooldownMs = 120_000,
  now: () => number = Date.now,
): CircuitBreaker {
  let fails    = 0
  let openedAt = 0   // 0 => closed

  return {
    isOpen() {
      if (openedAt === 0) return false
      if (now() - openedAt >= cooldownMs) { openedAt = 0; fails = 0; return false } // half-open
      return true
    },
    recordSuccess() { fails = 0; openedAt = 0 },
    recordFailure() { fails++; if (fails >= threshold && openedAt === 0) openedAt = now() },
    state() { return { open: openedAt !== 0, consecutiveFailures: fails } },
  }
}
