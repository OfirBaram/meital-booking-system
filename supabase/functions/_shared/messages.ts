// Pure, dependency-free message builders shared by the Edge Functions.
// No Deno/esm imports here on purpose: this file is unit-tested under Vitest
// (Node) as well as imported by Deno functions.

const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

/**
 * Hebrew weekday label for a YYYY-MM-DD date, e.g. "יום שלישי".
 * Uses UTC parts so it is DST-agnostic — the weekday of a calendar date
 * never depends on the time zone.
 */
export function hebrewDayLabel(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? '').trim())
  if (!m) return ''
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
  return 'יום ' + HEB_DAYS[dow]
}

/** "DD.MM.YYYY" from a YYYY-MM-DD string (falls back to the raw input). */
export function formatDateDmy(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? '').trim())
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(dateStr ?? '')
}

/** "יום שלישי, 28.06.2026" — day name + numeric date, the full date label. */
export function fullDateLabel(dateStr: string): string {
  const day = hebrewDayLabel(dateStr)
  const dmy = formatDateDmy(dateStr)
  return day ? `${day}, ${dmy}` : dmy
}

export type ClientStatus = 'approved' | 'rejected' | 'cancelled'

export interface BookingMsgFields {
  serviceName: string
  date: string   // YYYY-MM-DD
  time: string   // HH:MM
}

/** Client-facing SMS body for an approval / rejection / cancellation. */
export function buildClientStatusSms(status: ClientStatus, f: BookingMsgFields): string {
  const svc = (f.serviceName ?? '').trim() || 'התור'
  if (status === 'approved') {
    return `אושר התור! ${svc}, ${formatDateDmy(f.date)} ${f.time}.`
  }
  if (status === 'rejected') {
    return `הבקשה לתור ב${formatDateDmy(f.date)} ${f.time} נדחתה. לתיאום — שלחי לנו הודעה 💬`
  }
  // cancelled
  return `התור ב${formatDateDmy(f.date)} ${f.time} בוטל. לתיאום תור חדש — שלחי לנו הודעה 💬`
}

export interface AdminMsgFields {
  name:        string
  phone:       string
  serviceName: string
  date:        string  // YYYY-MM-DD
  time:        string  // HH:MM
}

/**
 * Admin notification SMS for a new pending booking — deliberately LINK-FREE.
 *
 * WHY: the earlier version carried two long https://...supabase.co token URLs.
 * Israeli mobile carriers content-filter link-heavy A2P SMS as spam (the OTP, a
 * short link-free message to the SAME number, always arrived; this one was
 * silently dropped even though Twilio logged it SENT). A plain text heads-up has
 * no URL to filter on, so it gets through. The admin approves/rejects in the
 * dashboard (which already lists the booking) — no one-tap link needed.
 */
export function buildAdminNewBookingSms(f: AdminMsgFields): string {
  const n = (f.name ?? '').trim()
  const s = (f.serviceName ?? '').trim()
  const p = (f.phone ?? '').trim()
  return `הזמנה: ${n}, ${s}. ${formatDateDmy(f.date)} ${f.time}. טל: ${p}`
}

export interface AdminApprovalFields {
  name: string; serviceName: string; date: string; time: string; phone: string
  approveUrl: string; rejectUrl: string
}

/**
 * WhatsApp message to MEITAL for a new PENDING booking — with tappable Approve /
 * Reject links (links work on WhatsApp, unlike carrier-filtered SMS). The links
 * point at the existing admin-action one-tap endpoint (HMAC-secured). This keeps
 * Meital's final-approval control identical to the SMS/dashboard flow.
 */
export function buildAdminApprovalWhatsApp(f: AdminApprovalFields): string {
  const n = (f.name ?? '').trim()
  const s = (f.serviceName ?? '').trim()
  const p = (f.phone ?? '').trim()
  return [
    'תור חדש לאישור 🔔',
    n + ' · ' + s,
    fullDateLabel(f.date) + ' בשעה ' + f.time,
    'טלפון: ' + p,
    '',
    '✅ לאישור:',
    f.approveUrl,
    '',
    '❌ לדחייה:',
    f.rejectUrl,
  ].join('\n')
}

// Hebrew label for the action whose client SMS failed (used in the admin alert).
const FAILED_ACTION_HE: Record<string, string> = {
  ClientApproval:     'אישור התור',
  ClientRejection:    'דחיית התור',
  ClientCancellation: 'ביטול התור',
  ClientSelfCancel:   'ביטול עצמאי',
  ClientReschedule:   'שינוי תאריך',
}

/**
 * Heads-up SMS to the ADMIN when a client notification could not be delivered,
 * so a silent failure becomes an active prompt to call the client. Best-effort —
 * the authoritative record is still the communication_logs ERROR row.
 */
export function buildAdminFailureAlertSms(
  context: string, clientLabel: string, detail?: string,
): string {
  const who = (clientLabel ?? '').toString().trim() || '—'
  const act = FAILED_ACTION_HE[context] ?? 'עדכון'
  const why = detail ? ` (${String(detail).slice(0, 30)})` : ''
  return `שגיאה: לקוחה ${who} לא קיבלה SMS - ${act}${why}. יצרי קשר ידני.`
}

// ── Client portal SMS builders ────────────────────────────────────────────────

export function buildClientSelfCancelSms(f: BookingMsgFields): string {
  return 'ההזמנה ב' + formatDateDmy(f.date) + ' ' + f.time + ' בוטלה. להזמנה חדשה — שלחי לנו הודעה 💬'
}

export function buildAdminSelfCancelSms(name: string, f: BookingMsgFields): string {
  const n = (name ?? '').trim()
  return 'ביטול עצמאי: ' + n + ', ' + formatDateDmy(f.date) + ' ' + f.time + '.'
}

export interface RescheduleMsgFields {
  serviceName:       string
  oldDate:           string
  oldTime:           string
  newDate:           string
  newTime:           string
  appointmentStatus?: string
}

export function buildClientRescheduleSms(f: RescheduleMsgFields): string {
  const svc = (f.serviceName ?? '').trim() || 'התור'
  return 'שינוי תאריך בוצע! ' + svc + ' ב' + formatDateDmy(f.newDate) + ' ' + f.newTime + ' — מחכה לך בתאריך החדש 💅'
}

export function buildAdminRescheduleSms(name: string, f: RescheduleMsgFields): string {
  const n      = (name ?? '').trim()
  const suffix = f.appointmentStatus === 'pending' ? ' — ממתין לאישורך' : ''
  return 'שינוי תאריך: ' + n + ', מ' + formatDateDmy(f.oldDate) + ' ' + f.oldTime + ' ל' + formatDateDmy(f.newDate) + ' ' + f.newTime + '.' + suffix
}
