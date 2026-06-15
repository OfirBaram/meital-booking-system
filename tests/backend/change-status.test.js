import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

// Far-future timestamps — no collision risk with other test files
const SLOT_1_START = '2099-12-20T08:00:00Z'
const SLOT_2_START = '2099-12-21T08:00:00Z'
// BOOKING_ID_1: pending -> approved -> cancelled chain
const BOOKING_ID_1 = 'c3d4e5f6-0000-4000-c000-000000000001'
// BOOKING_ID_2: pending -> rejected chain
const BOOKING_ID_2 = 'c3d4e5f6-0000-4000-c000-000000000002'
const CLIENT_PHONE  = '+972500000097'

let slotId1, slotId2

async function callRpc(bookingId, newStatus) {
  const { rows } = await pool.query(
    'SELECT change_appointment_status($1, $2) AS result',
    [bookingId, newStatus]
  )
  const raw = rows[0].result
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

beforeAll(async () => {
  const starts = [[SLOT_1_START, 1], [SLOT_2_START, 2]]
  for (const [start, key] of starts) {
    const { rows } = await pool.query(`
      INSERT INTO slots (start_time, end_time, status)
      VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'available')
      ON CONFLICT (start_time) DO UPDATE SET status = 'available'
      RETURNING id
    `, [start])
    if (key === 1) slotId1 = Number(rows[0].id)
    else           slotId2 = Number(rows[0].id)
  }

  await pool.query(`
    INSERT INTO clients (phone, full_name)
    VALUES ($1, 'Change Status Test')
    ON CONFLICT (phone) DO UPDATE SET full_name = 'Change Status Test'
  `, [CLIENT_PHONE])

  const { rows: cRows } = await pool.query('SELECT id FROM clients WHERE phone = $1', [CLIENT_PHONE])
  const clientId = cRows[0].id

  await pool.query(`
    INSERT INTO appointments
      (id, client_id, slot_id, treatment_type, treatment_name,
       duration_min, is_verified, status, admin_token)
    VALUES
      ($1, $2, $3, 'gel_hands', 'test', 60, true, 'pending', 'tok-cs-1'),
      ($4, $2, $5, 'gel_hands', 'test', 60, true, 'pending', 'tok-cs-2')
    ON CONFLICT (id) DO NOTHING
  `, [BOOKING_ID_1, clientId, slotId1, BOOKING_ID_2, slotId2])
})

afterAll(async () => {
  await pool.query('DELETE FROM appointments WHERE id IN ($1, $2)', [BOOKING_ID_1, BOOKING_ID_2])
  await pool.query(
    'DELETE FROM slots WHERE start_time IN ($1::timestamptz, $2::timestamptz)',
    [SLOT_1_START, SLOT_2_START]
  )
  await pool.query('DELETE FROM clients WHERE phone = $1', [CLIENT_PHONE])
  await pool.end()
})

describe('change_appointment_status', () => {
  it('returns booking_not_found for a non-existent UUID', async () => {
    const result = await callRpc('00000000-0000-4000-a000-000000000000', 'approved')
    expect(result.success).toBe(false)
    expect(result.error).toBe('booking_not_found')
  })

  it('pending -> approved: appointment approved, slot booked', async () => {
    const result = await callRpc(BOOKING_ID_1, 'approved')
    expect(result.success).toBe(true)

    const { rows: a } = await pool.query('SELECT status FROM appointments WHERE id = $1', [BOOKING_ID_1])
    const { rows: s } = await pool.query('SELECT status FROM slots     WHERE id = $1', [slotId1])
    expect(a[0].status).toBe('approved')
    expect(s[0].status).toBe('booked')
  })

  it('approved -> cancelled: appointment cancelled, slot released to available', async () => {
    const result = await callRpc(BOOKING_ID_1, 'cancelled')
    expect(result.success).toBe(true)

    const { rows: a } = await pool.query('SELECT status FROM appointments WHERE id = $1', [BOOKING_ID_1])
    const { rows: s } = await pool.query('SELECT status FROM slots     WHERE id = $1', [slotId1])
    expect(a[0].status).toBe('cancelled')
    expect(s[0].status).toBe('available')
  })

  it('pending -> rejected: appointment rejected, slot released to available', async () => {
    const result = await callRpc(BOOKING_ID_2, 'rejected')
    expect(result.success).toBe(true)

    const { rows: a } = await pool.query('SELECT status FROM appointments WHERE id = $1', [BOOKING_ID_2])
    const { rows: s } = await pool.query('SELECT status FROM slots     WHERE id = $1', [slotId2])
    expect(a[0].status).toBe('rejected')
    expect(s[0].status).toBe('available')
  })

  it('invalid_transition: rejected -> approved is blocked', async () => {
    const result = await callRpc(BOOKING_ID_2, 'approved')
    expect(result.success).toBe(false)
    expect(result.error).toBe('invalid_transition')
    expect(result.from).toBe('rejected')
    expect(result.to).toBe('approved')
  })

  it('invalid_transition: cancelled -> approved is blocked', async () => {
    const result = await callRpc(BOOKING_ID_1, 'approved')
    expect(result.success).toBe(false)
    expect(result.error).toBe('invalid_transition')
    expect(result.from).toBe('cancelled')
  })
})
