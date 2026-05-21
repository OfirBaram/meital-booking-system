import pg from 'pg';

export class BookingService {
  /** @param {pg.Pool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Atomically locks a slot and creates an appointment via the
   * lock_slot_for_booking PostgreSQL RPC.
   *
   * @param {{
   *   slotId:        number,
   *   clientId:      string,
   *   bookingId:     string,
   *   treatmentType: string,
   *   treatmentName: string,
   *   durationMin:   number,
   *   adminToken:    string,
   * }} params
   * @returns {Promise<{ success: boolean, booking_id?: string, error?: string }>}
   */
  async bookSlot({ slotId, clientId, bookingId, treatmentType, treatmentName, durationMin, adminToken }) {
    const { rows } = await this.pool.query(
      `SELECT lock_slot_for_booking($1, $2, $3::uuid, $4, $5, $6, $7) AS result`,
      [slotId, clientId, bookingId, treatmentType, treatmentName, durationMin, adminToken]
    );
    return rows[0].result;
  }
}
