'use strict';

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

// ─── buildCard ────────────────────────────────────────────────────────────────
// Returns an HTML string. Events are delegated by render() in admin.js via
// [data-action] — no inline onclick anywhere.

export function buildCard(b) {
  const badge = '<span class="text-xs font-semibold px-2.5 py-0.5 rounded-full '
    + (STATUS_CLS[b.status] || 'bg-gray-100 text-gray-500') + '">'
    + (LABELS[b.status] || esc(b.status)) + '</span>';
  const date = (b.date || '').replace(/-/g, '/');

  let btns = '';
  if (b.status === 'Pending') {
    btns = '<button data-action="Approved" data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">✅ אשר</button>'
      + '<button data-action="Rejected"  data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">❌ דחה</button>';
  } else if (b.status === 'Approved') {
    btns = '<button data-action="Cancelled" data-id="' + esc(b.id) + '"'
      + ' class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">🚫 בטל</button>';
  }

  const smsBtn = '<button data-action="sms" data-id="' + esc(b.id) + '"'
    + ' data-phone="' + esc(b.phone) + '" data-name="' + esc(b.name) + '"'
    + ' title="שלח SMS ידני" data-qa="btn-send-sms"'
    + ' class="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">'
    + '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
    + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"'
    + ' d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/>'
    + '</svg></button>';

  return '<div class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in" data-booking="' + esc(b.id) + '">'
    + '<div class="flex items-start justify-between mb-1.5">'
    + '<div><div class="font-bold text-sm text-text-main">' + esc(b.name) + '</div>'
    + '<div class="text-xs text-text-muted mt-0.5">' + esc(fmtPhone(b.phone)) + '</div></div>'
    + '<div class="flex items-center gap-1">' + badge + smsBtn + '</div>'
    + '</div>'
    + '<div class="text-xs font-medium text-text-main mb-0.5">' + esc(b.serviceName) + '</div>'
    + '<div class="text-xs text-text-muted mb-3">📅 ' + date + ' &nbsp;·&nbsp; 🕐 ' + esc(b.time) + '</div>'
    + (btns ? '<div class="flex gap-2">' + btns + '</div>' : '')
    + '</div>';
}

// ─── renderDiarySlots ─────────────────────────────────────────────────────────
// Migrated: onclick → data-action="toggle-diary-slot" / "delete-diary-slot"
// callbacks: { onToggle(slotId: number, currentStatus: string), onDelete(slotId: number) }

