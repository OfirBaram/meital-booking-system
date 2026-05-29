import { describe, it, expect } from 'vitest';
import { hmacSha256Hex, timingSafeEqualHex, verifyHmacToken } from '../../supabase/functions/_shared/crypto.ts';

describe('hmacSha256Hex', () => {
  it('matches the known RFC-style test vector for "key"/"The quick brown fox..."', async () => {
    // Standard HMAC-SHA256 vector.
    const hex = await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog');
    expect(hex).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
  it('is deterministic and hex-encoded (64 chars)', async () => {
    const a = await hmacSha256Hex('s', 'booking-id-123');
    const b = await hmacSha256Hex('s', 'booking-id-123');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timingSafeEqualHex', () => {
  it('true for identical strings', () => {
    expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true);
  });
  it('false for different length or content', () => {
    expect(timingSafeEqualHex('abcd', 'abc')).toBe(false);
    expect(timingSafeEqualHex('abcd', 'abce')).toBe(false);
  });
});

describe('verifyHmacToken', () => {
  it('accepts a valid token and rejects a forged one', async () => {
    const secret = 'top-secret';
    const id     = 'c3d4e5f6-0000-4000-c000-000000000001';
    const good   = await hmacSha256Hex(secret, id);
    expect(await verifyHmacToken(secret, id, good)).toBe(true);
    expect(await verifyHmacToken(secret, id, good.replace(/.$/, '0'))).toBe(false);
    expect(await verifyHmacToken(secret, id, '')).toBe(false);
    expect(await verifyHmacToken('', id, good)).toBe(false);
  });
});
