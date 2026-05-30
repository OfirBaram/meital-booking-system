'use strict';

import APP_CONFIG from './config.js';
import {
  esc, fmtPhone,
  LABELS, STATUS_CLS, SERVICE_NAME, DAY_NAMES_HE, SB_STATUS_LABEL, SB_STATUS_CLS,
  buildCard, buildSwipeCard,
  renderDiarySlots, renderClientList, renderClientHistory, renderSmsLog,
} from './admin-render.js';
import { buildCalData, renderCalendar, formatCalTitle, calDayStatus } from './admin-calendar.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from './admin-sheet.js';
import { initCardSwipe } from './admin-gestures.js';

const API         = APP_CONFIG.API_URL;
const LS_TOKEN    = 'meital_admin_token';
const LS_TS       = 'meital_admin_ts';
const SESSION_TTL = 24 * 60 * 60 * 1000;

const S = {
  token:          localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  filter:   'all',
  dateJump: '',
  tab:      'calendar',
  template: [],
  autoSms:  true,
  _smsSendTarget: null,
  diarySlots:        [],
  clients:           [],
  clientHistory:     null,
  clientSearch:      '',
  _clientSearchTimer: null,
  calData:  {},
  calMonth: new Date(),
  slotCache: {},
};

async function apiCall(action, extra = {}) {
  const r = await fetch(API, {
    method:  'POST',
    body:    JSON.stringify({ action, token: S.token, ...extra }),
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function sbCall(funcName, body) {
  const r = await fetch(
    APP_CONFIG.SUPABASE_URL + '/functions/v1/' + funcName,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + APP_CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ adminToken: S.token, ...body }),
    }
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

let _toastTmr;
let _undoTmr    = null;
let _pendingUndo = null;

function toast(msg, type = '') {
  const wrap    = document.getElementById('js-toast');
  const inner   = wrap.querySelector('div');
  const msgEl   = document.getElementById('js-toast-msg');
  const undoBtn = document.getElementById('js-toast-undo');
  clearTimeout(_toastTmr);
  // Flush any pending undo — commit it before showing unrelated toast
  if (_pendingUndo) {
    clearTimeout(_undoTmr);
    const prev = _pendingUndo; _pendingUndo = null;
    prev.commitFn();
  }
  if (undoBtn) undoBtn.classList.add('hidden');
  if (msgEl) msgEl.textContent = msg;
  else inner.textContent = msg;
  inner.className = [
    'flex items-center gap-3 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl pointer-events-auto',
    type === 'err' ? 'bg-red-500 text-white' :
    type === 'ok'  ? 'bg-green-600 text-white' :
                     'bg-text-main text-white',
  ].join(' ');
  wrap.classList.remove('hidden');
  wrap.classList.add('toast-in');
  _toastTmr = setTimeout(() => {
    wrap.classList.add('hidden');
    wrap.classList.remove('toast-in');
  }, 3200);
}

function toastUndo(label, commitFn, onUndo, ttl = 5000) {
  // Flush previous pending commit before showing new toast
  if (_pendingUndo) {
    clearTimeout(_undoTmr);
    const prev = _pendingUndo; _pendingUndo = null;
    prev.commitFn();
  }
  clearTimeout(_toastTmr);

  const wrap    = document.getElementById('js-toast');
  const inner   = wrap.querySelector('div');
  const msgEl   = document.getElementById('js-toast-msg');
  let   undoBtn = document.getElementById('js-toast-undo');

  if (msgEl) msgEl.textContent = label;
  inner.className = 'flex items-center gap-3 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl pointer-events-auto bg-text-main text-white';
  wrap.classList.remove('hidden');
  wrap.classList.add('toast-in');

  _pendingUndo = { commitFn };

  // Replace button to clear stale listeners (cloneNode trick)
  if (undoBtn) {
    const fresh = undoBtn.cloneNode(true);
    undoBtn.parentNode.replaceChild(fresh, undoBtn);
    undoBtn = fresh;
    undoBtn.classList.remove('hidden');
    undoBtn.addEventListener('click', () => {
      clearTimeout(_undoTmr);
      _pendingUndo = null;
      wrap.classList.add('hidden');
      wrap.classList.remove('toast-in');
      const b2 = document.getElementById('js-toast-undo');
      if (b2) b2.classList.add('hidden');
      onUndo && onUndo();
    }, { once: true });
  }

  _undoTmr = setTimeout(() => {
    _pendingUndo = null;
    wrap.classList.add('hidden');
    wrap.classList.remove('toast-in');
    const b2 = document.getElementById('js-toast-undo');
    if (b2) b2.classList.add('hidden');
    commitFn();
  }, ttl);
}
function sessionValid() {
  const ts = parseInt(localStorage.getItem(LS_TS) || '0', 10);
  return ts > 0 && (Date.now() - ts) < SESSION_TTL;
}

function showLogin() {
  document.getElementById('js-login').classList.remove('hidden');
  document.getElementById('js-dash').classList.add('hidden');
}

function showDash() {
  document.getElementById('js-login').classList.add('hidden');
  document.getElementById('js-dash').classList.remove('hidden');
}

function logout() {
  S.token = '';
  S.slotCache = {};
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_TS);
  showLogin();
  document.getElementById('js-token-input').value = '';
  document.getElementById('js-login-err').classList.add('hidden');
}

async function login() {
  const inp   = document.getElementById('js-token-input');
  const token = inp.value.trim();
  if (!token) return;

  const btn = document.getElementById('js-login-btn');
  const err = document.getElementById('js-login-err');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-5 h-5 spinner"></span>';
  err.classList.add('hidden');

  S.token = token;
  try {
    const r = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/list-bookings`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ adminToken: S.token }) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'auth');
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_TS, String(Date.now()));
    S.bookings = data.bookings || [];
    showDash();
    hideSkeleton();
    render();
    updateStats();
    loadAndRenderCalendar();
  } catch (_) {
    S.token = '';
    err.classList.remove('hidden');
    inp.focus();
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'כניסה';
  }
}

async function load(silent = false) {
  if (!sessionValid()) { logout(); return; }
  if (!silent) showSkeleton();
  try {
    const r = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/list-bookings`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ adminToken: S.token }) }
    );
    if (r.status === 403) { logout(); return; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'error');
    S.bookings = data.bookings || [];
    render();
    updateStats();
    if (S.tab === 'pulse') renderPulse();
    if (S.tab === 'calendar') renderVisibleCalendar();
  } catch (e) {
    if (e.message !== 'unauthorized') toast('שגיאה בטעינת ההזמנות', 'err');
  } finally {
    if (!silent) hideSkeleton();
  }
}

