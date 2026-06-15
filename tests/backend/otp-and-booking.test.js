import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

const SLOT_START   = '2099-11-15T08:00:00Z'  // 10:00 Jerusalem winter (UTC+2)
const SLOT_END     = '2099-11-15T09:30:00Z'
const CLIENT_PHONE = '+972500000096'
const BOOKING_ID   = 'd4e5f6a7-0000-4000-d000-000000000001'

async function query(sql, params = []) {
  const { rows } = await pool.query(sql, params)
  return rows
}

beforeAll(async () => {
  await query('DELETE FROM appointments WHERE id = $1', [BOOKING_ID])
  await query('DELETE FROM clients WHERE phone = $1', [CLIENT_PHONE])
  await query('DELETE FROM slots WHERE start_time = $1', [SLOT_START])
  await query('DELETE FROM otp_requests WHERE phone = $1', [CLIENT_PHONE])
  await query(
    `INSERT INTO slots (start_time, end_time, status) VALUES ($1, $2, 'available')`,
    [SLOT_START, SLOT_END],
  )
})

afterAll(async () => {
  await query('DELETE FROM appointments WHERE id = $1', [BOOKING_ID])
  await query('DELETE FROM clients WHERE phone = $1', [CLIENT_PHONE])
  await query('DELETE FROM slots WHERE start_time = $1', [SLOT_START])
  await query('DELETE FROM otp_requests WHERE phone = $1', [CLIENT_PHONE])
  await pool.end()
})

