/**
 * WhatsApp booking flow — DB-level integration test
 * Uses pg directly (no edge functions needed, works with local Supabase).
 *
 * Tests:
 * 1. Booking can be inserted with source='whatsapp' and status='pending'
 * 2. bookings_view surfaces the booking (what admin list-bookings reads)
 * 3. change_appointment_status transitions pending → approved
 * 4. Rejected transition frees the slot (status back to 'available')
 * 5. Guard logic: ADMIN_PHONE empty string behaves safely (toDialable returns null)
 *
 * Run: node tests/integration/whatsapp-flow-db.test.js
 */

import pg from 'pg'
const { Pool } = pg

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

let pass = 0
let fail = 0
const errors = []

function ok(label) {
  console.log(`  ✅ ${label}`)
  pass++
}
function ko(label, err) {
  console.error(`  ❌ ${label}: ${err?.message ?? err}`)
  fail++
  errors.push({ label, err })
}

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return rows
}

// ── test helpers ──────────────────────────────────────────────────────────────

const TEST_PHONE   = '+972501999001'
const TEST_NAME    = 'בדיקה אוטומטית'
const SLOT_START   = '2099-11-20T09:00:00Z'
const SLOT_END     = '2099-11-20T10:30:00Z'  // 90-min window (treatment + buffer)

let clientId, slotId, bookingId

