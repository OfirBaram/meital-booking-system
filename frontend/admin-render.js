'use strict';

import { html, render, nothing } from 'lit-html';

// ─── Core domain types ────────────────────────────────────────────────────────

/**
 * @typedef {'available' | 'blocked' | 'booked' | 'pending'} SlotStatus
 * Supabase slot status — always lowercase.
 * Never compare against 'Available' (capital A) — that breaks the calendar tint.
 */

/**
 * @typedef {'Pending' | 'Approved' | 'Rejected' | 'Cancelled'} BookingStatus
 * Booking status — always Title Case (capital first letter).
 * Slot statuses are lowercase; booking statuses are not. Mixing them silently
 * breaks status badges and calendar tints.
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   phone: string,
 *   service: string,
 *   serviceName: string,
 *   date: string,
 *   time: string,
 *   timestamp: string,
 *   duration: number,
 *   status: BookingStatus,
 *   calendarEventId?: string,
 *   adminToken?: string
 * }} Booking
 */

/**
 * @typedef {{
 *   id: string,
 *   date: string,
 *   start_time: string,
 *   end_time: string,
 *   status: SlotStatus
 * }} Slot
 */

// ─── Shared constants ─────────────────────────────────────────────────────────

export const DAY_NAMES_HE   = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
export const SERVICE_NAME   = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" };

export const LABELS = {
  Pending:'ממתין',   Approved:'מאושר',  Rejected:'נדחה',   Cancelled:'בוטל',
  pending:'ממתין',   approved:'מאושר',  rejected:'נדחה',   cancelled:'בוטל',
};

export const STATUS_CLS = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-600',
  Cancelled: 'bg-gray-100 text-gray-400',
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400',
};

export const SMS_STATUS_LABEL = {
  SENT:  '✅ SMS נשלח ללקוחה',
  ERROR: '❌ SMS ללקוחה נכשל',
  MOCK:  '🧪 SMS (הדמיה)',
};

// SMS Center — Hebrew labels for the communication_logs context + status enums.
export const SMS_CONTEXT_LABEL = {
  OTP:                'קוד אימות',
  AdminNotify:        'התראת אדמין',
  ClientApproval:     'אישור ללקוחה',
  ClientRejection:    'דחייה ללקוחה',
  ClientCancellation: 'ביטול ללקוחה',
  DailyReminder:      'תזכורת יומית',
  Admin:              'אדמין',
};

export const SMS_STATUS_TEXT = {
  SENT: 'נשלח', ERROR: 'נכשל', MOCK: 'הדמיה', SKIPPED: 'דולג',
};

export const SMS_STATUS_CHIP = {
  SENT:    'bg-green-100 text-green-700',
  ERROR:   'bg-red-100 text-red-600',
  MOCK:    'bg-amber-100 text-amber-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
};

export const SB_STATUS_LABEL = { available:'פנוי', locked:'נעול', booked:'מוזמן', pending:'ממתין' };

