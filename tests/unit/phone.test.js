import { describe, it, expect } from 'vitest';
import { normalizeIsraeliPhone, toDialable } from '../../supabase/functions/_shared/phone.ts';

describe('normalizeIsraeliPhone', () => {
  it('strips the stray space in the ADMIN_PHONE secret (the 2026-05-31 bug)', () => {
    expect(normalizeIsraeliPhone('+972 542290881')).toBe('+972542290881');
  });
  it('passes a clean E.164 number through unchanged', () => {
    expect(normalizeIsraeliPhone('+972542290881')).toBe('+972542290881');
  });
  it('converts local 05X to E.164', () => {
    expect(normalizeIsraeliPhone('0542290881')).toBe('+972542290881');
  });
  it('tolerates dashes/spaces in local form', () => {
    expect(normalizeIsraeliPhone('054-229-0881')).toBe('+972542290881');
  });
  it('returns null when it cannot form a valid number', () => {
    expect(normalizeIsraeliPhone('12345')).toBeNull();
    expect(normalizeIsraeliPhone('')).toBeNull();
    expect(normalizeIsraeliPhone(null)).toBeNull();
    expect(normalizeIsraeliPhone(undefined)).toBeNull();
  });
});

describe('toDialable', () => {
  it('returns strict E.164 for a normalisable number', () => {
    expect(toDialable('+972 542290881')).toBe('+972542290881');
    expect(toDialable('0542290881')).toBe('+972542290881');
  });
  it('falls back to a whitespace-stripped raw rather than dropping the send', () => {
    // Not a recognised Israeli shape, but we still hand Twilio something to try.
    expect(toDialable('+1 415 555 0100')).toBe('+14155550100');
  });
  it('never returns null/undefined (always a string)', () => {
    expect(toDialable(null)).toBe('');
    expect(toDialable(undefined)).toBe('');
  });
});
