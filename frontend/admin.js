'use strict';

import APP_CONFIG from './config.js';

// ── Config ───────────────────────────────────────────────────────
const API      = APP_CONFIG.API_URL;
const LS_TOKEN = 'meital_admin_token';

// ── State ────────────────────────────────────────────────────────
const S = {
  token:    localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  filter:   'all',
};

// ── Display helpers ───────────────────────────────────────────────
const LABELS = { Pending:'ממתין', Approved:'מאושר', Rejected:'נדחה', Cancelled:'בוטל' };
const STATUS_CLS = {
  Pending:   'bg-amber-100 text-amber-700',
  Approved:  'bg-green-100 text-green-700',
  Rejected:  'bg-red-100 text-red-600',
  Cancelled: 'bg-gray-100 text-gray-400',
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

// ── Render ────────────────────────────────────────────────────────
function updateStats() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('stat-pending').textContent =
    S.bookings.filter(b => b.status === 'Pending').length;
  document.getElementById('stat-today').textContent =
    S.bookings.filter(b => b.date === today && ['Pending','Approved'].includes(b.status)).length;
  document.getElementById('stat-total').textContent = S.bookings.length;
}

// A booking is "stale" once its appointment time is more than 48h in the past.
function isStale(b) {
  if (!b.date) return false;
  const dt = new Date(b.date + 'T' + (b.time || '00:00') + ':00');
  if (isNaN(dt.getTime())) return false;
  return (Date.now() - dt.getTime()) > 48 * 60 * 60 * 1000;
}

function isFinished(b) {
  return b.status === 'Rejected' || b.status === 'Cancelled';
}

// Active views hide finished + stale bookings to cut visual clutter;
// the History tab is the full archive of everything they hide.
function visible() {
  if (S.filter === 'history')
    return S.bookings.filter(b => isFinished(b) || isStale(b));
  if (S.filter === 'all')
    return S.bookings.filter(b => !isFinished(b) && !isStale(b));
  return S.bookings.filter(b => b.status === S.filter && !isStale(b));
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
    <div>
      <div class="font-bold text-sm text-text-main">${esc(b.name)}</div>
      <div class="text-xs text-text-muted mt-0.5">${esc(fmtPhone(b.phone))}</div>
    </div>
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
const OK_MSG = { Approved:'ההזמנה אושרה ✅', Rejected:'ההזמנה נדחתה', Cancelled:'ההזמנה בוטלה' };
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
  S.filter = f;
  document.querySelectorAll('.filter-pill').forEach(btn => {
    const active = btn.dataset.filter === f;
    btn.className = [
      'filter-pill shrink-0 text-xs font-semibold px-4 py-2 rounded-xl transition-all',
      active
        ? 'bg-primary text-white shadow-sm'
        : 'bg-white text-text-muted border border-secondary/40 hover:border-primary hover:text-primary',
    ].join(' ');
  });
  render();
}

// ── Auto-refresh (60 s) ───────────────────────────────────────────
function startAutoRefresh() {
  setInterval(() => load(true), 60_000);
}

// ── Init ──────────────────────────────────────────────────────────
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
    setTimeout(() => { icon.style.animation = ''; }, 800);
  });

  document.querySelectorAll('.filter-pill').forEach(btn =>
    btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
  setFilter('all');

  if (S.token) {
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
  }

  startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
