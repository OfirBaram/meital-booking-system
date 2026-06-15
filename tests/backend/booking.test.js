import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { BookingService } from '../../src/services/BookingService.js';

// ── shared pool ──────────────────────────────────────────────────
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

// ── deterministic test fixtures ──────────────────────────────────
const SLOT_START     = '2099-12-01T09:00:00Z'; // far future → no collision risk
const BOOKING_ID     = 'a1b2c3d4-0000-4000-a000-000000000001';
const BOOKING_ID_2   = 'a1b2c3d4-0000-4000-a000-000000000002'; // for double-book test
const CLIENT_PHONE   = '+972500000099';

let slotId;
let clientId;
let service;

// ── seed ──────────────────────────────────────────────────────────
beforeAll(async () => {
  service = new BookingService(pool);

  // Insert test slot (start_time unique — safe as long as tests run < year 2099)
  const { rows: slotRows } = await pool.query(`
    INSERT INTO slots (start_time, end_time, status)
    VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'available')
    ON CONFLICT (start_time) DO UPDATE SET status = 'available'
    RETURNING id
  `, [SLOT_START]);
  slotId = Number(slotRows[0].id); // pg returns bigint as string

  // Insert test client
  const { rows: clientRows } = await pool.query(`
    INSERT INTO clients (phone, full_name)
    VALUES ($1, 'Test Client')
    ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id
  `, [CLIENT_PHONE]);
  clientId = clientRows[0].id;
});

// ── teardown ─────────────────────────────────────────────────────
afterAll(async () => {
  await pool.query(`DELETE FROM appointments WHERE id IN ($1, $2)`, [BOOKING_ID, BOOKING_ID_2]);
  await pool.query(`DELETE FROM slots      WHERE start_time = $1::timestamptz`, [SLOT_START]);
  await pool.query(`DELETE FROM clients    WHERE phone = $1`, [CLIENT_PHONE]);
  await pool.end();
});

// ── tests ─────────────────────────────────────────────────────────
describe('BookingService.bookSlot', () => {

  it('returns success: true for an available slot', async () => {
    const result = await service.bookSlot({
      slotId,
      clientId,
      bookingId:     BOOKING_ID,
      treatmentType: 'gel_hands',
      treatmentName: 'gel classic',
      durationMin:   60,
      adminToken:    'test-hmac-token',
    });

    expect(result.success).toBe(true);
    expect(result.booking_id).toBe(BOOKING_ID);
  });

  it('creates the appointment row with correct fields', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM appointments WHERE id = $1`,
      [BOOKING_ID]
    );

    expect(rows).toHaveLength(1);
    const appt = rows[0];
    expect(appt.treatment_type).toBe('gel_hands');
    expect(appt.status).toBe('pending');
    expect(appt.is_verified).toBe(true);
    expect(appt.client_id).toBe(clientId);
    expect(Number(appt.slot_id)).toBe(slotId); // bigint comes back as string from pg
    expect(appt.admin_token).toBe('test-hmac-token');
  });

  it('marks the slot as locked', async () => {
    const { rows } = await pool.query(
      `SELECT status FROM slots WHERE id = $1`,
      [slotId]
    );
    expect(rows[0].status).toBe('locked');
  });

  it('returns slot_not_available when the same slot is booked again', async () => {
    const result = await service.bookSlot({
      slotId,
      clientId,
      bookingId:     BOOKING_ID_2,
      treatmentType: 'gel_hands',
      treatmentName: 'gel classic',
      durationMin:   60,
      adminToken:    'test-hmac-token-2',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('slot_not_available');
  });

  it('does not create an appointment for the failed double-book', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM appointments WHERE id = $1`,
      [BOOKING_ID_2]
    );
    expect(rows).toHaveLength(0);
  });

  it('returns booking_id_exists when booking_id collides with a different slot', async () => {
    // Create a fresh available slot
    const SLOT2_START = '2099-12-01T11:00:00Z';
    await pool.query(`DELETE FROM slots WHERE start_time = $1::timestamptz`, [SLOT2_START]);
    const { rows: s2rows } = await pool.query(
      `INSERT INTO slots (start_time, end_time, status)
       VALUES ($1::timestamptz, $1::timestamptz + interval '90 minutes', 'available')
       RETURNING id`,
      [SLOT2_START]
    );
    const slot2Id = Number(s2rows[0].id);

    // Reuse BOOKING_ID (already inserted in test 1) with the new slot
    const result = await service.bookSlot({
      slotId:        slot2Id,
      clientId,
      bookingId:     BOOKING_ID,   // collision
      treatmentType: 'gel_hands',
      treatmentName: 'gel classic',
      durationMin:   60,
      adminToken:    'test-hmac-token-dup',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('booking_id_exists');

    // Slot2 must be rolled back to 'available'
    const { rows } = await pool.query(`SELECT status FROM slots WHERE id = $1`, [slot2Id]);
    expect(rows[0].status).toBe('available');

    await pool.query(`DELETE FROM slots WHERE start_time = $1::timestamptz`, [SLOT2_START]);
  });

});
