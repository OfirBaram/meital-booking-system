// supabase/functions/_tests/whatsapp.test.ts
//
// Stress & Fault-Injection suite for the WhatsApp channel. Runs locally / in CI
// with NO network: Supabase and the booking RPCs are mocked. Anthropic is never
// hit — the malformed-LLM scenario is covered at the tool boundary (the tool's
// input validation is what protects the DB from a model that emits garbage args).
//
// Run:  deno test --allow-env supabase/functions/_tests/whatsapp.test.ts
//
// Covers the three required fault scenarios:
//   1. Malformed/garbage LLM tool-args  -> tool rejects, DB untouched
//   2. DB timeout during INSERT         -> slot released (try/finally), no ghost lock
//   3. Concurrent booking (same slot)   -> atomic lock => exactly one winner
// plus the resilience primitives: circuit breaker, render, history trim, signature.

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'

import { renderForWhatsApp, trimHistory, maskPhone, scrubPhones, type ChatTurn } from '../_shared/whatsapp.ts'
import { createCircuitBreaker } from '../_shared/circuit-breaker.ts'
import { buildTwilioSignatureBase, verifyTwilioSignature } from '../_shared/twilio-webhook.ts'
import { TOOL_REGISTRY } from '../_shared/bot-config.ts'

// ── A chainable, configurable Supabase mock ─────────────────────────────────────
interface MockCfg {
  service?: { name_he: string; duration_min: number } | null
  slotId?: number | null
  smartOn?: boolean
  gapSafe?: boolean
  clientId?: string
  clientErr?: { message: string } | null
  pendingCount?: number
  lockResults?: boolean[]            // sequence of lock_slot_for_booking outcomes
  insertErr?: { message: string } | null
  insertThrows?: boolean             // simulate a DB timeout on the INSERT
}

