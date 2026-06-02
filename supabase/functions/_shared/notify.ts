// SMS logging substrate. The PURE parts (statusToContext, buildSmsLogRow) carry
// no Deno/esm imports so they are unit-tested under Vitest (Node), exactly like
// messages.ts. The impure sendAndLogSms wraps a real Twilio send + a
// communication_logs insert; it is exercised by live/e2e checks.
//
// Why this exists: before this, change-status/admin-action/verify-and-book sent
// SMS but never recorded the result, so failures were invisible (the admin
// SMS-log panel stayed empty and a Twilio rejection was swallowed silently).

import { sendTwilioSms, type TwilioCreds } from './sms.ts'
import { buildAdminFailureAlertSms } from './messages.ts'
// 2026-05-31: ADMIN_PHONE E.164 normalization deploy (see _shared/phone.ts).

// Client-facing contexts where a delivery failure means a real client expected a
// message and didn't get it — worth proactively alerting the admin about. OTP
// (client is mid-flow and sees the error) and AdminNotify (recipient is the
// admin; alerting would recurse) are intentionally excluded.
const CLIENT_CONTEXTS = new Set<CommContext>([
  'ClientApproval', 'ClientRejection', 'ClientCancellation',
])

// Mirrors the communication_logs CHECK constraints (initial_schema migration).
export type LogStatus  = 'SENT' | 'MOCK' | 'ERROR'
export type CommContext =
  | 'OTP' | 'AdminNotify'
  | 'ClientApproval' | 'ClientRejection' | 'ClientCancellation'
  | 'DailyReminder'

const VALID_STATUSES: LogStatus[] = ['SENT', 'MOCK', 'ERROR']

const CLIENT_STATUS_TO_CONTEXT: Record<string, CommContext> = {
  approved:  'ClientApproval',
  rejected:  'ClientRejection',
  cancelled: 'ClientCancellation',
}

/** Map a client status (approved/rejected/cancelled) to its log context, or null. */
export function statusToContext(clientStatus: string): CommContext | null {
  return CLIENT_STATUS_TO_CONTEXT[String(clientStatus ?? '').trim().toLowerCase()] ?? null
}

const MAX_BODY   = 1000
const MAX_DETAIL = 500

export interface SmsLogRowInput {
  appointmentId?: string | null
  phone:          string
  context:        CommContext
  status:         LogStatus
  messageBody?:   string
  detail?:        string
}

/**
 * Build a communication_logs insert row. status is clamped to the enum
 * (anything unexpected becomes 'ERROR') and free-text fields are truncated so a
 * huge Twilio body can never blow up the insert.
 */
export function buildSmsLogRow(input: SmsLogRowInput) {
  const status: LogStatus = VALID_STATUSES.includes(input.status) ? input.status : 'ERROR'
  return {
    appointment_id:  input.appointmentId ?? null,
    channel:         'sms',
    recipient_phone: String(input.phone ?? ''),
    context:         input.context,
    status,
    message_body:    String(input.messageBody ?? '').slice(0, MAX_BODY),
    detail:          String(input.detail ?? '').slice(0, MAX_DETAIL),
  }
}

export interface SendAndLogParams {
  to:               string
  body:             string
  context:          CommContext
  creds:            TwilioCreds | null
  appointmentId?:   string | null
  // When a client-facing SMS fails, ping the admin at this number so the
  // failure prompts action instead of sitting silently in the log.
  alertAdminPhone?: string | null
  clientLabel?:     string   // shown in that alert (client name or phone)
}

/**
 * Send one SMS and ALWAYS record the outcome to communication_logs:
 *   - no creds  -> 'MOCK'  (nothing sent; secrets absent)
 *   - 2xx       -> 'SENT'
 *   - throw     -> 'ERROR' (+ Twilio detail)
 * Never throws — the caller's primary action (status change) is authoritative;
 * a logging/SMS failure must not roll it back. Returns the recorded status.
 */
// deno-lint-ignore no-explicit-any
export async function sendAndLogSms(supabase: any, p: SendAndLogParams): Promise<LogStatus> {
  let status: LogStatus = 'SENT'
  let detail = ''

  if (!p.creds) {
    status = 'MOCK'
    detail = 'twilio secrets missing'
  } else {
    try {
      await sendTwilioSms(p.to, p.body, p.creds)
      status = 'SENT'
    } catch (err) {
      status = 'ERROR'
      detail = err instanceof Error ? err.message : String(err)
    }
  }

  const row = buildSmsLogRow({
    appointmentId: p.appointmentId ?? null,
    phone:         p.to,
    context:       p.context,
    status,
    messageBody:   p.body,
    detail,
  })

  try {
    await supabase.from('communication_logs').insert(row)
  } catch (logErr) {
    console.error('[notify] log-insert-fail:', logErr instanceof Error ? logErr.message : String(logErr))
  }

  // Proactive heads-up: if a client never got their approve/reject/cancel SMS,
  // alert the admin so they can call. Best-effort and never throws; the alert is
  // sent to a different (admin) number, so it usually goes through even when the
  // client-specific delivery failed (e.g. unsubscribed/invalid number).
  if (status === 'ERROR' && p.creds && p.alertAdminPhone && CLIENT_CONTEXTS.has(p.context)) {
    try {
      await sendTwilioSms(
        p.alertAdminPhone,
        buildAdminFailureAlertSms(p.context, p.clientLabel ?? p.to, detail),
        p.creds,
      )
      console.log('[notify] admin-alert-sent for failed ' + p.context)
    } catch (alertErr) {
      console.error('[notify] admin-alert-fail:', alertErr instanceof Error ? alertErr.message : String(alertErr))
    }
  }

  return status
}