describe('otp_requests — storage and lifecycle', () => {
  const OTP_HASH = 'aabbcc112233deadbeef'

  beforeEach(async () => {
    await query('DELETE FROM otp_requests WHERE phone = $1', [CLIENT_PHONE])
  })

  it('inserts a row and finds it as unexpired + unused', async () => {
    await query(
      `INSERT INTO otp_requests (phone, otp_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      [CLIENT_PHONE, OTP_HASH],
    )
    const rows = await query(
      `SELECT id FROM otp_requests
       WHERE phone = $1 AND used = false AND expires_at > now()`,
      [CLIENT_PHONE],
    )
    expect(rows).toHaveLength(1)
  })

  it('mark-used is atomic: second update returns 0 rows', async () => {
    await query(
      `INSERT INTO otp_requests (phone, otp_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      [CLIENT_PHONE, OTP_HASH],
    )
    const [{ id }] = await query(
      'SELECT id FROM otp_requests WHERE phone = $1 AND used = false',
      [CLIENT_PHONE],
    )
    const r1 = await query(
      'UPDATE otp_requests SET used = true'
      + ' WHERE id = $1 AND used = false AND expires_at > now() RETURNING id',
      [id],
    )
    expect(r1).toHaveLength(1)
    const r2 = await query(
      'UPDATE otp_requests SET used = true'
      + ' WHERE id = $1 AND used = false AND expires_at > now() RETURNING id',
      [id],
    )
    expect(r2).toHaveLength(0)
  })

  it('rate-limit query: 0 for a phone with no recent row', async () => {
    const [{ count }] = await query(
      `SELECT count(*) FROM otp_requests
       WHERE phone = $1 AND created_at > now() - interval '30 seconds'`,
      [CLIENT_PHONE],
    )
    expect(parseInt(count)).toBe(0)
  })

  it('rate-limit query: 1 after an OTP insert for the same phone', async () => {
    await query(
      `INSERT INTO otp_requests (phone, otp_hash, expires_at)
       VALUES ($1, $2, now() + interval '5 minutes')`,
      [CLIENT_PHONE, OTP_HASH],
    )
    const [{ count }] = await query(
      `SELECT count(*) FROM otp_requests
       WHERE phone = $1 AND created_at > now() - interval '30 seconds'`,
      [CLIENT_PHONE],
    )
    expect(parseInt(count)).toBe(1)
  })

  it('expired rows are not returned by the active-OTP query', async () => {
    await query(
      `INSERT INTO otp_requests (phone, otp_hash, expires_at)
       VALUES ($1, $2, now() - interval '1 second')`,
      [CLIENT_PHONE, OTP_HASH],
    )
    const rows = await query(
      `SELECT id FROM otp_requests
       WHERE phone = $1 AND used = false AND expires_at > now()`,
      [CLIENT_PHONE],
    )
    expect(rows).toHaveLength(0)
  })
})

describe('lookup_slot_by_date_time', () => {
  it('returns slot id for an available slot at 10:00 Jerusalem', async () => {
    const [row] = await query(`SELECT lookup_slot_by_date_time('2099-11-15', '10:00')`)
    const slotId = row.lookup_slot_by_date_time
    expect(slotId).not.toBeNull()
    expect(typeof slotId).toBe('string')  // pg returns BIGINT as string
  })

  it('returns null for a date/time with no available slot', async () => {
    const [row] = await query(`SELECT lookup_slot_by_date_time('2099-01-01', '09:00')`)
    expect(row.lookup_slot_by_date_time).toBeNull()
  })
})

describe('full booking flow — OTP lifecycle + slot lock', () => {
  it('upserts client, looks up slot, and locks it atomically', async () => {
    const [{ id: clientId }] = await query(
      `INSERT INTO clients (phone, full_name)
       VALUES ($1, 'שרה לוי')
       ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [CLIENT_PHONE],
    )

    const [slotRow] = await query(`SELECT lookup_slot_by_date_time('2099-11-15', '10:00')`)
    const slotId = slotRow.lookup_slot_by_date_time
    expect(slotId).not.toBeNull()

    // lock_slot_for_booking now takes a single TEXT arg and returns BOOLEAN
    const [{ lock_slot_for_booking: locked }] = await query(
      `SELECT lock_slot_for_booking($1::TEXT)`,
      [slotId],
    )
    expect(locked).toBe(true)

    // Appointment INSERT is now the Edge Function responsibility (app layer)
    await query(
      `INSERT INTO appointments
         (id, slot_id, client_id, treatment_type, treatment_name, duration_min, admin_token, status, is_verified)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'pending', true)`,
      [BOOKING_ID, slotId, clientId, 'gel_hands', "לק ג'ל לציפורניים", 60, 'fake-admin-token'],
    )

    // Slot must be 'locked' (simplified function sets 'locked', not 'pending')
    const [slot] = await query('SELECT status FROM slots WHERE id = $1', [slotId])
    expect(slot.status).toBe('locked')

    const [appt] = await query(
      'SELECT status, treatment_type FROM appointments WHERE id = $1',
      [BOOKING_ID],
    )
    expect(appt.status).toBe('pending')
    expect(appt.treatment_type).toBe('gel_hands')
  })

  it('lookup_slot_by_date_time returns null once slot is no longer available', async () => {
    // Slot was locked by the previous test; lookup filters status = 'available' only
    const [row] = await query(`SELECT lookup_slot_by_date_time('2099-11-15', '10:00')`)
    expect(row.lookup_slot_by_date_time).toBeNull()
  })

  it('DB enforces unique booking_id — duplicate insert raises a unique_violation', async () => {
    // lock_slot_for_booking no longer handles booking_id collisions (moved to app layer).
    // Verify the DB unique constraint still exists so BookingService can rely on code 23505.
    const SLOT2_START = '2099-11-15T10:00:00Z'
    const SLOT2_END   = '2099-11-15T11:30:00Z'
    await query('DELETE FROM slots WHERE start_time = $1', [SLOT2_START])
    await query(
      `INSERT INTO slots (start_time, end_time, status) VALUES ($1, $2, 'available')`,
      [SLOT2_START, SLOT2_END],
    )
    const [{ id: slot2Id }] = await query(
      'SELECT id FROM slots WHERE start_time = $1', [SLOT2_START],
    )
    const [{ id: clientId }] = await query(
      'SELECT id FROM clients WHERE phone = $1', [CLIENT_PHONE],
    )

    const [{ lock_slot_for_booking: locked2 }] = await query(
      `SELECT lock_slot_for_booking($1::TEXT)`, [slot2Id],
    )
    expect(locked2).toBe(true)

    let caughtCode = null
    try {
      await query(
        `INSERT INTO appointments
           (id, slot_id, client_id, treatment_type, treatment_name, duration_min, admin_token, status, is_verified)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'pending', true)`,
        [BOOKING_ID, slot2Id, clientId, 'gel_hands', "לק ג'ל לציפורניים", 60, 'fake-admin-token'],
      )
    } catch (err) {
      caughtCode = err.code
    }
    expect(caughtCode).toBe('23505')

    await query('DELETE FROM slots WHERE start_time = $1', [SLOT2_START])
  })
})
