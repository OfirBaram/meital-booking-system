'use strict';

import APP_CONFIG from './config.js';

// ── Config ───────────────────────────────────────────────────────
const API         = APP_CONFIG.API_URL;
const LS_TOKEN    = 'meital_admin_token';
const LS_TS       = 'meital_admin_ts';
const SESSION_TTL = 24 * 60 * 60 * 1000;

// ── State ────────────────────────────────────────────────────────
const S = {
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
};

// ── Display helpers ───────────────────────────────────────────────
const LABELS    = {
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
};

function esc(s) {
  return String(s || '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fmtPhone(p) {
  const local = String(p || '').replace('+972', '0');
  return local.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
}

// ── API ───────────────────────────────────────────────────────────
async function apiCall(action, extra = {}) {
  const r = await fetch(API, {
    method:  'POST',
    body:    JSON.stringify({ action, token: S.token, ...extra }),
    headers: { 'Content-Type': 'text/plain' },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ── Toast ─────────────────────────────────────────────────────────
let _toastTmr;
function toast(msg, type = '') {
  const wrap  = document.getElementById('js-toast');
  const inner = wrap.querySelector('div');
  clearTimeout(_toastTmr);
  inner.textContent = msg;
  inner.className = [
    'text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl whitespace-nowrap',
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

// ── Auth ──────────────────────────────────────────────────────────
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
    const data = await apiCall('listBookings');
    if (!data.success) throw new Error(data.error || 'auth');
    localStorage.setItem(LS_TOKEN, token);
    localStorage.setItem(LS_TS, String(Date.now()));
    S.bookings = data.bookings || [];
    showDash();
    hideSkeleton();
    render();
    updateStats();
  } catch (_) {
    S.token = '';
    err.classList.remove('hidden');
    inp.focus();
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'כניסה';
  }
}

// ── Load ──────────────────────────────────────────────────────────
async function load(silent = false) {
  if (!sessionValid()) { logout(); return; }
  if (!silent) showSkeleton();
  try {
    const data = await apiCall('listBookings');
    if (!data.success) {
      if (data.error === 'unauthorized' || data.code === 403) { logout(); return; }
      throw new Error(data.error || 'error');
    }
    S.bookings = data.bookings || [];
    render();
    updateStats();
    if (S.tab === 'pulse') renderPulse();
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

// ── Tab navigation ────────────────────────────────────────────────
function setTab(tab) {
  S.tab = tab;
  ['bookings','pulse','slots','diary','clients'].forEach(t => {
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
}

// ── Render — Bookings tab ─────────────────────────────────────────
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

  // Date-jump filter (Daily Planner)
  if (S.dateJump) {
    rows = rows.filter(b => b.date === S.dateJump);
    return rows; // show all statuses for the chosen date
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
  cards.innerHTML = rows.map(buildCard).join('');
  cards.classList.remove('hidden');
  cards.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));
}

function buildCard(b) {
  const badge = `<span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_CLS[b.status] || 'bg-gray-100 text-gray-500'}">${LABELS[b.status] || b.status}</span>`;
  const date  = (b.date || '').replace(/-/g, '/');
  let btns = '';
  if (b.status === 'Pending') {
    btns = `
      <button data-action="Approved"  data-id="${b.id}" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">✅ אשר</button>
      <button data-action="Rejected"  data-id="${b.id}" class="flex-1 bg-red-400  hover:bg-red-500  text-white text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">❌ דחה</button>`;
  } else if (b.status === 'Approved') {
    btns = `
      <button data-action="Cancelled" data-id="${b.id}" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-bold py-2 rounded-xl active:scale-[0.97] transition-all flex items-center justify-center gap-1">🚫 בטל</button>`;
  }
  const smsBtn = `<button data-action="sms" data-id="${b.id}" data-phone="${esc(b.phone)}" data-name="${esc(b.name)}"
    title="\u05e9\u05dc\u05d7 SMS \u05d9\u05d3\u05e0\u05d9" data-qa="btn-send-sms"
    class="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-cream active:scale-95 transition-all">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
  </button>`;
  return `
<div class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in" data-booking="${b.id}">
  <div class="flex items-start justify-between mb-1.5">
    <div><div class="font-bold text-sm text-text-main">${esc(b.name)}</div>
    <div class="text-xs text-text-muted mt-0.5">${esc(fmtPhone(b.phone))}</div></div>
    <div class="flex items-center gap-1">${badge}${smsBtn}</div>
  </div>
  <div class="text-xs font-medium text-text-main mb-0.5">${esc(b.serviceName)}</div>
  <div class="text-xs text-text-muted mb-3">📅 ${date} &nbsp;·&nbsp; 🕐 ${esc(b.time)}</div>
  ${btns ? `<div class="flex gap-2">${btns}</div>` : ''}
</div>`;
}

// ── Action handler ────────────────────────────────────────────────
const CONFIRM_MSG = {
  Approved: 'לאשר את ההזמנה?',
  Rejected: 'לדחות את ההזמנה?',
  Cancelled: 'לבטל את ההזמנה?\nהאירוע ביומן Google יימחק.',
};
const OK_MSG    = { Approved:'ההזמנה אושרה ✅', Rejected:'ההזמנה נדחתה', Cancelled:'ההזמנה בוטלה' };
const BTN_LABEL = { Approved:'✅ אשר', Rejected:'❌ דחה', Cancelled:'🚫 בטל' };

async function onAction(e) {
  const btn    = e.currentTarget;
  const id     = btn.dataset.id;
  const target = btn.dataset.action;
  if (target === 'sms') {
    openSmsModal({ id, phone: btn.dataset.phone, name: btn.dataset.name });
    return;
  }
  if (!confirm(CONFIRM_MSG[target] || 'להמשיך?')) return;

  const card = btn.closest('[data-booking]');
  card.querySelectorAll('button').forEach(b => { b.disabled = true; });
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span>';

  try {
    const data = await apiCall('changeStatus', { bookingId: id, targetStatus: target });
    if (!data.success) throw new Error(data.error || 'error');
    toast(OK_MSG[target] || 'עודכן', 'ok');
    await load(true);
  } catch (err) {
    toast('שגיאה: ' + err.message, 'err');
    card.querySelectorAll('button').forEach(b => { b.disabled = false; });
    btn.textContent = BTN_LABEL[target] || target;
  }
}

// ── Filter pills ──────────────────────────────────────────────────
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

// ── Business Pulse ────────────────────────────────────────────────
function renderPulse() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);

  // ISO week start (Sunday)
  const dow       = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekKey   = weekStart.toISOString().slice(0, 10);

  // Month boundaries
  const monthKey  = today.slice(0, 7); // YYYY-MM

  // 7-day window
  const in7Days   = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const weekCount     = S.bookings.filter(b => b.date >= weekKey && b.date <= today && b.status !== 'Rejected' && b.status !== 'Cancelled').length;
  const monthCount    = S.bookings.filter(b => b.date && b.date.startsWith(monthKey) && b.status !== 'Rejected' && b.status !== 'Cancelled').length;
  const upcomingCount = S.bookings.filter(b => b.date > today && b.date <= in7Days && ['Pending','Approved'].includes(b.status)).length;
  const cancelCount   = S.bookings.filter(b => b.status === 'Rejected' || b.status === 'Cancelled').length;

  document.getElementById('pulse-week').textContent      = weekCount;
  document.getElementById('pulse-month').textContent     = monthCount;
  document.getElementById('pulse-upcoming').textContent  = upcomingCount;
  document.getElementById('pulse-cancelled').textContent = cancelCount;

  // Service breakdown
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

  // Upcoming list
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

// ── Slot Manager — Template ───────────────────────────────────────
async function loadTemplate() {
  document.getElementById('js-template-skeleton').classList.remove('hidden');
  document.getElementById('js-template-rows').classList.add('hidden');
  document.getElementById('js-save-template').disabled = true;
  loadSystemInfo();
  try {
    const data = await apiCall('getTemplate');
    if (!data.success) throw new Error(data.error);
    S.template = data.template || [];
    renderTemplate();
  } catch (e) {
    toast('שגיאה בטעינת התבנית', 'err');
  } finally {
    document.getElementById('js-template-skeleton').classList.add('hidden');
    document.getElementById('js-template-rows').classList.remove('hidden');
    document.getElementById('js-save-template').disabled = false;
  }
}

function renderTemplate() {
  const container = document.getElementById('js-template-rows');
  // Only show Sun-Thu (0-4) by default; Fri/Sat shown but pre-disabled
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

  // Toggle times input when checkbox changes
  container.querySelectorAll('.tmpl-active').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx   = parseInt(cb.dataset.tmplIdx, 10);
      const input = container.querySelector('[data-tmpl-times="' + idx + '"]');
      input.disabled = !cb.checked;
      input.classList.toggle('opacity-40', !cb.checked);
    });
  });
}

async function saveTemplate() {
  const container = document.getElementById('js-template-rows');
  const payload   = S.template.map((row, i) => {
    const cb    = container.querySelector('[data-tmpl-idx="' + i + '"]');
    const input = container.querySelector('[data-tmpl-times="' + i + '"]');
    const active = cb ? cb.checked : row.active;
    const rawTimes = input ? input.value : '';
    const startTimes = rawTimes.split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));
    return { dayOfWeek: row.dayOfWeek, startTimes, active };
  });

  const btn = document.getElementById('js-save-template');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span>';
  try {
    const data = await apiCall('saveTemplate', { template: payload });
    if (!data.success) throw new Error(data.error);
    toast('תבנית נשמרה ✅', 'ok');
    S.template = payload.map((e, i) => ({ ...S.template[i], ...e }));
  } catch (e) {
    toast('שגיאה בשמירת התבנית', 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'שמור';
  }
}

