import { describe, it, expect, afterAll } from 'vitest';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

afterAll(() => pool.end());

describe('database connection', () => {
  it('connects to local Supabase and SELECT 1 returns 1', async () => {
    const { rows } = await pool.query('SELECT 1 AS value');
    expect(rows[0].value).toBe(1);
  });
});