function showSkeleton() {
  document.getElementById('js-skeleton').classList.remove('hidden');
  document.getElementById('js-cards').classList.add('hidden');
  document.getElementById('js-empty').classList.add('hidden');
}

function hideSkeleton() {
  document.getElementById('js-skeleton').classList.add('hidden');
  document.getElementById('js-cards').classList.remove('hidden');
}

function setTab(tab) {
  S.tab = tab;
  ['calendar','bookings','pulse','slots','diary','clients'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.nav-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.className = [
      'nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-all',
      active ? 'text-primary' : 'text-text-muted',
    ].join(' ');
  });
  if (tab === 'pulse')  renderPulse();
  // Restart entrance animation on the newly visible tab
  const _tabEl = document.getElementById('tab-' + tab);
  if (_tabEl) {
    _tabEl.classList.remove('tab-entering');
    void _tabEl.offsetWidth;
    _tabEl.classList.add('tab-entering');
    setTimeout(() => _tabEl.classList.remove('tab-entering'), 220);
  }

  if (tab === 'slots')    loadTemplate();
  if (tab === 'calendar') loadAndRenderCalendar();
  if (tab === 'diary')  {
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
}

function updateStats() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('stat-pending').textContent =
    S.bookings.filter(b => b.status === 'Pending').length;
  document.getElementById('stat-today').textContent =
    S.bookings.filter(b => b.date === today && ['Pending','Approved'].includes(b.status)).length;
  document.getElementById('stat-total').textContent = S.bookings.length;
}

function isStale(b) {
  if (!b.date) return false;
  const dt = new Date(b.date + 'T' + (b.time || '00:00') + ':00');
  if (isNaN(dt.getTime())) return false;
  return (Date.now() - dt.getTime()) > 48 * 60 * 60 * 1000;
}

function isFinished(b) {
  return b.status === 'Rejected' || b.status === 'Cancelled';
}

function visible() {
  let rows = S.bookings;

  if (S.dateJump) {
    rows = rows.filter(b => b.date === S.dateJump);
    return rows;
  }

  if (S.filter === 'history')
    return rows.filter(b => isFinished(b) || isStale(b));
  if (S.filter === 'all')
    return rows.filter(b => !isFinished(b) && !isStale(b));
  return rows.filter(b => b.status === S.filter && !isStale(b));
}

function render() {
  const cards = document.getElementById('js-cards');
  const empty = document.getElementById('js-empty');
  const rows  = visible();

  if (rows.length === 0) {
    cards.innerHTML = '';
    cards.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  cards.innerHTML = rows.map(buildSwipeCard).join('');
  cards.classList.remove('hidden');
  cards.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));
  cards.querySelectorAll('.swipe-wrapper').forEach(w =>
    initCardSwipe(w, { onCommit: _commitCardAction }));
  // Staggered entrance animation
  cards.classList.remove('cards-entering');
  void cards.offsetWidth;
  cards.classList.add('cards-entering');
}

async function onAction(e) {
  const btn    = e.currentTarget;
  const id     = btn.dataset.id;
  const target = btn.dataset.action;
  if (target === 'sms') {
    openSmsModal({ id, phone: btn.dataset.phone, name: btn.dataset.name });
    return;
  }
  _commitCardAction(id, target);
}

