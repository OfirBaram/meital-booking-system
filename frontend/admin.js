'use strict';

import APP_CONFIG from './config.js';
import {
  esc, fmtPhone,
  LABELS, STATUS_CLS, SERVICE_NAME, DAY_NAMES_HE, SB_STATUS_LABEL, SB_STATUS_CLS,
  buildCard,
  renderDiarySlots, renderClientList, renderClientHistory, renderSmsLog, renderSlotInventory,
} from './admin-render.js';

const API         = APP_CONFIG.API_URL;
const LS_TOKEN    = 'meital_admin_token';
const LS_TS       = 'meital_admin_ts';
const SESSION_TTL = 24 * 60 * 60 * 1000;

const S = {
  token:          localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  filter:   'all',
  dateJump: '',
  tab:      'bookings',
  template: [],
  autoSms:  true,
  _smsSendTarget: null,
  diarySlots:        [],
  clients:           [],
  clientHistory:     null,
  clientSearch:      '',
  _clientSearchTimer: null,
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
    const data = await apiCall('listBookings', { token: S.token });
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

async function load(silent = false) {
  if (!sessionValid()) { logout(); return; }
  if (!silent) showSkeleton();
  try {
    const data = await apiCall('listBookings', { token: S.token });
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
  cards.innerHTML = rows.map(buildCard).join('');
  cards.classList.remove('hidden');
  cards.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));
}

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

async function loadSlotInventory() {
  const el = document.getElementById('js-diary-slots');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">טוען...</div>';
  try {
    const data = await apiCall('getSlotInventory');
    if (!data.success) throw new Error(data.error);
    renderSlotInventory(data.slots || [], el, { onToggle: toggleSlot });
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-4">שגיאה: ' + e.message + '</div>';
  }
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

async function loadSmsLog() {
  const el = document.getElementById('js-sms-log');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-4">טוען...</div>';
  try {
    const data = await apiCall('getSmsLog');
    if (!data.success) throw new Error(data.error);
    renderSmsLog(data.entries || [], el);
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-4">שגיאה: ' + e.message + '</div>';
  }
}

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

  document.getElementById('js-save-template').addEventListener('click', saveTemplate);
  document.getElementById('js-gen-submit').addEventListener('click', generateSlots);
  document.getElementById('js-block-submit').addEventListener('click', blockDates);
  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);
  document.getElementById('js-health-submit').addEventListener('click', runHealthCheck);

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

  if (S.token && sessionValid()) {
    try {
      const data = await apiCall('listBookings', { token: S.token });
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
    renderDiarySlots(r.slots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
  } catch (e) {
    toast('שגיאה בטעינת החריצים', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'טען חריצים'; }
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
    const r = await apiCall('adminToggleSlot', { slotId });
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
  if (!confirm('למחוק את החריץ הזה? הפעולה אינה הפיכה.')) return;
  try {
    const r = await apiCall('adminDeleteSlot', { slotId });
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
    const r = await apiCall('adminAddSlot', { date, time });
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
    const r = await apiCall('adminGetClients', { search: S.clientSearch });
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
    const r = await apiCall('adminGetClientHistory', { clientPhone: phone });
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
    const r = await apiCall('adminAction', { bookingId, token: adminToken, decision });
    if (!r.success) {
      if (r.error === 'already_processed') toast('ההזמנה כבר טופלה', 'warn');
      else throw new Error(r.error);
      btns.forEach(b => { b.disabled = false; });
      return;
    }
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
