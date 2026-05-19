"""Patch admin.js: extend state, update constants/setTab/init, append new functions."""
import sys

path = 'frontend/admin.js'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

errors = []

# ── PATCH A: extend state S ──────────────────────────────────────────────────
OLD_STATE = """const S = {
  token:    localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  filter:   'all',
  dateJump: '',
  tab:      'bookings',
  template: [],
  autoSms:  true,
  _smsSendTarget: null,
};"""

NEW_STATE = """const S = {
  token:    localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  filter:   'all',
  dateJump: '',
  tab:      'bookings',
  template: [],
  autoSms:  true,
  _smsSendTarget: null,
  diarySlots:        [],   // [{ id, date, time, status }] — Supabase slots for diary view
  clients:           [],   // [{ id, phone, full_name, created_at }]
  clientHistory:     null, // { client:{...}, appointments:[...] }
  clientSearch:      '',
  _clientSearchTimer: null,
};"""

if OLD_STATE not in src:
    errors.append('PATCH A: state S anchor not found')
else:
    src = src.replace(OLD_STATE, NEW_STATE, 1)
    print('PATCH A OK: state S extended')

# ── PATCH B: add lowercase keys + SB constants after DAY_NAMES_HE ───────────
OLD_LABELS = """const LABELS    = { Pending:'ממתין', Approved:'מאושר', Rejected:'נדחה', Cancelled:'בוטל' };
const STATUS_CLS = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-600',
  Cancelled: 'bg-gray-100 text-gray-400',
};
const SERVICE_NAME = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" };
const DAY_NAMES_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];"""

NEW_LABELS = """const LABELS    = {
  Pending:'ממתין',   Approved:'מאושר',  Rejected:'נדחה',   Cancelled:'בוטל',
  pending:'ממתין',   approved:'מאושר',  rejected:'נדחה',   cancelled:'בוטל',
};
const STATUS_CLS = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-600',
  Cancelled: 'bg-gray-100 text-gray-400',
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400',
};
const SERVICE_NAME = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" };
const DAY_NAMES_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const SB_STATUS_LABEL = { available:'פנוי', locked:'נעול', booked:'מוזמן', pending:'ממתין' };
const SB_STATUS_CLS   = {
  available: 'bg-green-100 text-green-700',
  locked:    'bg-gray-100 text-gray-500',
  booked:    'bg-rose-100 text-rose-600',
  pending:   'bg-amber-100 text-amber-700',
};"""

if OLD_LABELS not in src:
    errors.append('PATCH B: LABELS/STATUS_CLS anchor not found')
else:
    src = src.replace(OLD_LABELS, NEW_LABELS, 1)
    print('PATCH B OK: LABELS/STATUS_CLS extended + SB constants added')

# ── PATCH C: replace setTab function ────────────────────────────────────────
OLD_SET_TAB = """  if (tab === 'pulse')  renderPulse();
  if (tab === 'slots')  loadTemplate();
  if (tab === 'diary')  { loadSlotInventory(); loadSmsLog(); }
}"""

NEW_SET_TAB = """  if (tab === 'pulse')  renderPulse();
  if (tab === 'slots')  loadTemplate();
  if (tab === 'diary')  {
    // Auto-load diary with default 14-day window on first open
    const fromEl = document.getElementById('js-diary-from');
    const toEl   = document.getElementById('js-diary-to');
    if (fromEl && !fromEl.value) {
      const today  = new Date().toISOString().slice(0, 10);
      const plus14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      fromEl.value = today;
      toEl.value   = plus14;
      loadDiarySlots();
    }
    loadSmsLog();
  }
  if (tab === 'clients' && S.clients.length === 0) loadClients('');
}"""

OLD_TAB_LIST = "  ['bookings','pulse','slots','diary'].forEach(t => {"
NEW_TAB_LIST = "  ['bookings','pulse','slots','diary','clients'].forEach(t => {"