function setFilter(f) {
  S.filter   = f;
  S.dateJump = '';
  document.getElementById('js-date-jump').value = '';
  document.querySelectorAll('.filter-pill').forEach(btn => {
    const active = btn.dataset.filter === f;
    btn.className = [
      'filter-pill shrink-0 text-xs font-semibold px-4 py-2 rounded-xl transition-all',
      active ? 'bg-primary text-white shadow-sm' : 'bg-white text-text-muted border border-secondary/40 hover:border-primary hover:text-primary',
    ].join(' ');
  });
  render();
}

function renderPulse() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  const dow       = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekKey  = weekStart.toISOString().slice(0, 10);

  const monthKey  = today.slice(0, 7);

  const in7Days   = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const weekCount     = S.bookings.filter(b => b.date >= weekKey && b.date <= today && b.status !== 'Rejected' && b.status !== 'Cancelled').length;
  const monthCount    = S.bookings.filter(b => b.date && b.date.startsWith(monthKey) && b.status !== 'Rejected' && b.status !== 'Cancelled').length;
  const upcomingCount = S.bookings.filter(b => b.date > today && b.date <= in7Days && ['Pending','Approved'].includes(b.status)).length;
  const cancelCount   = S.bookings.filter(b => b.status === 'Rejected' || b.status === 'Cancelled').length;

  document.getElementById('pulse-week').textContent       = weekCount;
  document.getElementById('pulse-month').textContent     = monthCount;
  document.getElementById('pulse-upcoming').textContent  = upcomingCount;
  document.getElementById('pulse-cancelled').textContent = cancelCount;

  const svcCount = {};
  S.bookings.forEach(b => {
    if (b.status === 'Rejected' || b.status === 'Cancelled') return;
    const name = b.serviceName || SERVICE_NAME[b.service] || b.service || 'אחר';
    svcCount[name] = (svcCount[name] || 0) + 1;
  });
  const total = Object.values(svcCount).reduce((a, b) => a + b, 0) || 1;
  const svcEl = document.getElementById('pulse-services');
  svcEl.innerHTML = Object.entries(svcCount).sort((a,b) => b[1]-a[1]).map(([name, n]) => {
    const pct = Math.round(n / total * 100);
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-text-main font-medium">${esc(name)}</span>
        <span class="text-text-muted">${n} (${pct}%)</span>
      </div>
      <div class="h-1.5 bg-secondary/30 rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('') || '<p class="text-xs text-text-muted">אין נתונים</p>';

  const upcoming = S.bookings
    .filter(b => b.date > today && b.date <= in7Days && ['Pending','Approved'].includes(b.status))
    .sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1)
    .slice(0, 8);
  const listEl = document.getElementById('pulse-upcoming-list');
  listEl.innerHTML = upcoming.length === 0
    ? '<p class="text-xs text-text-muted">אין הזמנות קרובות</p>'
    : upcoming.map(b => `
        <div class="flex items-center justify-between py-1.5 border-b border-secondary/20 last:border-0">
          <div>
            <span class="font-medium text-text-main text-xs">${esc(b.name)}</span>
            <span class="text-text-muted text-xs mr-2">${esc(b.serviceName)}</span>
          </div>
          <span class="text-xs text-text-muted">${(b.date||'').replace(/-/g,'/')} ${esc(b.time)}</span>
        </div>`).join('');
}

const DEFAULT_TEMPLATE = [
  { dayOfWeek: 0, dayName: 'ראשון',  active: true,  startTimes: [] },
  { dayOfWeek: 1, dayName: 'שני',    active: true,  startTimes: [] },
  { dayOfWeek: 2, dayName: 'שלישי',  active: true,  startTimes: [] },
  { dayOfWeek: 3, dayName: 'רביעי',  active: true,  startTimes: [] },
  { dayOfWeek: 4, dayName: 'חמישי',  active: true,  startTimes: [] },
  { dayOfWeek: 5, dayName: 'שישי',   active: false, startTimes: [] },
  { dayOfWeek: 6, dayName: 'שבת',    active: false, startTimes: [] },
];

function loadTemplate() {
  document.getElementById('js-template-skeleton').classList.remove('hidden');
  document.getElementById('js-template-rows').classList.add('hidden');
  document.getElementById('js-save-template').disabled = true;
  loadSystemInfo();
  try {
    const saved = localStorage.getItem('meital_slot_template');
    S.template = saved ? JSON.parse(saved) : DEFAULT_TEMPLATE.map(r => ({ ...r }));
    renderTemplate();
  } catch (e) {
    S.template = DEFAULT_TEMPLATE.map(r => ({ ...r }));
    renderTemplate();
  } finally {
    document.getElementById('js-template-skeleton').classList.add('hidden');
    document.getElementById('js-template-rows').classList.remove('hidden');
    document.getElementById('js-save-template').disabled = false;
  }
}

