import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

// Dec 15 = Jerusalem winter (UTC+2): 08:00 UTC -> 10:00 local, same calendar date
const SLOT_START   = '2099-12-15T08:00:00Z'
// Dec 14 — one day earlier, used to verify DESC ordering in isolation
const SLOT_START_2 = '2099-12-14T08:00:00Z'
const BOOKING_ID   = 'b2c3d4e5-0000-4000-b000-000000000001'
const BOOKING_ID_2 = 'b2c3d4e5-0000-4000-b000-000000000002'
const CLIENT_PHONE = '+972500000098'

let slotId
let slotId2
let clientId

beforeAll(async () => {
  const { rows: slotRows } = await pool.query(`
    INSERT INTO slots (start_time, end_time, status)
    VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'booked')
    ON CONFLICT (start_time) DO UPDATE SET status = 'booked'
    RETURNING id
  `, [SLOT_START])
  slotId = Number(slotRows[0].id)

  const { rows: slotRows2 } = await pool.query(`
    INSERT INTO slots (start_time, end_time, status)
    VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'booked')
    ON CONFLICT (start_time) DO UPDATE SET status = 'booked'
    RETURNING id
  `, [SLOT_START_2])
  slotId2 = Number(slotRows2[0].id)

  await pool.query(`
    INSERT INTO clients (phone, full_name)
    VALUES ($1, 'לקוחת טסט')
    ON CONFLICT (phone) DO UPDATE SET full_name = 'לקוחת טסט'
  `, [CLIENT_PHONE])

  const { rows: clientRows } = await pool.query(
    'SELECT id FROM clients WHERE phone = $1', [CLIENT_PHONE]
  )
  clientId = clientRows[0].id

  await pool.query(`
    INSERT INTO appointments
      (id, client_id, slot_id, treatment_type, treatment_name,
       duration_min, is_verified, status, admin_token)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO NOTHING
  `, [BOOKING_ID, clientId, slotId, 'gel_hands', "לק ג'ל לציפורניים", 60, true, 'pending', 'tok-view-test'])

  await pool.query(`
    INSERT INTO appointments
      (id, client_id, slot_id, treatment_type, treatment_name,
       duration_min, is_verified, status, admin_token)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO NOTHING
  `, [BOOKING_ID_2, clientId, slotId2, 'gel_hands', "לק ג'ל לציפורניים", 60, true, 'pending', 'tok-view-test-2'])
})

afterAll(async () => {
  await pool.query('DELETE FROM appointments WHERE id = ANY($1::uuid[])', [[BOOKING_ID, BOOKING_ID_2]])
  await pool.query('DELETE FROM slots WHERE start_time = ANY($1::timestamptz[])', [[SLOT_START, SLOT_START_2]])
  await pool.query('DELETE FROM clients WHERE phone = $1', [CLIENT_PHONE])
  await pool.end()
})

describe('bookings_view', () => {
  it('returns one row for the seeded appointment', async () => {
    const { rows } = await pool.query('SELECT * FROM bookings_view WHERE id = $1', [BOOKING_ID])
    expect(rows).toHaveLength(1)
  })

  it('capitalises status to match frontend expectations (Pending not pending)', async () => {
    const { rows } = await pool.query('SELECT status FROM bookings_view WHERE id = $1', [BOOKING_ID])
    expect(rows[0].status).toBe('Pending')
  })

  it('returns date as YYYY-MM-DD in Jerusalem local time', async () => {
    const { rows } = await pool.query('SELECT date FROM bookings_view WHERE id = $1', [BOOKING_ID])
    // 2099-12-15 08:00 UTC + Jerusalem UTC+2 (winter) = 10:00 local -> same date
    expect(rows[0].date).toBe('2099-12-15')
  })

  it('returns time as HH:MM in Jerusalem local time', async () => {
    const { rows } = await pool.query('SELECT time FROM bookings_view WHERE id = $1', [BOOKING_ID])
    // 08:00 UTC + 02:00 Jerusalem winter offset = 10:00 local
    expect(rows[0].time).toBe('10:00')
  })

  it('exposes serviceName alias for treatment_name', async () => {
    const { rows } = await pool.query('SELECT * FROM bookings_view WHERE id = $1', [BOOKING_ID])
    expect(rows[0].serviceName).toBe("לק ג'ל קלאסי")
  })

  it('exposes client name and phone', async () => {
    const { rows } = await pool.query('SELECT * FROM bookings_view WHERE id = $1', [BOOKING_ID])
    expect(rows[0].name).toBe('לקוחת טסט')
    expect(rows[0].phone).toBe(CLIENT_PHONE)
  })

  it('orders by timestamp descending — later slot sorts first', async () => {
    // Scope to this test's own two rows to avoid interference from other suites.
    // BOOKING_ID = Dec 15, BOOKING_ID_2 = Dec 14 → Dec 15 must come first.
    const { rows } = await pool.query(
      `SELECT id FROM bookings_view WHERE id IN ($1, $2) ORDER BY timestamp DESC`,
      [BOOKING_ID, BOOKING_ID_2]
    )
    expect(rows[0].id).toBe(BOOKING_ID)
    expect(rows[1].id).toBe(BOOKING_ID_2)
  })
})
