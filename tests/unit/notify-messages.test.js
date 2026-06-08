import { describe, it, expect } from 'vitest';
import {
  hebrewDayLabel, formatDateDmy, fullDateLabel,
  buildClientStatusSms, buildAdminNewBookingSms, buildAdminFailureAlertSms,
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

  it('approved message includes service, date and time, no undefined', () => {
    const msg = buildClientStatusSms('approved', f);
    expect(msg).toContain('אושר');
    expect(msg).toContain('28.06.2026');
    expect(msg).toContain('18:30');
    expect(msg).not.toContain('undefined');
  });
  it('rejected message names the slot', () => {
    const msg = buildClientStatusSms('rejected', f);
    expect(msg).toContain('נדחתה');
    expect(msg).toContain('28.06.2026');
    expect(msg).toContain('18:30');
  });
  it('cancelled message names the slot', () => {
    const msg = buildClientStatusSms('cancelled', f);
    expect(msg).toContain('בוטל');
    expect(msg).toContain('28.06.2026');
    expect(msg).toContain('18:30');
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
  });
  it('contains the booking details: name, phone, service, date, time', () => {
    expect(msg).toContain('דנה');
    expect(msg).toContain('+972541234567');
    expect(msg).toContain('לק ג׳ל');
    expect(msg).toContain('28.06.2026');
    expect(msg).toContain('18:30');
  });
  it('is LINK-FREE so carriers do not content-filter it, and never says "undefined"', () => {
    expect(msg).not.toMatch(/https?:\/\//);
    expect(msg).not.toContain('undefined');
  });
});

describe('buildAdminFailureAlertSms', () => {
  it('names the client and the failed action in Hebrew', () => {
    const msg = buildAdminFailureAlertSms('ClientApproval', 'דנה כהן', 'Twilio 21610');
    expect(msg).toContain('לא קיבלה');
    expect(msg).toContain('דנה כהן');
    expect(msg).toContain('אישור התור');
    expect(msg).toContain('Twilio 21610');
  });
  it('maps cancellation/rejection contexts', () => {
    expect(buildAdminFailureAlertSms('ClientCancellation', '0501234567')).toContain('ביטול התור');
    expect(buildAdminFailureAlertSms('ClientRejection', '0501234567')).toContain('דחיית התור');
  });
  it('falls back gracefully with no label/detail and never says "undefined"', () => {
    const msg = buildAdminFailureAlertSms('ClientApproval', '');
    expect(msg).toContain('—');
    expect(msg).not.toContain('undefined');
    expect(msg).not.toContain('סיבה:'); // no reason line when detail is absent
  });
  it('truncates an oversized failure detail', () => {
    const msg = buildAdminFailureAlertSms('ClientApproval', 'דנה', 'x'.repeat(500));
    expect(msg.length).toBeLessThan(300);
  });
});