function makeMock(cfg: MockCfg = {}) {
  const log = { locks: 0, slotReleased: false, appointmentInserted: false }
  let lockIdx = 0

  // deno-lint-ignore no-explicit-any
  function resolve(table: string, op: string): Promise<any> {
    if (table === 'services')       return Promise.resolve({ data: cfg.service === undefined ? { name_he: 'לק ג׳ל', duration_min: 60 } : cfg.service, error: null })
    if (table === 'feature_flags')  return Promise.resolve({ data: { enabled: !!cfg.smartOn }, error: null })
    if (table === 'clients' && op === 'upsert')
      return Promise.resolve({ data: cfg.clientErr ? null : { id: cfg.clientId ?? 'client-1' }, error: cfg.clientErr ?? null })
    if (table === 'appointments' && op === 'select')
      return Promise.resolve({ count: cfg.pendingCount ?? 0, error: null })
    if (table === 'appointments' && op === 'insert') {
      if (cfg.insertThrows) return Promise.reject(new Error('DB timeout'))
      log.appointmentInserted = !cfg.insertErr
      return Promise.resolve({ error: cfg.insertErr ?? null })
    }
    if (table === 'slots' && op === 'update') { log.slotReleased = true; return Promise.resolve({ error: null }) }
    return Promise.resolve({ data: null, error: null, count: 0 })
  }

  // deno-lint-ignore no-explicit-any
  function builder(table: string): any {
    const b: any = { _t: table, _op: 'select' }
    b.select = () => b
    b.eq = () => b
    b.in = () => b
    b.gte = () => b
    b.order = () => b
    b.limit = () => b
    b.upsert = () => { b._op = 'upsert'; return b }
    b.insert = () => { b._op = 'insert'; return b }
    b.update = () => { b._op = 'update'; return b }
    b.maybeSingle = () => resolve(table, b._op)
    b.single = () => resolve(table, b._op)
    b.then = (onF: any, onR: any) => resolve(table, b._op).then(onF, onR)
    return b
  }

  // deno-lint-ignore no-explicit-any
  const supa: any = {
    from: (t: string) => builder(t),
    rpc: (name: string) => {
      if (name === 'lookup_slot_by_date_time') return Promise.resolve({ data: cfg.slotId === undefined ? 101 : cfg.slotId, error: null })
      if (name === 'check_gap_safety')         return Promise.resolve({ data: cfg.gapSafe ?? true, error: null })
      if (name === 'lock_slot_for_booking') {
        log.locks++
        const r = cfg.lockResults ? (cfg.lockResults[lockIdx++] ?? false) : true
        return Promise.resolve({ data: r, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    _log: log,
  }
  return supa
}

const VALID_INPUT = { service_id: 'gel_hands', date: '2026-06-22', time: '10:00', customer_name: 'דנה' }
// deno-lint-ignore no-explicit-any
function ctx(supa: any, extra: Record<string, unknown> = {}) {
  return { supabase: supa, phone: '+972501234567', clientId: null, channel: 'whatsapp', history: [], ...extra }
}
const bookTool = TOOL_REGISTRY.get('book_appointment')!

// ── 1. Malformed LLM tool-args → rejected before any DB write ────────────────────
Deno.test('book: malformed LLM args are rejected, DB untouched', async () => {
  const supa = makeMock()
  // deno-lint-ignore no-explicit-any
  const res = await bookTool.execute({ ...VALID_INPUT, date: '2026/06/22' } as any, ctx(supa)) as any
  assertEquals(res.success, false)
  assertEquals(res.error, 'invalid_input')
  assertEquals(supa._log.locks, 0)          // never reached the slot lock
})

Deno.test('book: garbage service id is rejected', async () => {
  const supa = makeMock()
  // deno-lint-ignore no-explicit-any
  const res = await bookTool.execute({ ...VALID_INPUT, service_id: 'DROP TABLE;' } as any, ctx(supa)) as any
  assertEquals(res.success, false)
  assertEquals(res.error, 'invalid_input')
  assertEquals(supa._log.locks, 0)
})

// ── 2. DB timeout during INSERT → slot released (try/finally), no ghost lock ──────
Deno.test({
  name: 'book: DB timeout on INSERT releases the slot (no ghost lock)',
  sanitizeOps: false, sanitizeResources: false,
  fn: async () => {
    const supa = makeMock({ insertThrows: true })
    // deno-lint-ignore no-explicit-any
    const res = await bookTool.execute(VALID_INPUT as any, ctx(supa)) as any
    assertEquals(res.success, false)
    assert(supa._log.locks === 1, 'slot was locked once')
    assert(supa._log.slotReleased, 'finally{} must release the held slot')
  },
})

Deno.test({
  name: 'book: INSERT error releases the slot and returns booking_failed',
  sanitizeOps: false, sanitizeResources: false,
  fn: async () => {
    const supa = makeMock({ insertErr: { message: 'constraint' } })
    // deno-lint-ignore no-explicit-any
    const res = await bookTool.execute(VALID_INPUT as any, ctx(supa)) as any
    assertEquals(res.success, false)
    assertEquals(res.error, 'booking_failed')
    assert(supa._log.slotReleased, 'slot must be released on insert error')
  },
})

// ── 3. Concurrent booking on the same slot → exactly one winner ──────────────────
Deno.test({
  name: 'book: concurrent booking — atomic lock yields exactly one winner',
  sanitizeOps: false, sanitizeResources: false,
  fn: async () => {
    const supa = makeMock({ lockResults: [true, false] })  // DB grants the lock once
    const [a, b] = await Promise.all([
      // deno-lint-ignore no-explicit-any
      bookTool.execute(VALID_INPUT as any, ctx(supa)) as any,
      // deno-lint-ignore no-explicit-any
      bookTool.execute(VALID_INPUT as any, ctx(supa)) as any,
    ])
    const successes = [a, b].filter(r => r.success)
    const losers    = [a, b].filter(r => !r.success)
    assertEquals(successes.length, 1, 'exactly one booking succeeds')
    assertEquals(losers.length, 1)
    assertEquals(losers[0].error, 'slot_not_available')
  },
})

// ── Happy path + abuse cap ───────────────────────────────────────────────────────
Deno.test({
  name: 'book: happy path returns a Hebrew confirmation',
  sanitizeOps: false, sanitizeResources: false,
  fn: async () => {
    const supa = makeMock()
    // deno-lint-ignore no-explicit-any
    const res = await bookTool.execute(VALID_INPUT as any, ctx(supa)) as any
    assertEquals(res.success, true)
    assertStringIncludes(res.confirmation, 'קבעתי לך תור')
    assert(supa._log.appointmentInserted)
    assert(!supa._log.slotReleased, 'a committed booking must NOT release its slot')
  },
})

Deno.test('book: rejects when phone is missing from context (no spoofing)', async () => {
  const supa = makeMock()
  // deno-lint-ignore no-explicit-any
  const res = await bookTool.execute(VALID_INPUT as any, ctx(supa, { phone: null })) as any
  assertEquals(res.success, false)
  assertEquals(res.error, 'no_verified_phone')
})

Deno.test('book: anti-abuse cap blocks a 4th pending booking', async () => {
  const supa = makeMock({ pendingCount: 3 })
  // deno-lint-ignore no-explicit-any
  const res = await bookTool.execute(VALID_INPUT as any, ctx(supa)) as any
  assertEquals(res.success, false)
  assertEquals(res.error, 'too_many_pending')
  assertEquals(supa._log.locks, 0)
})

// ── Circuit breaker ──────────────────────────────────────────────────────────────
Deno.test('circuit breaker: opens after 3 consecutive failures, resets on success', () => {
  let t = 1000
  const cb = createCircuitBreaker(3, 1000, () => t)
  cb.recordFailure(); cb.recordFailure(); assert(!cb.isOpen(), 'still closed after 2')
  cb.recordFailure(); assert(cb.isOpen(), 'open after 3')
  t += 1001; assert(!cb.isOpen(), 'half-open after cooldown')
  cb.recordFailure(); cb.recordFailure(); cb.recordSuccess()
  cb.recordFailure(); cb.recordFailure(); assert(!cb.isOpen(), 'success reset the counter')
})

// ── Render & history resilience ──────────────────────────────────────────────────
Deno.test('renderForWhatsApp: strips raw tokens and tidies whitespace', () => {
  const out = renderForWhatsApp('בחרי שירות [SVC:gel_hands] או דברי איתי [WA]\n\n\n\nסיום   ')
  assert(!out.includes('[SVC:'), 'SVC chip stripped')
  assert(!out.includes('[WA]'), 'WA token translated')
  assertStringIncludes(out, 'wa.me/972547686865')
  assert(!out.includes('\n\n\n'), 'blank-line runs collapsed')
})

Deno.test('renderForWhatsApp: never throws on empty/garbage', () => {
  assertEquals(renderForWhatsApp(''), '')
  // deno-lint-ignore no-explicit-any
  assertEquals(renderForWhatsApp(undefined as any), '')
})

Deno.test('trimHistory: caps length and keeps user-first alternation', () => {
  const turns: ChatTurn[] = []
  for (let i = 0; i < 30; i++) turns.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'm' + i })
  const out = trimHistory(turns)
  assert(out.length <= 20)
  assertEquals(out[0].role, 'user', 'window must start with a user turn')
})

Deno.test('maskPhone: never leaks more than the last 4 digits', () => {
  assertEquals(maskPhone('+972501234567'), '****4567')
  assertEquals(maskPhone(null), 'unknown')
})

Deno.test('scrubPhones: redacts phone numbers leaking via Twilio error bodies', () => {
  const leak = "Twilio WA 400: The 'To' number whatsapp:+972501234567 is not valid"
  const out  = scrubPhones(leak)
  assert(!out.includes('972501234567'), 'E.164 redacted')
  assert(!out.includes('501234567'), 'no digit tail left')
  assertEquals(scrubPhones('0541234567 called'), '****redacted**** called')
})

// ── Twilio signature ─────────────────────────────────────────────────────────────
async function hmacSha1Base64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

Deno.test('verifyTwilioSignature: accepts a valid signature, rejects tampering & missing token', async () => {
  const token = 'test_auth_token'
  const url   = 'https://x.supabase.co/functions/v1/chat-handler'
  const params = new URLSearchParams({ From: 'whatsapp:+972501234567', Body: 'היי', MessageSid: 'SM1' })
  const good = await hmacSha1Base64(token, buildTwilioSignatureBase(url, params))

  assert(await verifyTwilioSignature({ authToken: token, signatureHeader: good, url, params }), 'valid signature accepted')

  const tampered = new URLSearchParams({ From: 'whatsapp:+972500000000', Body: 'היי', MessageSid: 'SM1' })
  assert(!await verifyTwilioSignature({ authToken: token, signatureHeader: good, url, params: tampered }), 'tampered params rejected')

  // fail-closed when the token is absent (e.g. secret unset in prod)
  assert(!await verifyTwilioSignature({ authToken: '', signatureHeader: good, url, params }), 'missing token => reject')
  assert(!await verifyTwilioSignature({ authToken: token, signatureHeader: null, url, params }), 'missing header => reject')
})