// ── Slot Manager — Generate & Block ──────────────────────────────
async function generateSlots() {
  const startDate = document.getElementById('js-gen-start').value;
  const endDate   = document.getElementById('js-gen-end').value;
  if (!startDate || !endDate) { toast('יש לבחור תאריך התחלה וסיום', 'err'); return; }
  if (endDate < startDate)    { toast('תאריך הסיום חייב להיות אחרי ההתחלה', 'err'); return; }

  const btn = document.getElementById('js-gen-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> יוצר...';
  try {
    const data = await apiCall('generateSlots', { startDate, endDate });
    if (!data.success) throw new Error(data.error);
    toast('נוצרו ' + data.added + ' חריצים חדשים ✅', 'ok');
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'צור חריצים';
  }
}

async function blockDates() {
  const startDate = document.getElementById('js-block-start').value;
  const endDate   = document.getElementById('js-block-end').value;
  if (!startDate || !endDate) { toast('יש לבחור תאריך התחלה וסיום', 'err'); return; }
  if (endDate < startDate)    { toast('תאריך הסיום חייב להיות אחרי ההתחלה', 'err'); return; }

  const range = startDate === endDate ? startDate.replace(/-/g, '/') : startDate.replace(/-/g,'/') + ' – ' + endDate.replace(/-/g,'/');
  if (!confirm('לחסום את כל החריצים הפנויים בין ' + range + '?')) return;

  const btn = document.getElementById('js-block-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> חוסם...';
  try {
    const data = await apiCall('blockDates', { startDate, endDate });
    if (!data.success) throw new Error(data.error);
    toast('נחסמו ' + data.blocked + ' חריצים ✅', 'ok');
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'חסום תאריכים';
  }
}

// ── Reminders ─────────────────────────────────────────────────────
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

// ── Manual SMS modal ─────────────────────────────────────────────────────
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

// ── Auto-SMS master toggle ──────────────────────────────────────────────
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

// ── Slot inventory ──────────────────────────────────────────────────────────────
async function loadSlotInventory() {
  const el = document.getElementById('js-diary-slots');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">טוען...</div>';
  try {
    const data = await apiCall('getSlotInventory');
    if (!data.success) throw new Error(data.error);
    renderSlotInventory(data.slots || []);
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-4">שגיאה: ' + e.message + '</div>';
  }
}

function renderSlotInventory(slots) {
  const el = document.getElementById('js-diary-slots');
  if (!slots.length) {
    el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">אין חריצים בתקופה הנבחרת</div>';
    return;
  }
  const byDate = {};
  slots.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
  el.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a < b ? -1 : 1)
    .map(([date, daySlots]) => {
      const label = date.replace(/-/g, '/');
      const rows = daySlots.map(s => {
        const isAvail   = s.status === 'Available';
        const isBlock   = s.status === 'Blocked';
        const canToggle = isAvail || isBlock;
        const hl        = s.recentlyCancelled ? ' ring-2 ring-amber-300 rounded-xl px-1' : '';
        const stCls     = isAvail ? 'text-green-600 bg-green-50' : isBlock ? 'text-gray-400 bg-gray-50' : 'text-text-muted bg-secondary/20';
        const stLabel   = isAvail ? 'פנוי' : isBlock ? 'חסום' : esc(s.status);
        const btnLabel  = isAvail ? 'חסום' : 'שחרר';
        const btnCls    = isAvail ? 'bg-red-100 text-red-500 hover:bg-red-200' : 'bg-green-100 text-green-600 hover:bg-green-200';
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
  el.querySelectorAll('[data-action="toggle-slot"]').forEach(btn =>
    btn.addEventListener('click', () => toggleSlot(btn.dataset.date, btn.dataset.time)));
}

async function toggleSlot(date, time) {
  try {
    const data = await apiCall('toggleSlotStatus', { date, time });
    if (!data.success) {
      if (data.error === 'cannot_toggle') {
        toast('חריץ זה לא ניתן לשינוי (מוזמן / נעול)', 'err'); return;
      }
      throw new Error(data.error || 'error');
    }
    const lbl = data.newStatus === 'Available' ? 'שוחרר ✅' : 'חסום ✅';
    toast(date.replace(/-/g, '/') + ' ' + time + ' — ' + lbl, 'ok');
    await loadSlotInventory();
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  }
}

// ── SMS communication log ────────────────────────────────────────────────
async function loadSmsLog() {
  const el = document.getElementById('js-sms-log');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">טוען...</div>';
  try {
    const data = await apiCall('getSmsLog');
    if (!data.success) throw new Error(data.error);
    renderSmsLog(data.entries || []);
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-4">שגיאה: ' + e.message + '</div>';
  }
}

function renderSmsLog(entries) {
  const el = document.getElementById('js-sms-log');
  if (!entries.length) {
    el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">אין רשומות</div>';
    return;
  }
  el.innerHTML = entries.map(e => {
    const icon = e.status === 'SENT' ? '✅' : e.status === 'MOCK' ? '🧪' : e.status === 'SKIPPED' ? '⏭️' : '❌';
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

// ── Auto-refresh (60 s) ───────────────────────────────────────────

async function runHealthCheck() {
  const btn  = document.getElementById('js-health-submit');
  const list = document.getElementById('health-checks');
  const icon = document.getElementById('health-overall');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> בודק...';
  list.innerHTML = '<p class="text-text-muted text-xs">בודק...</p>';
  icon.textContent = '';
  try {
    const data = await apiCall('healthCheck');
    if (!data.success) throw new Error(data.error);
    const EMOJI = { ok: '\u2705', warn: '\u26A0\uFE0F', error: '\u274C' };
    icon.textContent = EMOJI[data.overall] || '';
    list.innerHTML = (data.checks || []).map(c =>
      '<div class="flex items-start gap-2">'
      + '<span class="shrink-0">' + (EMOJI[c.status] || '?') + '</span>'
      + '<span class="text-text-muted">' + c.label
      + (c.detail ? ' <span class="text-text-body">— ' + c.detail + '</span>' : '')
      + '</span></div>'
    ).join('');
  } catch (e) {
    icon.textContent = '\u274C';
    list.innerHTML = '<p class="text-red-500 text-xs">' + e.message + '</p>';
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'בדוק עכשיו';
  }
}

function startAutoRefresh() {
  setInterval(() => load(true), 60_000);
}

// ── Init ──────────────────────────────────────────────────────────
async function init() {
  // Auth listeners
  document.getElementById('js-login-btn').addEventListener('click', login);
  document.getElementById('js-token-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
  document.getElementById('js-logout-btn').addEventListener('click', logout);

  // Refresh
  document.getElementById('js-refresh-btn').addEventListener('click', async () => {
    const icon = document.getElementById('js-refresh-icon');
    icon.style.animation = 'spin 0.6s linear infinite';
    await load();
    if (S.tab === 'slots') loadTemplate();
    setTimeout(() => { icon.style.animation = ''; }, 800);
  });

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(btn =>
    btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
  setFilter('all');

  // Daily planner date jump
  document.getElementById('js-date-jump').addEventListener('change', e => {
    S.dateJump = e.target.value;
    render();
  });
  document.getElementById('js-date-clear').addEventListener('click', () => {
    S.dateJump = '';
    document.getElementById('js-date-jump').value = '';
    render();
  });

  // Bottom nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  // Slot manager
  document.getElementById('js-save-template').addEventListener('click', saveTemplate);
  document.getElementById('js-gen-submit').addEventListener('click', generateSlots);
  document.getElementById('js-block-submit').addEventListener('click', blockDates);
  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);
  document.getElementById('js-health-submit').addEventListener('click', runHealthCheck);

  // Auto-SMS toggle
  document.getElementById('js-auto-sms-btn').addEventListener('click', toggleAutoSms);

  // SMS modal
  document.getElementById('js-sms-close').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-cancel').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-backdrop').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-send').addEventListener('click', sendManualSMS);

  // Diary tab — slot manager
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
  });

  // Session restore
  if (S.token && sessionValid()) {
    try {
      const data = await apiCall('listBookings');
      if (!data.success) throw new Error(data.error);
      S.bookings = data.bookings || [];
      showDash();
      hideSkeleton();
      render();
      updateStats();
      loadAutoSmsToggle();
    } catch (_) {
      logout();
    }
  } else if (S.token) {
    logout();
  }

  startAutoRefresh();
}


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
            '<button data-action-btn onclick="toggleDiarySlot(' + s.id + ',\'' + s.status + ')" ' +
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
      "toggleDiarySlot(" + slotId + ",'" + r.newStatus + "')");
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
    if (r.already_exists) {
      toast('חריץ בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
    } else {
      toast('החריץ נוסף בהצלחה ✓', 'ok');
      // Reload if the new slot falls within the current view range
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
           'onclick="loadClientHistory('' + esc(c.phone) + '')">' +
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

document.addEventListener('DOMContentLoaded', init);