function renderTemplate() {
  const container = document.getElementById('js-template-rows');
  container.innerHTML = S.template.map((row, i) => {
    const timesStr = (row.startTimes || []).join(', ');
    return `
<div class="flex items-center gap-2 py-2 border-b border-secondary/15 last:border-0">
  <label class="flex items-center gap-1.5 shrink-0 w-20">
    <input type="checkbox" data-tmpl-idx="${i}" class="tmpl-active accent-primary"
       ${row.active ? 'checked' : ''} ${row.dayOfWeek >= 5 ? 'disabled' : ''}>
    <span class="text-xs font-semibold text-text-main">${esc(row.dayName)}</span>
  </label>
  <input type="text" data-tmpl-times="${i}" placeholder="09:00, 11:00, 14:00"
    value="${esc(timesStr)}"
    class="flex-1 border border-secondary/40 rounded-lg px-2 py-1 text-xs text-text-main focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary transition-colors ${!row.active || row.dayOfWeek >= 5 ? 'opacity-40' : ''}"
    ${!row.active || row.dayOfWeek >= 5 ? 'disabled' : ''}>
</div>`;
  }).join('');

  container.querySelectorAll('.tmpl-active').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx   = parseInt(cb.dataset.tmplIdx, 10);
      const input = container.querySelector('[data-tmpl-times="' + idx + '"]');
      input.disabled = !cb.checked;
      input.classList.toggle('opacity-40', !cb.checked);
    });
  });
}

