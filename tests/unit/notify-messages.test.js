import { describe, it, expect } from 'vitest';
import {
  hebrewDayLabel, formatDateDmy, fullDateLabel,
  buildClientStatusSms, buildAdminNewBookingSms,
} from '../../supabase/functions/_shared/messages.ts';

describe('hebrewDayLabel', () => {
  it('maps known dates to the right Hebrew weekday', () => {
    expect(hebrewDayLabel('2024-01-01')).toBe('יום שני');   // Monday
    expect(hebrewDayLabel('2026-05-29')).toBe('יום שישי');  // Friday
    expect(hebrewDayLabel('2026-06-28')).toBe('יום ראשון'); // Sunday (the bug-3 booking date)
  });
  it('returns empty string on malformed input (never "undefined")', () => {
    expect(hebrewDayLabel('not-a-date')).toBe('');
    expect(hebrewDayLabel(undefined)).toBe('');
  });
});

describe('formatDateDmy / fullDateLabel', () => {
  it('formats DD.MM.YYYY', () => {
    expect(formatDateDmy('2026-06-28')).toBe('28.06.2026');
  });
  it('combines day name + numeric date', () => {
    expect(fullDateLabel('2026-06-28')).toBe('יום ראשון, 28.06.2026');
  });
});

describe('buildClientStatusSms', () => {
  const f = { serviceName: 'לק ג׳ל קלאסי', date: '2026-06-28', time: '18:30' };

  it('approved message includes day name and time, no undefined', () => {
    const msg = buildClientStatusSms('approved', f);
    expect(msg).toContain('אושרה');
    expect(msg).toContain('יום ראשון, 28.06.2026 בשעה 18:30');
    expect(msg).not.toContain('undefined');
  });
  it('rejected message names the slot', () => {
    const msg = buildClientStatusSms('rejected', f);
    expect(msg).toContain('לא אושרה');
    expect(msg).toContain('יום ראשון, 28.06.2026 בשעה 18:30');
  });
  it('cancelled message names the slot', () => {
    const msg = buildClientStatusSms('cancelled', f);
    expect(msg).toContain('בוטל');
    expect(msg).toContain('יום ראשון, 28.06.2026 בשעה 18:30');
  });
  it('falls back gracefully when serviceName is missing (no undefined)', () => {
    const msg = buildClientStatusSms('approved', { serviceName: undefined, date: '2026-06-28', time: '18:30' });
    expect(msg).not.toContain('undefined');
  });
});

describe('buildAdminNewBookingSms', () => {
  const msg = buildAdminNewBookingSms({
    name: 'דנה', phone: '+972541234567', serviceName: 'לק ג׳ל',
    date: '2026-06-28', time: '18:30',
    approveUrl: 'https://x.supabase.co/functions/v1/admin-action?action=approve&bookingId=1&token=ab',
    rejectUrl:  'https://x.supabase.co/functions/v1/admin-action?action=reject&bookingId=1&token=ab',
  });
  it('contains the Hebrew day name', () => {
    expect(msg).toContain('יום ראשון, 28.06.2026 בשעה 18:30');
  });
  it('contains clickable https links and never "undefined"', () => {
    expect(msg).toContain('https://x.supabase.co/functions/v1/admin-action?action=approve');
    expect(msg).toContain('https://x.supabase.co/functions/v1/admin-action?action=reject');
    expect(msg).not.toContain('undefined');
  });
});