if OLD_SET_TAB not in src:
    errors.append('PATCH C (tab actions): anchor not found')
else:
    src = src.replace(OLD_SET_TAB, NEW_SET_TAB, 1)
    print('PATCH C OK (tab actions): diary auto-load + clients added')

if OLD_TAB_LIST not in src:
    errors.append('PATCH C (tab list): anchor not found')
else:
    src = src.replace(OLD_TAB_LIST, NEW_TAB_LIST, 1)
    print('PATCH C OK (tab list): clients tab included')

# ── PATCH D: replace diary event listeners in init() ────────────────────────
OLD_DIARY_EVT = """  // Diary tab
  document.getElementById('js-diary-refresh').addEventListener('click', loadSlotInventory);
  document.getElementById('js-log-refresh').addEventListener('click', loadSmsLog);"""

NEW_DIARY_EVT = """  // Diary tab — slot manager
  document.getElementById('js-diary-load').addEventListener('click', loadDiarySlots);
  document.getElementById('js-add-slot-btn').addEventListener('click', addDiarySlot);
  document.getElementById('js-log-refresh').addEventListener('click', loadSmsLog);

  // Clients tab
  document.getElementById('js-client-search-btn').addEventListener('click', () =>
    loadClients(document.getElementById('js-client-search').value.trim()));
  document.getElementById('js-client-search').addEventListener('keydown', e => {
    if (e.key === 'Enter')
      loadClients(document.getElementById('js-client-search').value.trim());
  });
  document.getElementById('js-client-search').addEventListener('input', e => {
    clearTimeout(S._clientSearchTimer);
    const v = e.target.value.trim();
    S._clientSearchTimer = setTimeout(() => loadClients(v), 400);
  });
  document.getElementById('js-back-to-clients').addEventListener('click', () => {
    document.getElementById('js-client-history').classList.add('hidden');
    document.getElementById('js-clients-list').classList.remove('hidden');
  });"""

if OLD_DIARY_EVT not in src:
    errors.append('PATCH D: diary event listeners anchor not found')
else:
    src = src.replace(OLD_DIARY_EVT, NEW_DIARY_EVT, 1)
    print('PATCH D OK: event listeners replaced + clients wired')

# ── PATCH E: append new functions before DOMContentLoaded ───────────────────
ANCHOR_END = "document.addEventListener('DOMContentLoaded', init);"

