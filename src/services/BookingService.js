import pg from 'pg';

export class BookingService {
  /** @param {pg.Pool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Locks a slot and creates an appointment.
   * Mirrors the Edge Function's two-step approach:
   *   1. lock_slot_for_booking(slotId) — updates slot to 'locked', returns BOOLEAN
   *   2. INSERT into appointments — application layer, with slot rollback on failure
   *
   * @returns {Promise<{ success: boolean, booking_id?: string, error?: string }>}
   */
  async bookSlot({ slotId, clientId, bookingId, treatmentType, treatmentName, durationMin, adminToken }) {
    const { rows: lockRows } = await this.pool.query(
      `SELECT lock_slot_for_booking($1::TEXT) AS locked`,
      [String(slotId)]
    );
    if (!lockRows[0].locked) {
      return { success: false, error: 'slot_not_available' };
    }

    try {
      await this.pool.query(
        `INSERT INTO appointments
           (id, slot_id, client_id, treatment_type, treatment_name, duration_min, admin_token, status, is_verified)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'pending', true)`,
        [bookingId, slotId, clientId, treatmentType, treatmentName, durationMin, adminToken]
      );
      return { success: true, booking_id: bookingId };
    } catch (err) {
      await this.pool.query(`UPDATE slots SET status = 'available' WHERE id = $1`, [slotId]);
      if (err.code === '23505') {
        return { success: false, error: 'booking_id_exists' };
      }
      throw err;
    }
  }
}