export const SB_STATUS_CLS = {
  available: 'bg-green-100 text-green-700',
  locked:    'bg-gray-100 text-gray-500',
  booked:    'bg-rose-100 text-rose-600',
  pending:   'bg-amber-100 text-amber-700',
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function esc(s) {
  return String(s || '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

export function fmtPhone(p) {
  const local = String(p || '').replace('+972', '0');
  return local.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
}

// ─── Component helpers ───────────────────────────────────────────────────────
// Pure functions returning HTML strings — composable building blocks for
// buildCard(). Events are delegated via [data-action]; no inline handlers.

export function buildStatusBadge(status) {
  return '<span class="text-xs font-semibold px-2.5 py-0.5 rounded-full '
    + (STATUS_CLS[status] || 'bg-gray-100 text-gray-500') + '">'
    + (LABELS[status] || esc(status)) + '</span>';
}

export function buildActionButtons(b) {
  if (b.status === 'Pending') {
    return '<button data-action="Approved" data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">✅ אשר</button>'
      + '<button data-action="Rejected"  data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">❌ דחה</button>';
  }
  if (b.status === 'Approved') {
    return '<button data-action="Cancelled" data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">🚫 בטל</button>';
  }
  return '';
}

export function buildContactButtons(b) {
  const dialNum = String(b.phone || '').replace(/[^\d+]/g, '');
  const waNum   = dialNum.replace(/^\+/, '');
  const smsBtn = '<button data-action="sms" data-id="' + esc(b.id) + '"'
    + ' data-phone="' + esc(b.phone) + '" data-name="' + esc(b.name) + '"'
    + ' title="שלח SMS ידני" data-qa="btn-send-sms"'
    + ' class="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">'
    + '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
    + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
    + ' d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>'
    + '</svg></button>';
  const callBtn = '<a href="tel:' + esc(dialNum) + '" title="חייגי" data-qa="btn-call"'
    + ' class="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">'
    + '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
    + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
    + ' d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"/>'
    + '</svg></a>';
  const waBtn = '<a href="https://wa.me/' + esc(waNum) + '" target="_blank" rel="noopener" title="וואטסאפ" data-qa="btn-wa"'
    + ' class="p-1.5 rounded-lg text-green-500 hover:text-green-600 hover:bg-cream active:scale-95 transition-all">'
    + '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
    + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
    + ' d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.9 9.9 0 01-4.26-.95L3 20l1.4-3.72A7.9 7.9 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z"/>'
    + '</svg></a>';
  const delBtn = '<button data-action="delete" data-id="' + esc(b.id) + '" title="מחק הזמנה" data-qa="btn-delete"'
    + ' class="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all">'
    + '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
    + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
    + ' d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>'
    + '</svg></button>';
  return callBtn + waBtn + smsBtn + delBtn;
}

// ─── buildCard ────────────────────────────────────────────────────────────────
// Composes the above helpers. Events are delegated by render() in admin.js.

export function buildCard(b) {
  const badge   = buildStatusBadge(b.status);
  const contact = buildContactButtons(b);
  const btns    = buildActionButtons(b);
  const date    = (b.date || '').replace(/-/g, '/');

  return '<div class="bg-white rounded-2xl p-5 border border-secondary/30 shadow-sm card-in" data-booking="' + esc(b.id) + '">'
    + '<div class="flex items-start justify-between mb-2.5">'
    + '<div><div class="font-black text-[15px] text-text-main">' + esc(b.name) + '</div>'
    + '<div class="text-xs text-text-muted mt-0.5">' + esc(fmtPhone(b.phone)) + '</div></div>'
    + '<div class="flex items-center gap-0.5">' + badge + contact + '</div>'
    + '</div>'
    + '<div class="text-[13px] font-semibold text-text-main mb-1">' + esc(b.serviceName) + '</div>'
    + '<div class="text-xs text-text-muted mb-3.5">📅 ' + date + ' &nbsp;·&nbsp; 🕐 ' + esc(b.time) + '</div>'
    + (b.smsStatus
        ? '<div class="text-xs mb-2" data-qa="sms-status" data-sms-status="' + esc(b.smsStatus) + '">'
          + esc(SMS_STATUS_LABEL[b.smsStatus] || ('SMS: ' + b.smsStatus)) + '</div>'
        : '')
    + (btns ? '<div class="flex gap-2">' + btns + '</div>' : '')
    + '</div>';
}

// ─── buildSwipeCard ───────────────────────────────────────────
// Wraps Pending/Approved cards in a .swipe-wrapper with reveal layers.
// Rejected/Cancelled are returned as plain buildCard output (no swipe).

export function buildSwipeCard(b) {
  const inner = buildCard(b);
  if (b.status !== 'Pending' && b.status !== 'Approved') return inner;

  const approveLabel = 'אשר';
  const rejectLabel  = b.status === 'Pending' ? 'דחה' : 'בטל';

  const approveLayer = b.status === 'Pending'
    ? '<div class="swipe-reveal approve" aria-hidden="true">'
      + '<span class="font-bold text-sm">' + approveLabel + '</span></div>'
    : '';

  const rejectLayer = '<div class="swipe-reveal reject" aria-hidden="true">'
    + '<span class="font-bold text-sm">' + rejectLabel + '</span></div>';

  return '<div class="swipe-wrapper"'
    + ' data-swipe-id="' + esc(b.id) + '"'
    + ' data-swipe-status="' + esc(b.status) + '">'
    + rejectLayer
    + approveLayer
    + '<div class="swipe-card">' + inner + '</div>'
    + '</div>';
}

// ─── renderDiarySlots ─────────────────────────────────────────────────────────
// Migrated: onclick → data-action="toggle-diary-slot" / "delete-diary-slot"
// callbacks: { onToggle(slotId: number, currentStatus: string), onDelete(slotId: number) }

export function renderDiarySlots(slots, container, { onToggle, onDelete }) {
  if (!container) return;
  delete container._$litPart$; container.textContent = '';
  if (!slots || !slots.length) {
    render(html`<div class="text-xs text-text-muted text-center py-8">אין תורים בטווח זה</div>`, container);
    return;
  }

  const byDate = {};
  slots.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });

  render(html`${Object.keys(byDate).sort().map(date => {
    const d       = new Date(date + 'T12:00:00');
    const dayName = 'יום ' + DAY_NAMES_HE[d.getDay()];
    const [y, mo, da] = date.split('-');
    const heDate  = da + '/' + mo + '/' + y;
    return html`
      <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4 card-in">
        <div class="text-xs font-bold text-text-muted mb-2">${dayName}, ${heDate}</div>
        ${byDate[date].map(s => {
          const canAct     = s.status !== 'booked' && s.status !== 'pending';
          const toggleIcon = s.status === 'locked' ? '🔓' : '🔒';
          const badgeCls   = SB_STATUS_CLS[s.status]   || 'bg-gray-100 text-gray-500';
          const badgeLabel = SB_STATUS_LABEL[s.status] || s.status;
          return html`
            <div data-slot-id=${String(s.id)}
                 class="flex items-center justify-between py-2 border-b border-secondary/20 last:border-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm text-text-main">${s.time}</span>
                <span data-status-badge
                      class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeCls}">${badgeLabel}</span>
              </div>
              <div class="flex items-center gap-1">
                <button data-action-btn
                        data-action="toggle-diary-slot"
                        data-slot-id=${String(s.id)}
                        data-slot-status=${s.status}
                        ?disabled=${!canAct}
                        @click=${() => onToggle(+s.id, s.status)}
                        class="text-lg p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">${toggleIcon}</button>
                <button data-action-btn
                        data-action="delete-diary-slot"
                        data-slot-id=${String(s.id)}
                        ?disabled=${!canAct}
                        @click=${() => onDelete(+s.id)}
                        class="text-base p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">🗑</button>
              </div>
            </div>`;
        })}
      </div>`;
  })}`, container);
}

// ─── renderClientList ─────────────────────────────────────────────────────────
// Migrated: onclick on card div → data-action="select-client"
// callbacks: { onSelect(phone: string) }

export function renderClientList(clients, container, { onSelect, stats, onSms } = {}) {
  if (!container) return;
  delete container._$litPart$; container.textContent = '';
  if (!clients || !clients.length) {
    render(html`
      <div class="text-center py-14 text-text-muted">
        <div class="text-3xl mb-2">🔍</div>
        <div class="text-sm">לא נמצאו לקוחות</div>
      </div>`, container);
    return;
  }

  const byPhone = stats || {};

  render(html`${clients.map(c => {
    const st      = byPhone[c.phone] || {};
    const dialNum = String(c.phone || '').replace(/[^\d+]/g, '');
    const waNum   = dialNum.replace(/^\+/, '');
    const chip    = 'text-[10px] font-bold px-2 py-0.5 rounded-full';
    const chips   = [
      st.visits    && html`<span class="${chip} bg-green-100 text-green-700">${st.visits}${st.visits === 1 ? ' ביקור' : ' ביקורים'}</span>`,
      st.upcoming  && html`<span class="${chip} bg-rose-100 text-rose-600">${st.upcoming} קרובות</span>`,
      st.cancelled && html`<span class="${chip} bg-gray-100 text-gray-500">${st.cancelled} בוטלו</span>`,
      st.lastVisit && html`<span class="${chip} bg-secondary/30 text-text-muted">אחרון ${st.lastVisit}</span>`,
    ].filter(Boolean);

    return html`
      <div class="bg-white rounded-2xl p-5 border border-secondary/30 shadow-soft card-in cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"
           data-action="select-client"
           data-phone=${c.phone}
           @click=${() => onSelect(c.phone)}>
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="font-black text-[15px] text-text-main truncate">${c.full_name || '(ללא שם)'}</div>
            <div class="text-xs text-text-muted mt-0.5">${fmtPhone(c.phone)}</div>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <button type="button" data-contact title="שלח SMS"
                    @click=${e => { e.stopPropagation(); onSms && onSms(c.phone, ''); }}
                    class="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>
              </svg>
            </button>
            <a href=${'tel:' + dialNum} data-contact title="חייגי"
               @click=${e => e.stopPropagation()}
               class="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6V5z"/>
              </svg>
            </a>
            <a href=${'https://wa.me/' + waNum} target="_blank" rel="noopener" data-contact title="וואטסאפ"
               @click=${e => e.stopPropagation()}
               class="p-2 rounded-lg text-green-500 hover:text-green-600 hover:bg-cream active:scale-95 transition-all">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.42-4.03 8-9 8a9.9 9.9 0 01-4.26-.95L3 20l1.4-3.72A7.9 7.9 0 013 12c0-4.42 4.03-8 9-8s9 3.58 9 8z"/>
              </svg>
            </a>
          </div>
        </div>
        ${chips.length ? html`<div class="flex flex-wrap gap-1.5 mt-2.5">${chips}</div>` : nothing}
      </div>`;
  })}`, container);
}

// ─── renderClientHistory ──────────────────────────────────────────────────────
// Migrated: onclick on approve/reject buttons → data-action="history-decide"
// callbacks: { onDecision(bookingId: string, adminToken: string, decision: string) }

export function renderClientHistory(appointments, container, { onDecision }) {
  if (!container) return;
  delete container._$litPart$; container.textContent = '';
  if (!appointments || !appointments.length) {
    render(html`<div class="text-xs text-text-muted text-center py-8">אין הזמנות קודמות</div>`, container);
    return;
  }

  render(html`${appointments.map(a => {
    const statusLabel = LABELS[a.status]     || a.status;
    const statusCls   = STATUS_CLS[a.status] || 'bg-gray-100 text-gray-400';
    const dateParts   = a.date ? a.date.split('-') : [];
    const heDate      = dateParts.length === 3
      ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0]
      : '—';
    const isPending   = a.status === 'pending' || a.status === 'Pending';

    return html`
      <div data-appt-row class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in">
        <div class="flex items-start justify-between mb-1">
          <div>
            <div class="font-bold text-sm text-text-main">${heDate} בשעה ${a.time || '—'}</div>
            <div class="text-xs text-text-muted mt-0.5">${a.treatment_name || ''}</div>
          </div>
          <span data-status-badge
                class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusCls}">${statusLabel}</span>
        </div>
        ${isPending ? html`
          <div class="flex gap-2 mt-2">
            <button data-action-btn
                    data-action="history-decide"
                    data-appt-id=${a.id}
                    data-admin-token=${a.admin_token}
                    data-decision="Approved"
                    @click=${() => onDecision(a.id, a.admin_token, 'Approved')}
                    class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">
              ✅ אשר
            </button>
            <button data-action-btn
                    data-action="history-decide"
                    data-appt-id=${a.id}
                    data-admin-token=${a.admin_token}
                    data-decision="Rejected"
                    @click=${() => onDecision(a.id, a.admin_token, 'Rejected')}
                    class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">
              ❌ דחה
            </button>
          </div>` : nothing}
      </div>`;
  })}`, container);
}