NEW_FUNCTIONS = """
// ── Diary Tab — Slot Manager ──────────────────────────────────────

async function loadDiarySlots() {
  const fromEl = document.getElementById('js-diary-from');
  const toEl   = document.getElementById('js-diary-to');
  const from   = fromEl ? fromEl.value : '';
  const to     = toEl   ? toEl.value   : '';
  if (!from || !to) { toast('בחרי תחילה טווח תאריכים', 'warn'); return; }

  const btn = document.getElementById('js-diary-load');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner w-4 h-4"></span>'; }
  try {
    const r = await apiCall('adminGetSlots', { dateFrom: from, dateTo: to });
    if (!r.success) throw new Error(r.error);
    S.diarySlots = r.slots;
    renderDiarySlots(r.slots);
  } catch (e) {
    toast('שגיאה בטעינת החריצים', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'טען חריצים'; }
  }
}

function renderDiarySlots(slots) {
  const container = document.getElementById('js-diary-slots');
  if (!container) return;
  if (!slots || !slots.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-8">אין חריצים בטווח זה</div>';
    return;
  }

  // Group by date
  const byDate = {};
  slots.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s);
  });

  const html = Object.keys(byDate).map(date => {
    const d      = new Date(date + 'T12:00:00');
    const dayName = 'יום ' + DAY_NAMES_HE[d.getDay()];
    const parts   = date.split('-');
    const heDate  = parts[2] + '/' + parts[1] + '/' + parts[0];

    const rows = byDate[date].map(s => {
      const canAct = s.status !== 'booked' && s.status !== 'pending';
      const toggleIcon = s.status === 'locked' ? '🔓' : '🔒';
      const badgeCls   = SB_STATUS_CLS[s.status]   || 'bg-gray-100 text-gray-500';
      const badgeLabel = SB_STATUS_LABEL[s.status] || s.status;
      return (
        '<div data-slot-id="' + s.id + '" class="flex items-center justify-between py-2 border-b border-secondary/20 last:border-0">' +
          '<div class="flex items-center gap-2">' +
            '<span class="font-semibold text-sm text-text-main">' + esc(s.time) + '</span>' +
            '<span data-status-badge class="text-[10px] font-bold px-2 py-0.5 rounded-full ' + badgeCls + '">' + badgeLabel + '</span>' +
          '</div>' +
          '<div class="flex items-center gap-1">' +
            '<button data-action-btn onclick="toggleDiarySlot(' + s.id + ',\'' + s.status + '\')" ' +
              (canAct ? '' : 'disabled ') +
              'class="text-lg p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">' +
              toggleIcon +
            '</button>' +
            '<button data-action-btn onclick="deleteDiarySlot(' + s.id + ')" ' +
              (canAct ? '' : 'disabled ') +
              'class="text-base p-1.5 rounded-xl hover:bg-cream active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed">🗑</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4 card-in">' +
        '<div class="text-xs font-bold text-text-muted mb-2">' + dayName + ', ' + heDate + '</div>' +
        rows +
      '</div>'
    );
  }).join('');

  container.innerHTML = html;
}

async function toggleDiarySlot(slotId, currentStatus) {
  const newStatus = currentStatus === 'available' ? 'locked' : 'available';
  // Optimistic update
  const row = document.querySelector('[data-slot-id="' + slotId + '"]');
  if (row) {
    const badge = row.querySelector('[data-status-badge]');
    const toggleBtn = row.querySelectorAll('[data-action-btn]')[0];
    if (badge) {
      badge.textContent = SB_STATUS_LABEL[newStatus] || newStatus;
      badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (SB_STATUS_CLS[newStatus] || '');
    }
    if (toggleBtn) toggleBtn.textContent = newStatus === 'locked' ? '🔓' : '🔒';
  }
  try {
    const r = await apiCall('adminToggleSlot', { slotId });
    if (!r.success) throw new Error(r.error);
    const entry = S.diarySlots.find(s => s.id === slotId);
    if (entry) entry.status = r.newStatus;
    // update onclick attribute to reflect new status
    if (row) row.querySelector('[data-action-btn]').setAttribute('onclick',
      'toggleDiarySlot(' + slotId + ',\'' + r.newStatus + '\')');
  } catch (e) {
    // Revert
    renderDiarySlots(S.diarySlots);
    toast('שגיאה בשינוי הסטטוס', 'err');
  }
}

async function deleteDiarySlot(slotId) {
  if (!confirm('למחוק את החריץ הזה? הפעולה אינה הפיכה.')) return;
  try {
    const r = await apiCall('adminDeleteSlot', { slotId });
    if (!r.success) {
      if (r.error === 'cannot_delete_active') toast('לא ניתן למחוק חריץ תפוס', 'warn');
      else throw new Error(r.error);
      return;
    }
    S.diarySlots = S.diarySlots.filter(s => s.id !== slotId);
    renderDiarySlots(S.diarySlots);
    toast('החריץ נמחק ✓', 'ok');
  } catch (e) {
    toast('שגיאה במחיקת החריץ', 'err');
  }
}

async function addDiarySlot() {
  const dateEl = document.getElementById('js-add-slot-date');
  const timeEl = document.getElementById('js-add-slot-time');
  const date   = dateEl ? dateEl.value : '';
  const time   = timeEl ? timeEl.value : '';
  if (!date || !time) { toast('בחרי תאריך ושעה', 'warn'); return; }

  const today = new Date().toISOString().slice(0, 10);
  if (date < today) { toast('לא ניתן להוסיף חריץ בתאריך שעבר', 'warn'); return; }

  const btn = document.getElementById('js-add-slot-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner w-4 h-4"></span>'; }
  try {
    const r = await apiCall('adminAddSlot', { date, time });
    if (!r.success) throw new Error(r.error);
    toast('החריץ נוסף בהצלחה ✓', 'ok');
    // Reload if the new slot falls within the current view range
    const fromVal = document.getElementById('js-diary-from') ? document.getElementById('js-diary-from').value : '';
    const toVal   = document.getElementById('js-diary-to')   ? document.getElementById('js-diary-to').value   : '';
    if (fromVal && toVal && date >= fromVal && date <= toVal) await loadDiarySlots();
  } catch (e) {
    toast('שגיאה בהוספת החריץ', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ הוסף חריץ'; }
  }
}

// ── Clients Tab ───────────────────────────────────────────────────

async function loadClients(search) {
  S.clientSearch = search || '';
  const container = document.getElementById('js-clients-list');
  if (!container) return;
  container.innerHTML = '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';
  try {
    const r = await apiCall('adminGetClients', { search: S.clientSearch });
    if (!r.success) throw new Error(r.error);
    S.clients = r.clients;
    renderClientList(r.clients);
  } catch (e) {
    toast('שגיאה בטעינת לקוחות', 'err');
    container.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

function renderClientList(clients) {
  const container = document.getElementById('js-clients-list');
  if (!container) return;
  if (!clients || !clients.length) {
    container.innerHTML =
      '<div class="text-center py-14 text-text-muted">' +
        '<div class="text-3xl mb-2">🔍</div>' +
        '<div class="text-sm">לא נמצאו לקוחות</div>' +
      '</div>';
    return;
  }
  container.innerHTML = clients.map(c => {
    const joined = c.created_at
      ? new Date(c.created_at).toLocaleDateString('he-IL', { month: '2-digit', year: 'numeric' })
      : '';
    return (
      '<div class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in ' +
           'cursor-pointer hover:border-primary/40 transition-colors active:scale-[0.99]" ' +
           'onclick="loadClientHistory(\'' + esc(c.phone) + '\')">' +
        '<div class="flex items-center justify-between">' +
          '<div>' +
            '<div class="font-bold text-sm text-text-main">' + esc(c.full_name || '(ללא שם)') + '</div>' +
            '<div class="text-xs text-text-muted mt-0.5">' + esc(fmtPhone(c.phone)) + '</div>' +
          '</div>' +
          '<div class="text-xs text-text-muted">' + esc(joined) + '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

async function loadClientHistory(phone) {
  // Switch to history panel
  const listPanel    = document.getElementById('js-clients-list');
  const histPanel    = document.getElementById('js-client-history');
  const histList     = document.getElementById('js-history-list');
  if (listPanel) listPanel.classList.add('hidden');
  if (histPanel) histPanel.classList.remove('hidden');
  if (histList)  histList.innerHTML =
    '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';

  try {
    const r = await apiCall('adminGetClientHistory', { clientPhone: phone });
    if (!r.success) throw new Error(r.error);
    S.clientHistory = r;
    const nameEl  = document.getElementById('js-history-name');
    const phoneEl = document.getElementById('js-history-phone');
    if (nameEl)  nameEl.textContent  = r.client.full_name || '(ללא שם)';
    if (phoneEl) phoneEl.textContent = fmtPhone(r.client.phone);
    renderClientHistory(r.appointments);
  } catch (e) {
    toast('שגיאה בטעינת היסטוריה', 'err');
    if (histList) histList.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

function renderClientHistory(appointments) {
  const container = document.getElementById('js-history-list');
  if (!container) return;
  if (!appointments || !appointments.length) {
    container.innerHTML = '<div class="text-xs text-text-muted text-center py-8">אין הזמנות קודמות</div>';
    return;
  }
  container.innerHTML = appointments.map(a => {
    const statusLabel = LABELS[a.status]   || a.status;
    const statusCls   = STATUS_CLS[a.status] || 'bg-gray-100 text-gray-400';
    const dateParts   = a.date ? a.date.split('-') : [];
    const heDate      = dateParts.length === 3 ? dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0] : '—';
    const isPending   = a.status === 'pending' || a.status === 'Pending';

    const actionBtns = isPending
      ? '<div class="flex gap-2 mt-2">' +
          '<button data-action-btn data-appt-id="' + esc(a.id) + '" ' +
            'onclick="_processHistoryDecision(\'' + esc(a.id) + '\',\'' + esc(a.admin_token) + '\',\'Approved\')" ' +
            'class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">' +
            '✅ אשר' +
          '</button>' +
          '<button data-action-btn data-appt-id="' + esc(a.id) + '" ' +
            'onclick="_processHistoryDecision(\'' + esc(a.id) + '\',\'' + esc(a.admin_token) + '\',\'Rejected\')" ' +
            'class="flex-1 bg-red-400 hover:bg-red-500 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60">' +
            '❌ דחה' +
          '</button>' +
        '</div>'
      : '';

    return (
      '<div data-appt-row class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in">' +
        '<div class="flex items-start justify-between mb-1">' +
          '<div>' +
            '<div class="font-bold text-sm text-text-main">' + esc(heDate) + ' בשעה ' + esc(a.time || '—') + '</div>' +
            '<div class="text-xs text-text-muted mt-0.5">' + esc(a.treatment_name || '') + '</div>' +
          '</div>' +
          '<span data-status-badge class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ' + statusCls + '">' + statusLabel + '</span>' +
        '</div>' +
        actionBtns +
      '</div>'
    );
  }).join('');
}

async function _processHistoryDecision(bookingId, adminToken, decision) {
  // Use 'adminAction' (handleAdminActionV2) with the appointment HMAC token.
  // changeStatus cannot find Supabase appointments — it reads Sheets only.
  const btns = document.querySelectorAll('[data-appt-id="' + bookingId + '"]');
  btns.forEach(b => { b.disabled = true; });

  try {
    const r = await apiCall('adminAction', { bookingId, token: adminToken, decision });
    if (!r.success) {
      if (r.error === 'already_processed') toast('ההזמנה כבר טופלה', 'warn');
      else throw new Error(r.error);
      btns.forEach(b => { b.disabled = false; });
      return;
    }
    toast(decision === 'Approved' ? 'ההזמנה אושרה ✓' : 'ההזמנה נדחתה', 'ok');
    // Optimistic status update in DOM
    const newStatus   = decision === 'Approved' ? 'approved' : 'rejected';
    const statusLabel = LABELS[newStatus];
    const statusCls   = STATUS_CLS[newStatus];
    btns.forEach(btn => {
      const row = btn.closest('[data-appt-row]');
      if (!row) return;
      const badge = row.querySelector('[data-status-badge]');
      if (badge) { badge.textContent = statusLabel; badge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ' + statusCls; }
      row.querySelectorAll('[data-action-btn]').forEach(b => b.remove());
    });
    // Sync in-memory state
    if (S.clientHistory && S.clientHistory.appointments) {
      const appt = S.clientHistory.appointments.find(a => a.id === bookingId);
      if (appt) appt.status = newStatus;
    }
  } catch (e) {
    btns.forEach(b => { b.disabled = false; });
    toast('שגיאה בעדכון הסטטוס', 'err');
  }
}

"""

if ANCHOR_END not in src:
    errors.append('PATCH E: DOMContentLoaded anchor not found')
else:
    src = src.replace(ANCHOR_END, NEW_FUNCTIONS + ANCHOR_END, 1)
    print('PATCH E OK: new functions appended')

# ── Write result ─────────────────────────────────────────────────────────────
if errors:
    for e in errors:
        print('ERROR:', e)
    sys.exit(1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('admin.js written successfully —', len(src), 'chars')
