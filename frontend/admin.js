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
};

// ── Display helpers ───────────────────────────────────────────────
const LABELS    = { Pending:'ממתין', Approved:'מאושר', Rejected:'נדחה', Cancelled:'בוטל' };
const STATUS_CLS = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-600',
  Cancelled: 'bg-gray-100 text-gray-400',
};
const SERVICE_NAME = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" };
const DAY_NAMES_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

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
  ['bookings','pulse','slots'].forEach(t => {
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
  return `
<div class="bg-white rounded-2xl p-4 border border-secondary/30 shadow-sm card-in" data-booking="${b.id}">
  <div class="flex items-start justify-between mb-1.5">
    <div><div class="font-bold text-sm text-text-main">${esc(b.name)}</div>
    <div class="text-xs text-text-muted mt-0.5">${esc(fmtPhone(b.phone))}</div></div>
    ${badge}
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
    } catch (_) {
      logout();
    }
  } else if (S.token) {
    logout();
  }

  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
