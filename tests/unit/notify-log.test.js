import { describe, it, expect } from 'vitest';
import {
  statusToContext, buildSmsLogRow,
} from '../../supabase/functions/_shared/notify.ts';

describe('statusToContext', () => {
  it('maps each client status to its communication_logs context', () => {
    expect(statusToContext('approved')).toBe('ClientApproval');
    expect(statusToContext('rejected')).toBe('ClientRejection');
    expect(statusToContext('cancelled')).toBe('ClientCancellation');
  });
  it('is case-insensitive and trims (Capitalized booking status still maps)', () => {
    expect(statusToContext('Approved')).toBe('ClientApproval');
    expect(statusToContext('  CANCELLED ')).toBe('ClientCancellation');
  });
  it('returns null for unknown / empty input (caller skips, never logs garbage)', () => {
    expect(statusToContext('pending')).toBeNull();
    expect(statusToContext('')).toBeNull();
    expect(statusToContext(undefined)).toBeNull();
  });
});

describe('buildSmsLogRow', () => {
  it('builds a complete row for a successful send', () => {
    const row = buildSmsLogRow({
      appointmentId: 'appt-1', phone: '+972541234567',
      context: 'ClientApproval', status: 'SENT',
      messageBody: 'אושר', detail: '',
    });
    expect(row).toEqual({
      appointment_id:  'appt-1',
      channel:         'sms',
      recipient_phone: '+972541234567',
      context:         'ClientApproval',
      status:          'SENT',
      message_body:    'אושר',
      detail:          '',
    });
  });

  it('defaults channel to sms and appointment_id to null', () => {
    const row = buildSmsLogRow({ phone: '+972500000000', context: 'OTP', status: 'SENT' });
    expect(row.channel).toBe('sms');
    expect(row.appointment_id).toBeNull();
    expect(row.message_body).toBe('');
    expect(row.detail).toBe('');
  });

  it('clamps any unexpected status to a valid enum value (ERROR)', () => {
    const row = buildSmsLogRow({ phone: 'x', context: 'OTP', status: 'WHATEVER' });
    expect(['SENT', 'MOCK', 'ERROR']).toContain(row.status);
    expect(row.status).toBe('ERROR');
  });

  it('only ever emits SENT | MOCK | ERROR for the valid statuses', () => {
    for (const s of ['SENT', 'MOCK', 'ERROR']) {
      expect(buildSmsLogRow({ phone: 'x', context: 'OTP', status: s }).status).toBe(s);
    }
  });

  it('truncates an oversized Twilio detail so the insert can never blow up', () => {
    const huge = 'e'.repeat(5000);
    const row = buildSmsLogRow({ phone: 'x', context: 'ClientRejection', status: 'ERROR', detail: huge });
    expect(row.detail.length).toBeLessThanOrEqual(500);
  });

  it('truncates an oversized message body', () => {
    const huge = 'm'.repeat(5000);
    const row = buildSmsLogRow({ phone: 'x', context: 'OTP', status: 'SENT', messageBody: huge });
    expect(row.message_body.length).toBeLessThanOrEqual(1000);
  });
});