function saveTemplate() {
  const container = document.getElementById('js-template-rows');
  const payload   = S.template.map((row, i) => {
    const cb    = container.querySelector('[data-tmpl-idx="' + i + '"]');
    const input = container.querySelector('[data-tmpl-times="' + i + '"]');
    const active = cb ? cb.checked : row.active;
    const rawTimes = input ? input.value : '';
    const startTimes = rawTimes.split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
    return { dayOfWeek: row.dayOfWeek, dayName: row.dayName, startTimes, active };
  });

  const btn = document.getElementById('js-save-template');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span>';
  try {
    localStorage.setItem('meital_slot_template', JSON.stringify(payload));
    toast('תבנית נשמרה ✅', 'ok');
    S.template = payload;
  } catch (e) {
    toast('שגיאה בשמירת התבנית', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'שמור';
  }
}

async function generateSlots() {
  const startDate = document.getElementById('js-gen-start').value;
  const endDate   = document.getElementById('js-gen-end').value;
  if (!startDate || !endDate) { toast('יש לבחור תאריך התחלה וסיום', 'err'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) { toast('תאריך לא תקין', 'err'); return; }
  if (endDate < startDate)    { toast('תאריך הסיום חייב להיות אחרי ההתחלה', 'err'); return; }

  const template = S.template.filter(r => r.active && r.startTimes?.length > 0);
  if (template.length === 0) { toast('לא נוצרו תורים — הגדר שעות בתבנית השבועית תחילה', 'err'); return; }

  const btn = document.getElementById('js-gen-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> יוצר...';
  try {
    const r = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/generate-slots`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ adminToken: S.token, startDate, endDate, template }),
      }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data.success) throw new Error(data.error);
    if (data.added === 0) {
      toast('לא נוצרו תורים חדשים — הכול כבר קיים', 'ok');
    } else {
      toast('נוצרו ' + data.added + ' תורים חדשים ✅', 'ok');
    }
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'צור תורים';
  }
}


async function loadSystemInfo() {
  try {
    const data = await apiCall('getSystemInfo');
    const el   = document.getElementById('js-reminder-last');
    if (data.success && data.reminderLastRun) {
      el.textContent = 'נשלח לאחרונה: ' + data.reminderLastRun.replace(/-/g, '/');
    } else if (data.success) {
      el.textContent = 'טרם נשלח';
    }
  } catch (_) {}
}

async function sendReminders() {
  const force = document.getElementById('js-reminder-force').checked;
  const btn   = document.getElementById('js-reminder-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> שולח...';
  try {
    const data = await apiCall('sendReminders', { force });
    if (!data.success) throw new Error(data.error);
    if (data.skipped) {
      toast('כבר נשלח היום — סמן "שלח גם אם כבר נשלח" לשליחה חוזרת', '');
    } else {
      toast('נשלחו ' + data.sent + ' תזכורות ✅', 'ok');
    }
    await loadSystemInfo();
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'שלח תזכורות למחר';
  }
}

function openSmsModal(booking) {
  S._smsSendTarget = booking;
  document.getElementById('js-sms-recipient').textContent =
    booking.name + ' (' + fmtPhone(booking.phone) + ')';
  document.getElementById('js-sms-text').value =
    'היי ' + booking.name + ', רציתי לעדכן ש…';
  const sendBtn = document.getElementById('js-sms-send');
  sendBtn.disabled = false;
  sendBtn.textContent = 'שלח SMS';
  document.getElementById('js-sms-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('js-sms-text').focus(), 50);
}

function closeSmsModal() {
  document.getElementById('js-sms-modal').classList.add('hidden');
  S._smsSendTarget = null;
}

async function sendManualSMS() {
  if (!S._smsSendTarget) return;
  const text = document.getElementById('js-sms-text').value.trim();
  if (!text) { toast('ההודעה ריקה', 'err'); return; }
  const btn = document.getElementById('js-sms-send');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span>';
  try {
    const data = await apiCall('sendManualSMS', {
      phone:   S._smsSendTarget.phone,
      message: text,
    });
    if (!data.success) throw new Error(data.error || 'error');
    toast('SMS נשלח ✅', 'ok');
    closeSmsModal();
  } catch (e) {
    toast('שגיאה בשליחת SMS', 'err');
    btn.disabled = false;
    btn.textContent = 'שלח SMS';
  }
}

async function loadAutoSmsToggle() {
  try {
    const data = await apiCall('getAutoSms');
    if (data.success) setAutoSmsUI(data.enabled);
  } catch (_) {}
}

function setAutoSmsUI(enabled) {
  S.autoSms = enabled;
  const track = document.getElementById('js-auto-sms-track');
  const thumb = document.getElementById('js-auto-sms-thumb');
  if (!track || !thumb) return;
  track.className = 'relative w-9 h-5 rounded-full transition-colors '
    + (enabled ? 'bg-primary' : 'bg-gray-300');
  thumb.className = 'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform '
    + (enabled ? 'left-[calc(100%-1.125rem)]' : 'left-0.5');
}

async function toggleAutoSms() {
  const newVal = !S.autoSms;
  setAutoSmsUI(newVal);
  try {
    const data = await apiCall('setAutoSms', { enabled: newVal });
    if (!data.success) throw new Error(data.error);
    toast(newVal ? 'SMS אוטומטי מופעל ✅' : 'SMS אוטומטי כבוי', newVal ? 'ok' : '');
  } catch (e) {
    setAutoSmsUI(!newVal);
    toast('שגיאה בשמירת ההגדרה', 'err');
  }
}


async function loadSmsLog() {
  const el = document.getElementById('js-sms-log');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">טוען...</div>';
  try {
    const data = await sbCall('sms-log', {});
    if (!data.success) throw new Error(data.error);
    renderSmsLog(data.entries || [], el);
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-4">שגיאה: ' + e.message + '</div>';
  }
}


function renderVisibleCalendar() {
  const y   = S.calMonth.getFullYear();
  const mo  = S.calMonth.getMonth() + 1;
  const key = y + '-' + String(mo).padStart(2, '0');
  S.calData = buildCalData(S.bookings, S.slotCache[key] || []);
  renderCalendar(
    document.getElementById('js-cal-grid'),
    document.getElementById('js-cal-title'),
    y, mo, S.calData,
    { onDayClick: onCalDayClick }
  );
}

async function loadAndRenderCalendar() {
  const y   = S.calMonth.getFullYear();
  const mo  = S.calMonth.getMonth() + 1;
  const key = y + '-' + String(mo).padStart(2, '0');
  if (!S.slotCache[key]) {
    const lastDay = new Date(y, mo, 0).getDate();
    const from = key + '-01';
    const to   = key + '-' + String(lastDay).padStart(2, '0');
    try {
      const r = await sbCall('admin-slots', { action: 'getSlots', dateFrom: from, dateTo: to });
      S.slotCache[key] = (r.success && r.slots) ? r.slots : [];
    } catch { S.slotCache[key] = []; }
  }
  renderVisibleCalendar();
}

let _sheetOpenDate = null;

function _todayISO() {
  const n = new Date();
  return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
    + '-' + String(n.getDate()).padStart(2, '0');
}

/** Build the full day-sheet payload: bookings (calData), the day's slots, and isPast. */
function _dayPayload(dateStr) {
  const month    = dateStr.substring(0, 7);
  const daySlots = (S.slotCache[month] || []).filter(s => s.date === dateStr);
  return {
    dateStr,
    entry:  S.calData[dateStr] || null,
    slots:  daySlots,
    isPast: dateStr < _todayISO(),
  };
}

function onCalDayClick(dateStr, entry) {
  _sheetOpenDate = dateStr;
  _updatePeekStrip(dateStr, entry);
  openSheet('day', _dayPayload(dateStr));
}

function _updatePeekStrip(dateStr, entry) {
  const peekDate    = document.getElementById('js-cal-peek-date');
  const peekContent = document.getElementById('js-cal-peek-content');
  const peekBtn     = document.getElementById('js-cal-peek-add');
  if (peekDate) {
    const d = new Date(dateStr + 'T00:00:00');
    peekDate.textContent = DAY_NAMES_HE[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1);
  }
  if (peekContent) {
    const { pendingCount, approvedCount, freeSlotCount } = calDayStatus(entry);
    const parts = [];
    if (pendingCount > 0) {
      parts.push('<span class="font-semibold text-amber-600">' + pendingCount +
        (pendingCount === 1 ? ' ממתינה לאישור' : ' ממתינות לאישור') + '</span>');
    }
    if (approvedCount > 0) {
      parts.push('<span class="font-semibold text-green-600">' + approvedCount +
        (approvedCount === 1 ? ' מאושרת' : ' מאושרות') + '</span>');
    }
    if (freeSlotCount > 0) {
      parts.push('<span class="font-semibold text-rose-500">' + freeSlotCount +
        (freeSlotCount === 1 ? ' פנוי' : ' פנויים') + '</span>');
    }
    peekContent.innerHTML = parts.length ? parts.join(' • ') : '<span class="text-text-muted">אין חריצים</span>';
  }
  if (peekBtn) { peekBtn.classList.remove('hidden'); peekBtn.dataset.peekDate = dateStr; }
}

function _commitCardAction(id, target) {
  const wrapper  = document.querySelector('[data-swipe-id="' + id + '"]');
  const card     = wrapper ? wrapper.querySelector('.swipe-card') : null;
  const booking  = S.bookings.find(b => b.id === id);
  const prevStatus = booking ? booking.status : null;
  if (booking) booking.status = target;

  if (wrapper && card) {
    const dir = (target === 'Approved') ? 1 : -1;
    card.style.transition = 'transform 0.22s ease-in';
    card.style.transform  = 'translate3d(' + (dir * 115) + '%, 0, 0)';
    wrapper.style.overflow   = 'hidden';
    wrapper.style.transition = 'max-height 0.28s 0.1s, margin-bottom 0.28s 0.1s, opacity 0.2s 0.08s';
    setTimeout(() => {
      wrapper.style.maxHeight    = '0';
      wrapper.style.marginBottom = '0';
      wrapper.style.opacity      = '0';
    }, 40);
  }

  const OK = {
    Approved:  'ההזמנה אושרה',
    Rejected:  'ההזמנה נדחתה',
    Cancelled: 'ההזמנה בוטלה',
  };
  toastUndo(
    OK[target] || 'עודכן',
    async () => {
      try {
        const r = await fetch(
          `${APP_CONFIG.SUPABASE_URL}/functions/v1/change-status`,
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: target }) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data.success) throw new Error(data.error || 'error');
        // GAS side-effects (SMS + Calendar) — fire-and-forget
        // Approval failures surface as a warning so Meital can verify the calendar manually
        apiCall('changeStatus', { bookingId: id, targetStatus: target }).catch(e => {
          console.warn('[changeStatus GAS side-effects failed]', e.message);
          if (target === 'Approved') toast('אושר! ⚠️ יש לבדוק שהיומן עודכן', 'warn');
        });
        await load(true);
      } catch (e) {
        if (booking && prevStatus) booking.status = prevStatus;
        toast('שגיאה: ' + e.message, 'err');
        await load(true);
      }
    },
    () => {
      if (booking && prevStatus) booking.status = prevStatus;
      render();
    }
  );
}

function _commitSheetAction(id, target) {
  const booking = S.bookings.find(b => b.id === id);
  if (!booking) return;
  const prevStatus = booking.status;

  // Optimistic update + close the sheet so the admin immediately sees the
  // calendar with the day's status changed (dot/tint updates in place).
  booking.status = target;
  renderVisibleCalendar();
  closeSheet();

  const OK = { Approved: 'ההזמנה אושרה ✓', Rejected: 'ההזמנה נדחתה', Cancelled: 'ההזמנה בוטלה' };
  toastUndo(
    OK[target] || 'עודכן',
    async () => {
      try {
        const r = await fetch(
          APP_CONFIG.SUPABASE_URL + '/functions/v1/change-status',
          { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + APP_CONFIG.SUPABASE_ANON_KEY },
            body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: target }) }
        );
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!data.success) throw new Error(data.error || 'error');
        apiCall('changeStatus', { bookingId: id, targetStatus: target }).catch(e => {
          console.warn('[changeStatus GAS side-effects failed]', e.message);
          if (target === 'Approved') toast('אושר! ⚠️ יש לבדוק שהיומן עודכן', 'warn');
        });
        await load(true);            // refresh underlying data; calendar re-renders
      } catch (e) {
        if (booking) booking.status = prevStatus;
        renderVisibleCalendar();
        toast('שגיאה: ' + e.message, 'err');
        await load(true);
      }
    },
    () => {
      // Undo — revert the optimistic change; calendar reflects it instantly.
      if (booking) booking.status = prevStatus;
      renderVisibleCalendar();
    }
  );
}

function startAutoRefresh() {
  setInterval(() => load(true), 60_000);
}

async function init() {
  document.getElementById('js-login-btn').addEventListener('click', login);
  document.getElementById('js-token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('js-logout-btn').addEventListener('click', logout);

  document.getElementById('js-refresh-btn').addEventListener('click', async () => {
    const icon = document.getElementById('js-refresh-icon');
    icon.style.animation = 'spin 0.6s linear infinite';
    await load();
    if (S.tab === 'slots') loadTemplate();
    setTimeout(() => { icon.style.animation = ''; }, 800);
  });

  document.querySelectorAll('.filter-pill').forEach(btn =>
    btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
  setFilter('all');

  document.getElementById('js-date-jump').addEventListener('change', e => {
    S.dateJump = e.target.value;
    render();
  });
  document.getElementById('js-date-clear').addEventListener('click', () => {
    S.dateJump = '';
    document.getElementById('js-date-jump').value = '';
    render();
  });

  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  document.getElementById('js-cal-prev').addEventListener('click', () => {
    S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1);
    loadAndRenderCalendar();
  });
  document.getElementById('js-cal-next').addEventListener('click', () => {
    S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1);
    loadAndRenderCalendar();
  });
  const todayBtn = document.getElementById('js-cal-today');
  if (todayBtn) todayBtn.addEventListener('click', () => {
    S.calMonth = new Date();
    loadAndRenderCalendar();
  });

  const peekAddBtn = document.getElementById('js-cal-peek-add');
  if (peekAddBtn) {
    peekAddBtn.addEventListener('click', () => {
      const d = peekAddBtn.dataset.peekDate;
      if (!d) return;
      if (!isSheetOpen()) { _sheetOpenDate = d; openSheet('day', _dayPayload(d)); }
    });
  }

  document.getElementById('js-save-template').addEventListener('click', saveTemplate);
  document.getElementById('js-gen-submit').addEventListener('click', generateSlots);
  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);

  document.getElementById('js-auto-sms-btn').addEventListener('click', toggleAutoSms);

  document.getElementById('js-sms-close').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-cancel').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-backdrop').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-send').addEventListener('click', sendManualSMS);

  document.getElementById('js-diary-load').addEventListener('click', loadDiarySlots);
  document.getElementById('js-add-slot-btn').addEventListener('click', addDiarySlot);
  document.getElementById('js-log-refresh').addEventListener('click', loadSmsLog);

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
  });

  initSheet();

  document.addEventListener('sheet:action', e => {
    const { action, id, date } = e.detail;
    if (action === 'addSlot') {
      const slotDate = date;
      const slotTime = e.detail.time || '';
      if (!slotTime) { toast('בחרי שעה להוספה', 'warn'); return; }
      (async () => {
        try {
          const r = await sbCall('admin-slots', { action: 'addSlot', date: slotDate, time: slotTime });
          if (!r.success) throw new Error(r.error);
          if (r.already_exists) {
            toast('חריץ בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
          } else {
            toast('החריץ נוסף ✓', 'ok');
            // Close the sheet and reveal the calendar with the new free slot.
            closeSheet();
            delete S.slotCache[slotDate.substring(0, 7)];
            await load(true);
            await loadAndRenderCalendar();
          }
        } catch (err) {
          toast('שגיאה בהוספת החריץ', 'err');
        }
      })();
      return;
    }
    if (action === 'deleteSlot' || action === 'blockSlot') {
      const slotId = Number(e.detail.slotId);
      if (!slotId) return;
      const dayDate = _sheetOpenDate;
      (async () => {
        try {
          // deleteSlot removes the slot; blockSlot flips available↔locked (toggleSlot).
          const apiAction = action === 'deleteSlot' ? 'deleteSlot' : 'toggleSlot';
          const r = await sbCall('admin-slots', { action: apiAction, slotId });
          if (!r.success) throw new Error(r.error);
          toast(action === 'deleteSlot' ? 'החריץ נמחק' : 'החריץ נחסם', 'ok');
          if (dayDate) delete S.slotCache[dayDate.substring(0, 7)];
          await load(true);
          await loadAndRenderCalendar();
          // Slot management keeps the popup open — re-open with fresh day data.
          if (dayDate && isSheetOpen()) openSheet('day', _dayPayload(dayDate));
        } catch (err) {
          toast('שגיאה בעדכון החריץ', 'err');
        }
      })();
      return;
    }
    const STATUS_MAP = { approve: 'Approved', reject: 'Rejected', cancel: 'Cancelled' };
    if (STATUS_MAP[action]) _commitSheetAction(id, STATUS_MAP[action]);
  });

  if (S.token && sessionValid()) {
    try {
      const r = await fetch(
        `${APP_CONFIG.SUPABASE_URL}/functions/v1/list-bookings`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ adminToken: S.token }) }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.success) throw new Error(data.error);
      S.bookings = data.bookings || [];
      showDash();
      hideSkeleton();
      render();
      updateStats();
      loadAndRenderCalendar();
      loadAutoSmsToggle();
    } catch (_) {
      logout();
    }
  } else if (S.token) {
    logout();
  }

  startAutoRefresh();
}

async function loadDiarySlots() {
  const fromEl = document.getElementById('js-diary-from');
  const toEl   = document.getElementById('js-diary-to');
  const from   = fromEl ? fromEl.value : '';
  const to     = toEl   ? toEl.value   : '';
  if (!from || !to) { toast('בחרי תחילה טווח תאריכים', 'warn'); return; }

  const btn = document.getElementById('js-diary-load');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner w-4 h-4"></span>'; }
  try {
    const r = await sbCall('admin-slots', { action: 'getSlots', dateFrom: from, dateTo: to });
    if (!r.success) throw new Error(r.error);
    S.diarySlots = r.slots;
    renderDiarySlots(r.slots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
  } catch (e) {
    toast('שגיאה בטעינת התורים', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'טען תורים'; }
  }
}

async function toggleDiarySlot(slotId, currentStatus) {
  const newStatus = currentStatus === 'available' ? 'locked' : 'available';
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
    const r = await sbCall('admin-slots', { action: 'toggleSlot', slotId });
    if (!r.success) {
      if (r.error === 'cannot_toggle') {
        toast('חריץ זה לא ניתן לשינוי (מוזמן / נעול)', 'err'); return;
      }
      throw new Error(r.error || 'error');
    }
    const lbl = newStatus === 'locked' ? 'חסום ✅' : 'שוחרר ✅';
    toast('חריץ עודכן — ' + lbl, 'ok');
    await loadDiarySlots();
  } catch (e) {
    renderDiarySlots(S.diarySlots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
    toast('שגיאה בשינוי הסטטוס', 'err');
  }
}

async function deleteDiarySlot(slotId) {
  try {
    const r = await sbCall('admin-slots', { action: 'deleteSlot', slotId });
    if (!r.success) {
      if (r.error === 'cannot_delete_active') toast('לא ניתן למחוק חריץ תפוס', 'warn');
      else throw new Error(r.error);
      return;
    }
    S.diarySlots = S.diarySlots.filter(s => s.id !== slotId);
    renderDiarySlots(S.diarySlots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
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
    const r = await sbCall('admin-slots', { action: 'addSlot', date, time });
    if (!r.success) throw new Error(r.error);
    if (r.already_exists) {
      toast('חריץ בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
    } else {
      toast('החריץ נוסף בהצלחה ✓', 'ok');
      const fromVal = document.getElementById('js-diary-from') ? document.getElementById('js-diary-from').value : '';
      const toVal   = document.getElementById('js-diary-to')   ? document.getElementById('js-diary-to').value   : '';
      if (fromVal && toVal && date >= fromVal && date <= toVal) await loadDiarySlots();
    }
  } catch (e) {
    toast('שגיאה בהוספת החריץ', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ הוסף חריץ'; }
  }
}

async function loadClients(search) {
  S.clientSearch = search || '';
  const container = document.getElementById('js-clients-list');
  if (!container) return;
  container.innerHTML = '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';
  try {
    const r = await sbCall('admin-clients', { action: 'getClients', search: S.clientSearch });
    if (!r.success) throw new Error(r.error);
    S.clients = r.clients;
    renderClientList(r.clients, container, { onSelect: loadClientHistory });
  } catch (e) {
    toast('שגיאה בטעינת לקוחות', 'err');
    container.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

async function loadClientHistory(phone) {
  const listPanel    = document.getElementById('js-clients-list');
  const histPanel    = document.getElementById('js-client-history');
  const histList     = document.getElementById('js-history-list');
  if (listPanel) listPanel.classList.add('hidden');
  if (histPanel) histPanel.classList.remove('hidden');
  if (histList)  histList.innerHTML =
    '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';

  try {
    const r = await sbCall('admin-clients', { action: 'getClientHistory', clientPhone: phone });
    if (!r.success) throw new Error(r.error);
    S.clientHistory = r;
    const nameEl  = document.getElementById('js-history-name');
    const phoneEl = document.getElementById('js-history-phone');
    if (nameEl)  nameEl.textContent  = r.client.full_name || '(ללא שם)';
    if (phoneEl) phoneEl.textContent = fmtPhone(r.client.phone);
    renderClientHistory(r.appointments, histList, { onDecision: _processHistoryDecision });
  } catch (e) {
    toast('שגיאה בטעינת היסטוריה', 'err');
    if (histList) histList.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

async function _processHistoryDecision(bookingId, adminToken, decision) {
  const btns = document.querySelectorAll('[data-appt-id="' + bookingId + '"]');
  btns.forEach(b => { b.disabled = true; });

  try {
    const r = await fetch(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/change-status`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` }, body: JSON.stringify({ adminToken: S.token, bookingId, targetStatus: decision }) }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const sbData = await r.json();
    if (!sbData.success) {
      if (sbData.error === 'invalid_transition') toast('ההזמנה כבר טופלה', 'warn');
      else throw new Error(sbData.error);
      btns.forEach(b => { b.disabled = false; });
      return;
    }
    // GAS side-effects (SMS + Calendar) — fire-and-forget; log failures only
    apiCall('adminAction', { bookingId, token: adminToken, decision }).catch(e =>
      console.warn('[adminAction GAS side-effects failed]', e.message)
    );
    toast(decision === 'Approved' ? 'ההזמנה אושרה ✓' : 'ההזמנה נדחתה', 'ok');
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
    if (S.clientHistory && S.clientHistory.appointments) {
      const appt = S.clientHistory.appointments.find(a => a.id === bookingId);
      if (appt) appt.status = newStatus;
    }
  } catch (e) {
    btns.forEach(b => { b.disabled = false; });
    toast('שגיאה בעדכון הסטטוס', 'err');
  }
}


document.addEventListener('DOMContentLoaded', init);
