import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
})

// Far-future timestamps — no collision risk with real data
const SLOT_PENDING   = '2099-11-20T08:00:00Z'  // Jerusalem UTC+2 winter -> 10:00 local
const SLOT_APPROVED  = '2099-11-21T08:00:00Z'
const SLOT_REJECTED  = '2099-11-22T08:00:00Z'
const SLOT_CANCELLED = '2099-11-23T08:00:00Z'

const PHONE_ACTIVE   = '+972501110001'  // has Pending + Approved + Rejected + Cancelled
const PHONE_NONE     = '+972501110002'  // has no bookings at all

// Valid UUIDs for each appointment
const ID_PENDING   = 'cab00001-0000-4000-8000-000000000001'
const ID_APPROVED  = 'cab00001-0000-4000-8000-000000000002'
const ID_REJECTED  = 'cab00001-0000-4000-8000-000000000003'
const ID_CANCELLED = 'cab00001-0000-4000-8000-000000000004'

let slotIds = {}
let clientIdActive
let clientIdNone

beforeAll(async () => {
  // Seed slots
  for (const [key, start] of [
    ['pending',   SLOT_PENDING],
    ['approved',  SLOT_APPROVED],
    ['rejected',  SLOT_REJECTED],
    ['cancelled', SLOT_CANCELLED],
  ]) {
    const { rows } = await pool.query(
      `INSERT INTO slots (start_time, end_time, status)
       VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'booked')
       ON CONFLICT (start_time) DO UPDATE SET status = 'booked'
       RETURNING id`,
      [start]
    )
    slotIds[key] = Number(rows[0].id)
  }

  // Seed clients
  for (const [phone, name] of [[PHONE_ACTIVE, 'בעלת תור פעיל'], [PHONE_NONE, 'ללא תורים']]) {
    await pool.query(
      `INSERT INTO clients (phone, full_name) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name`,
      [phone, name]
    )
  }
  const { rows: r1 } = await pool.query('SELECT id FROM clients WHERE phone = $1', [PHONE_ACTIVE])
  clientIdActive = r1[0].id
  const { rows: r2 } = await pool.query('SELECT id FROM clients WHERE phone = $1', [PHONE_NONE])
  clientIdNone = r2[0].id

  // Seed appointments for PHONE_ACTIVE (one per status)
  for (const [id, status, slotKey] of [
    [ID_PENDING,   'pending',   'pending'],
    [ID_APPROVED,  'approved',  'approved'],
    [ID_REJECTED,  'rejected',  'rejected'],
    [ID_CANCELLED, 'cancelled', 'cancelled'],
  ]) {
    await pool.query(
      `INSERT INTO appointments
         (id, client_id, slot_id, treatment_type, treatment_name, duration_min, is_verified, status, admin_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [id, clientIdActive, slotIds[slotKey], 'gel_classic', "לק ג'ל קלאסי", 90, true, status, 'tok-' + status]
    )
  }
})

afterAll(async () => {
  await pool.query(
    `DELETE FROM appointments WHERE id = ANY($1::uuid[])`,
    [[ID_PENDING, ID_APPROVED, ID_REJECTED, ID_CANCELLED]]
  )
  for (const start of [SLOT_PENDING, SLOT_APPROVED, SLOT_REJECTED, SLOT_CANCELLED]) {
    await pool.query('DELETE FROM slots WHERE start_time = $1::timestamptz', [start])
  }
  await pool.query('DELETE FROM clients WHERE phone = ANY($1::text[])', [[PHONE_ACTIVE, PHONE_NONE]])
  await pool.end()
})

// ── helper that mirrors the edge function query ───────────────────────────────

async function checkActiveBooking(phone) {
  const { rows } = await pool.query(
    `SELECT date, time
     FROM bookings_view
     WHERE phone = $1
       AND status IN ('Pending', 'Approved')
     ORDER BY timestamp DESC
     LIMIT 1`,
    [phone]
  )
  if (rows.length === 0) return { active: false }
  return { active: true, date: rows[0].date, time: rows[0].time }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('check-active-booking — DB logic', () => {
  it('returns active:false for a phone with no bookings', async () => {
    const result = await checkActiveBooking(PHONE_NONE)
    expect(result.active).toBe(false)
  })

  it('returns active:false for a completely unknown phone', async () => {
    const result = await checkActiveBooking('+972500000000')
    expect(result.active).toBe(false)
  })

  it('returns active:true when the phone has a Pending booking', async () => {
    const result = await checkActiveBooking(PHONE_ACTIVE)
    expect(result.active).toBe(true)
  })

  it('result includes date in YYYY-MM-DD format', async () => {
    const result = await checkActiveBooking(PHONE_ACTIVE)
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('result includes time in HH:MM format', async () => {
    const result = await checkActiveBooking(PHONE_ACTIVE)
    expect(result.time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('Pending booking date is in Jerusalem local time (UTC+2 winter)', async () => {
    // SLOT_PENDING = 2099-11-20T08:00:00Z, UTC+2 -> 10:00 same date
    const { rows } = await pool.query(
      `SELECT date, time FROM bookings_view WHERE id = '${ID_PENDING}'`
    )
    expect(rows[0].date).toBe('2099-11-20')
    expect(rows[0].time).toBe('10:00')
  })

  it('Approved booking appears in the active check', async () => {
    const { rows } = await pool.query(
      `SELECT date, time FROM bookings_view WHERE id = '${ID_APPROVED}'`
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2099-11-21')
    // Confirmed via bookings_view status = 'Approved'
    const activeRows = await pool.query(
      `SELECT * FROM bookings_view WHERE phone = $1 AND status = 'Approved'`,
      [PHONE_ACTIVE]
    )
    expect(activeRows.rows.length).toBe(1)
  })

  it('Rejected bookings are excluded from the active check', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM bookings_view
       WHERE phone = $1 AND status IN ('Pending', 'Approved') AND id = '${ID_REJECTED}'`,
      [PHONE_ACTIVE]
    )
    expect(rows.length).toBe(0)
  })

  it('Cancelled bookings are excluded from the active check', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM bookings_view
       WHERE phone = $1 AND status IN ('Pending', 'Approved') AND id = '${ID_CANCELLED}'`,
      [PHONE_ACTIVE]
    )
    expect(rows.length).toBe(0)
  })
})
