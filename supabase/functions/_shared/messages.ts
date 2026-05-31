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
  const svc  = (f.serviceName ?? '').trim() || 'התור'
  const when = `${fullDateLabel(f.date)} בשעה ${f.time}`
  if (status === 'approved') {
    return [
      '✅ ההזמנה שלך אושרה!',
      `שירות: ${svc}`,
      `תאריך: ${when}`,
      '',
      'מחכה לך! 💅',
    ].join('\n')
  }
  if (status === 'rejected') {
    return [
      `❌ לצערנו, הבקשה לתור ב${when} לא אושרה.`,
      'אפשר לתאם מועד חלופי דרך האפליקציה.',
    ].join('\n')
  }
  // cancelled
  return [
    `❌ התור שלך ב${when} בוטל.`,
    `שירות: ${svc}`,
    '',
    'ניתן לתאם תור חדש דרך האפליקציה.',
  ].join('\n')
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
  return [
    '📅 הזמנה חדשה ממתינה לאישור!',
    `שם: ${(f.name ?? '').trim()}`,
    `טלפון: ${(f.phone ?? '').trim()}`,
    `שירות: ${(f.serviceName ?? '').trim()}`,
    `תאריך: ${fullDateLabel(f.date)} בשעה ${f.time}`,
    '',
    'לאישור או דחייה — היכנסי לדשבורד הניהול 💅',
  ].join('\n')
}

// Hebrew label for the action whose client SMS failed (used in the admin alert).
const FAILED_ACTION_HE: Record<string, string> = {
  ClientApproval:     'אישור התור',
  ClientRejection:    'דחיית התור',
  ClientCancellation: 'ביטול התור',
}

/**
 * Heads-up SMS to the ADMIN when a client notification could not be delivered,
 * so a silent failure becomes an active prompt to call the client. Best-effort —
 * the authoritative record is still the communication_logs ERROR row.
 */
export function buildAdminFailureAlertSms(
  context: string, clientLabel: string, detail?: string,
): string {
  const lines = [
    '⚠️ לקוחה לא קיבלה הודעת SMS',
    `לקוחה: ${(clientLabel ?? '').toString().trim() || '—'}`,
    `הודעה: ${FAILED_ACTION_HE[context] ?? 'עדכון'}`,
  ]
  if (detail) lines.push(`סיבה: ${String(detail).slice(0, 120)}`)
  lines.push('כדאי ליצור קשר ידני 📞')
  return lines.join('\n')
}
