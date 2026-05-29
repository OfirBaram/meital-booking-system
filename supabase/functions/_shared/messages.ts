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
  approveUrl:  string
  rejectUrl:   string
}

/** Admin notification SMS for a new pending booking, with one-tap links. */
export function buildAdminNewBookingSms(f: AdminMsgFields): string {
  return [
    '📅 הזמנה חדשה ממתינה לאישור:',
    `שם: ${(f.name ?? '').trim()}`,
    `טלפון: ${(f.phone ?? '').trim()}`,
    `שירות: ${(f.serviceName ?? '').trim()}`,
    `תאריך: ${fullDateLabel(f.date)} בשעה ${f.time}`,
    '',
    `✅ לאישור: ${f.approveUrl}`,
    `❌ לדחייה: ${f.rejectUrl}`,
  ].join('\n')
}