// ─── renderSmsLog ─────────────────────────────────────────────────────────────
// Pure HTML render — no user-triggered actions.

export function renderSmsLog(entries, container) {
  if (!container) return;
  delete container._$litPart$; container.textContent = '';
  if (!entries || !entries.length) {
    render(html`
      <div class="text-center py-12 text-text-muted">
        <div class="text-4xl mb-2">📭</div>
        <div class="text-sm font-medium">אין רשומות</div>
        <div class="text-xs mt-1">נסי לשנות את הסינון</div>
      </div>`, container);
    return;
  }

  render(html`${entries.map(e => {
    const icon       = e.status === 'SENT'    ? '✅'
                     : e.status === 'MOCK'    ? '🧪'
                     : e.status === 'SKIPPED' ? '⏭️'
                     : '❌';
    const statusText = SMS_STATUS_TEXT[e.status]    || e.status;
    const statusCls  = SMS_STATUS_CHIP[e.status]    || 'bg-gray-100 text-gray-500';
    const ctxLabel   = SMS_CONTEXT_LABEL[e.context] || e.context || 'אחר';
    return html`
      <div class="flex items-start gap-3 py-3 border-b border-secondary/15 last:border-0 cursor-pointer hover:bg-cream/60 rounded-lg px-1 -mx-1 transition-colors"
           data-qa="log-entry"
           data-phone=${e.to}>
        <span class="shrink-0 mt-0.5 text-base">${icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-bold text-text-main truncate">${fmtPhone(e.to)}</span>
            <span class="text-[10px] text-text-muted shrink-0">${e.ts}</span>
          </div>
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCls}">${statusText}</span>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary/30 text-text-muted">${ctxLabel}</span>
          </div>
          <div class="text-xs text-text-muted truncate">${e.snippet}</div>
          ${e.status === 'ERROR' && e.detail
            ? html`<div class="text-[11px] text-red-500 mt-1 break-words" data-qa="log-detail">${e.detail}</div>`
            : nothing}
        </div>
      </div>`;
  })}`, container);
}