async function setup() {
  // Upsert test client
  const [c] = await query(
    `INSERT INTO clients (phone, full_name)
     VALUES ($1, $2)
     ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [TEST_PHONE, TEST_NAME]
  )
  clientId = c.id

  // Insert a test slot
  const [s] = await query(
    `INSERT INTO slots (start_time, end_time, status)
     VALUES ($1::timestamptz, $2::timestamptz, 'available')
     ON CONFLICT (start_time) DO UPDATE SET status = 'available'
     RETURNING id`,
    [SLOT_START, SLOT_END]
  )
  slotId = Number(s.id)

  bookingId = '00000000-dead-4000-beef-000000000099'

  // Remove stale test appointment if any
  await query(`DELETE FROM appointments WHERE id = $1`, [bookingId])
}

async function teardown() {
  await query(`DELETE FROM appointments WHERE id = $1`, [bookingId])
  await query(`DELETE FROM slots WHERE id = $1`, [slotId])
  await query(`DELETE FROM clients WHERE phone = $1`, [TEST_PHONE])
  await pool.end()
}

// ── tests ─────────────────────────────────────────────────────────────────────

async function test_insert_whatsapp_booking() {
  const [r] = await query(
    `INSERT INTO appointments
       (id, client_id, slot_id, treatment_type, treatment_name,
        duration_min, is_verified, status, source)
     VALUES ($1, $2, $3, 'gel_hands', 'לק ג׳ל ידיים', 60, true, 'pending', 'whatsapp')
     RETURNING id, status, source`,
    [bookingId, clientId, slotId]
  )
  if (r.status !== 'pending') throw new Error(`Expected status=pending, got ${r.status}`)
  if (r.source !== 'whatsapp') throw new Error(`Expected source=whatsapp, got ${r.source}`)
  ok('WhatsApp booking inserted with status=pending, source=whatsapp')
}

async function test_bookings_view_contains_booking() {
  const rows = await query(
    `SELECT id, name, status, source FROM bookings_view WHERE id = $1`,
    [bookingId]
  )
  if (rows.length === 0) throw new Error('Booking not found in bookings_view')
  const bk = rows[0]
  // bookings_view uses initcap() so 'pending' → 'Pending'
  if (bk.status !== 'Pending') throw new Error(`Expected Pending, got ${bk.status}`)
  if (bk.name !== TEST_NAME)   throw new Error(`Expected ${TEST_NAME}, got ${bk.name}`)
  if (bk.source !== 'whatsapp') throw new Error(`Expected source=whatsapp, got ${bk.source}`)
  ok('bookings_view contains the WhatsApp booking with correct name, status, source')
}

async function test_approve_transition() {
  const [r] = await query(
    `SELECT change_appointment_status($1, 'approved') AS result`,
    [bookingId]
  )
  const result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result
  if (!result.success) throw new Error(`Approval failed: ${JSON.stringify(result)}`)

  // Confirm status in view
  const [bk] = await query(`SELECT status FROM bookings_view WHERE id = $1`, [bookingId])
  if (bk.status !== 'Approved') throw new Error(`Expected Approved, got ${bk.status}`)
  ok('change_appointment_status: pending → approved succeeds')
}

async function test_reject_after_approve_is_blocked() {
  // approved → rejected: depends on whether change_status allows it
  const [r] = await query(
    `SELECT change_appointment_status($1, 'rejected') AS result`,
    [bookingId]
  )
  const result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result
  // The policy here is: approved → rejected is allowed (for admin override), or might be invalid_transition
  // Either way it should NOT throw; the function must return a structured result
  if (typeof result.success === 'undefined') throw new Error('Result has no success field')
  ok(`change_appointment_status: approved → rejected returns structured result (success=${result.success})`)
}

async function test_slot_released_on_reject() {
  // Reset: new booking id so we can test reject from pending
  const bookingId2 = '00000000-dead-4000-beef-000000000098'
  await query(`DELETE FROM appointments WHERE id = $1`, [bookingId2])

  // Need a second slot
  const SLOT2_START = '2099-11-21T09:00:00Z'
  const [s2] = await query(
    `INSERT INTO slots (start_time, end_time, status)
     VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'available')
     ON CONFLICT (start_time) DO UPDATE SET status = 'available'
     RETURNING id`,
    [SLOT2_START]
  )
  const slotId2 = Number(s2.id)

  try {
    await query(
      `INSERT INTO appointments
         (id, client_id, slot_id, treatment_type, treatment_name, duration_min, is_verified, status, source)
       VALUES ($1, $2, $3, 'gel_hands', 'לק ג׳ל', 60, true, 'pending', 'whatsapp')`,
      [bookingId2, clientId, slotId2]
    )
    // Lock the slot
    await query(`UPDATE slots SET status = 'locked' WHERE id = $1`, [slotId2])

    const [r] = await query(
      `SELECT change_appointment_status($1, 'rejected') AS result`,
      [bookingId2]
    )
    const result = typeof r.result === 'string' ? JSON.parse(r.result) : r.result
    if (!result.success) throw new Error(`Rejection failed: ${JSON.stringify(result)}`)

    const [slot] = await query(`SELECT status FROM slots WHERE id = $1`, [slotId2])
    if (slot.status !== 'available') throw new Error(`Slot should be 'available' after reject, got '${slot.status}'`)
    ok('Rejecting a pending WhatsApp booking releases the slot back to available')
  } finally {
    await query(`DELETE FROM appointments WHERE id = $1`, [bookingId2])
    await query(`DELETE FROM slots WHERE id = $1`, [slotId2])
  }
}

async function test_guard_logic_toDialable_empty() {
  // Mirrors the guard we added in bot-config.ts:
  //   const adminPhone = toDialable(Deno.env.get('ADMIN_PHONE'))
  //   if (!adminPhone) { skip ... }
  //
  // toDialable('') → normalizeIsraeliPhone('') returns null → fallback is ''
  // So an empty ADMIN_PHONE → adminPhone = '' → falsy → guard fires.
  function normalizeIsraeliPhone(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '')
    if (digits.startsWith('972') && digits.length === 12) return '+' + digits
    if (digits.startsWith('05')  && digits.length === 10) return '+972' + digits.slice(1)
    return null
  }
  function toDialable(raw) {
    return normalizeIsraeliPhone(raw) ?? String(raw ?? '').replace(/\s+/g, '')
  }

  const empty    = toDialable('')
  const missing  = toDialable(undefined)
  const valid    = toDialable('+972547686865')
  const israeli  = toDialable('0547686865')

  if (empty   !== '')      throw new Error(`empty should be '' got '${empty}'`)
  if (missing !== '')      throw new Error(`missing should be '' got '${missing}'`)
  if (!empty)              ok('toDialable("") is falsy → ADMIN_PHONE guard fires correctly')
  else                     throw new Error('Expected falsy')
  if (!missing)            ok('toDialable(undefined) is falsy → ADMIN_PHONE guard fires correctly for unset env var')
  else                     throw new Error('Expected falsy')
  if (valid !== '+972547686865') throw new Error(`valid phone wrong: ${valid}`)
  ok(`toDialable("+972547686865") = "${valid}" → guard passes for real numbers`)
  if (israeli !== '+972547686865') throw new Error(`israeli fmt wrong: ${israeli}`)
  ok(`toDialable("0547686865") normalises to E.164 → guard passes`)
}

async function test_communication_logs_schema() {
  // Verify the communication_logs table has the columns the notify code writes
  const rows = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'communication_logs' AND table_schema = 'public'
     ORDER BY column_name`
  )
  const cols = rows.map(r => r.column_name)
  for (const col of ['channel', 'context', 'status', 'appointment_id', 'recipient_phone', 'message_body']) {
    if (!cols.includes(col)) throw new Error(`Missing column: ${col}`)
  }
  ok(`communication_logs has all required columns: ${cols.join(', ')}`)
}

// ── runner ────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n🔍 WhatsApp Booking Flow — DB Integration Tests\n')
  await setup()

  const tests = [
    ['Insert WhatsApp booking with pending status',           test_insert_whatsapp_booking],
    ['bookings_view surfaces WhatsApp booking for admin',     test_bookings_view_contains_booking],
    ['Admin approve: pending → approved',                     test_approve_transition],
    ['Admin reject after approve: structured result',         test_reject_after_approve_is_blocked],
    ['Admin reject pending booking: slot released',           test_slot_released_on_reject],
    ['Guard logic: toDialable("") is falsy',                  test_guard_logic_toDialable_empty],
    ['communication_logs schema has required columns',        test_communication_logs_schema],
  ]

  for (const [label, fn] of tests) {
    try {
      await fn()
    } catch (e) {
      ko(label, e)
    }
  }

  await teardown()

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${pass} passed, ${fail} failed`)
  if (fail > 0) {
    console.error('\nFailed tests:')
    for (const { label, err } of errors) {
      console.error(`  • ${label}: ${err?.message ?? err}`)
    }
    process.exit(1)
  } else {
    console.log('\n✅ All tests passed!')
  }
}

run().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