export function renderDiarySlots(slots, container, { onToggle, onDelete }) {
  if (!container) return;
  if (!slots || !slots.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-8">אין חריצים בטווח זה</div>';
    return;
  }

  const byDate = {};
  slots.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });

  const html = Object.keys(byDate).sort().map(date => {
    const d       = new Date(date + 'T12:00:00');
    const dayName = 'יום ' + DAY_NAMES_HE[d.getDay()];
    const parts   = date.split('-');
    const heDate  = parts[2] + '/' + parts[1] + '/' + parts[0];

    const rows = byDate[date].map(s => {
      const canAct     = s.status !== 'booked' && s.status !== 'pending';
      const toggleIcon = s.status === 'locked' ? '🔓' : '🔒';
      const badgeCls   = SB_STATUS_CLS[s.status]   || 'bg-gray-100 text-gray-500';
      const badgeLabel = SB_STATUS_LABEL[s.status] || esc(s.status);
      const disAttr    = canAct ? '' : ' disabled';

      return '<div data-slot-id="' + esc(String(s.id)) + '"'
        + ' class="flex items-center justify-between py-2 border-b border-secondary/20 last:border-0">'
        + '<div class="flex items-center gap-2">'
        + '<span class="font-semibold text-sm text-text-main">' + esc(s.time) + '</span>'
        + '<span data-status-badge class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + badgeCls + '">' + badgeLabel + '</span>'
        + '</div>'
        + '<div class="flex items-center gap-1">'
        + '<button data-action-btn data-action="toggle-diary-slot"'
        + ' data-slot-id="' + esc(String(s.id)) + '" data-slot-status="' + esc(s.status) + '"'
        + disAttr
        + ' class="text-lg p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">'
        + toggleIcon + '</button>'
        + '<button data-action-btn data-action="delete-diary-slot"'
        + ' data-slot-id="' + esc(String(s.id)) + '"'
        + disAttr
        + ' class="text-base p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">🗑</button>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4 card-in">'
      + '<div class="text-xs font-bold text-text-muted mb-2">' + dayName + ', ' + heDate + '</div>'
      + rows
      + '</div>';
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('[data-action="toggle-diary-slot"]').forEach(btn =>
    btn.addEventListener('click', () => onToggle(+btn.dataset.slotId, btn.dataset.slotStatus)));
  container.querySelectorAll('[data-action="delete-diary-slot"]').forEach(btn =>
    btn.addEventListener('click', () => onDelete(+btn.dataset.slotId)));
}

// ─── renderClientList ─────────────────────────────────────────────────────────
// Migrated: onclick on card div → data-action="select-client"
// callbacks: { onSelect(phone: string) }

export function renderClientList(clients, container, { onSelect }) {
  if (!container) return;
  if (!clients || !clients.length) {
    container.innerHTML = '<div class="text-center py-14 text-text-muted">'
      + '<div class="text-3xl mb-2">🔍</div>'
      + '<div class="text-sm">לא נמצאו לקוחות</div>'
      + '</div>';
    return;
  }

  container.innerHTML = clients.map(c => {
    const joined = c.created_at
      ? new Date(c.created_at).toLocaleDateString('he-IL', { month: '2-digit', year: 'numeric' })
      : '';
    return '<div class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in'
      + ' cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]"'
      + ' data-action="select-client" data-phone="' + esc(c.phone) + '">'
      + '<div class="flex items-center justify-between">'
      + '<div>'
      + '<div class="font-bold text-sm text-text-main">' + esc(c.full_name || '(ללא שם)') + '</div>'
      + '<div class="text-xs text-text-muted mt-0.5">' + esc(fmtPhone(c.phone)) + '</div>'
      + '</div>'
      + '<div class="text-xs text-text-muted">' + esc(joined) + '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  container.querySelectorAll('[data-action="select-client"]').forEach(card =>
    card.addEventListener('click', () => onSelect(card.dataset.phone)));
}

// ─── renderClientHistory ──────────────────────────────────────────────────────
// Migrated: onclick on approve/reject buttons → data-action="history-decide"
// callbacks: { onDecision(bookingId: string, adminToken: string, decision: string) }

export function renderClientHistory(appointments, container, { onDecision }) {
  if (!container) return;
  if (!appointments || !appointments.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-8">אין הזמנות קודמות</div>';
    return;
  }

  container.innerHTML = appointments.map(a => {
    const statusLabel = LABELS[a.status]    || esc(a.status);
    const statusCls   = STATUS_CLS[a.status] || 'bg-gray-100 text-gray-400';
    const dateParts   = a.date ? a.date.split('-') : [];
    const heDate      = dateParts.length === 3
      ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0]
      : '—';
    const isPending   = a.status === 'pending' || a.status === 'Pending';

    const actionBtns = isPending
      ? '<div class="flex gap-2 mt-2">'
        + '<button data-action-btn data-action="history-decide"'
        + ' data-appt-id="' + esc(a.id) + '"'
        + ' data-admin-token="' + esc(a.admin_token) + '"'
        + ' data-decision="Approved"'
        + ' class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">'
        + '✅ אשר</button>'
        + '<button data-action-btn data-action="history-decide"'
        + ' data-appt-id="' + esc(a.id) + '"'
        + ' data-admin-token="' + esc(a.admin_token) + '"'
        + ' data-decision="Rejected"'
        + ' class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">'
        + '❌ דחה</button>'
        + '</div>'
      : '';

    return '<div data-appt-row class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in">'
      + '<div class="flex items-start justify-between mb-1">'
      + '<div>'
      + '<div class="font-bold text-sm text-text-main">' + esc(heDate) + ' בשעה ' + esc(a.time || '—') + '</div>'
      + '<div class="text-xs text-text-muted mt-0.5">' + esc(a.treatment_name || '') + '</div>'
      + '</div>'
      + '<span data-status-badge class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ' + statusCls + '">' + statusLabel + '</span>'
      + '</div>'
      + actionBtns
      + '</div>';
  }).join('');

  container.querySelectorAll('[data-action="history-decide"]').forEach(btn =>
    btn.addEventListener('click', () =>
      onDecision(btn.dataset.apptId, btn.dataset.adminToken, btn.dataset.decision)));
}

// ─── renderSmsLog ─────────────────────────────────────────────────────────────
// Pure HTML render — no user-triggered actions.

export function renderSmsLog(entries, container) {
  if (!container) return;
  if (!entries || !entries.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-4">אין רשומות</div>';
    return;
  }
  container.innerHTML = entries.map(e => {
    const icon = e.status === 'SENT'    ? '✅'
               : e.status === 'MOCK'    ? '🧪'
               : e.status === 'SKIPPED' ? '⏭️'
               : '❌';
    return '<div class="flex items-start gap-2 py-2 border-b border-secondary/15 last:border-0" data-qa="log-entry">'
      + '<span class="shrink-0 mt-0.5">' + icon + '</span>'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex items-center justify-between gap-2 mb-0.5">'
      + '<span class="text-xs font-semibold text-text-main truncate">' + esc(fmtPhone(e.to)) + '</span>'
      + '<span class="text-[10px] text-text-muted shrink-0">' + esc(e.ts) + '</span>'
      + '</div>'
      + '<div class="text-xs text-text-muted truncate">' + esc(e.context) + ' · ' + esc(e.snippet) + '</div>'
      + '</div></div>';
  }).join('');
}

// ─── renderSlotInventory ──────────────────────────────────────────────────────
// Already uses data-action="toggle-slot" — extracted unchanged.
// callbacks: { onToggle(date: string, time: string) }

export function renderSlotInventory(slots, container, { onToggle }) {
  if (!container) return;
  if (!slots || !slots.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-4">אין חריצים בתקופה הנבחרת</div>';
    return;
  }

  const byDate = {};
  slots.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });

  container.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, daySlots]) => {
      const label = date.replace(/-/g, '/');
      const rows = daySlots.map(s => {
        const isAvail   = s.status === 'Available';
        const isBlock   = s.status === 'Blocked';
        const canToggle = isAvail || isBlock;
        const hl        = s.recentlyCancelled ? ' ring-2 ring-amber-300 rounded-xl px-1' : '';
        const stCls     = isAvail ? 'text-green-600 bg-green-50'
                        : isBlock ? 'text-gray-400 bg-gray-50'
                        : 'text-text-muted bg-secondary/20';
        const stLabel   = isAvail ? 'פנוי' : isBlock ? 'חסום' : esc(s.status);
        const btnLabel  = isAvail ? 'חסום' : 'שחרר';
        const btnCls    = isAvail ? 'bg-red-100 text-red-500 hover:bg-red-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200';
        return '<div class="flex items-center justify-between py-2 border-b border-secondary/15 last:border-0' + hl + '" data-qa="slot-row">'
          + '<div class="flex items-center gap-2">'
          + (s.recentlyCancelled ? '<span title="בוטל לאחרונה">🔄</span>' : '')
          + '<span class="text-sm font-medium text-text-main">' + esc(s.time) + '</span>'
          + '<span class="text-xs px-2 py-0.5 rounded-full ' + stCls + '">' + stLabel + '</span></div>'
          + (canToggle
            ? '<button data-action="toggle-slot" data-date="' + esc(s.date) + '" data-time="' + esc(s.time) + '"'
              + ' class="' + btnCls + ' text-xs font-bold px-3 py-1.5 rounded-xl transition-colors active:scale-95"'
              + ' data-qa="btn-toggle-slot">' + btnLabel + '</button>'
            : '')
          + '</div>';
      }).join('');

      return '<div class="mb-3"><div class="text-xs font-bold text-text-muted mb-1">' + label + '</div>'
        + '<div class="bg-secondary/10 rounded-xl px-3">' + rows + '</div></div>';
    }).join('');

  container.querySelectorAll('[data-action="toggle-slot"]').forEach(btn =>
    btn.addEventListener('click', () => onToggle(btn.dataset.date, btn.dataset.time)));
}
