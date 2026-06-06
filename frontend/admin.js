'use strict';

import APP_CONFIG from './config.js';
import {
  esc, fmtPhone,
  LABELS, STATUS_CLS, SERVICE_NAME, DAY_NAMES_HE, SB_STATUS_LABEL, SB_STATUS_CLS,
  SMS_CONTEXT_LABEL,
  buildCard, buildSwipeCard,
  renderDiarySlots, renderClientList, renderClientHistory, renderSmsLog,
} from './admin-render.js';
import { buildCalData, renderCalendar, formatCalTitle, calDayStatus } from './admin-calendar.js';
import { initSheet, openSheet, closeSheet, isSheetOpen } from './admin-sheet.js';
import { initCardSwipe } from './admin-gestures.js';
import { animate, spring, stagger } from './lib/motion.js';

const API         = APP_CONFIG.API_URL;
const LS_TOKEN    = 'meital_admin_token';
const LS_TS       = 'meital_admin_ts';
const LS_HIDDEN   = 'meital_admin_hidden';
const LS_REMINDER = 'meital_reminder_cfg';
const SESSION_TTL = 24 * 60 * 60 * 1000;

// Soft-deleted booking IDs — hidden from every admin view (frontend-only).
function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(LS_HIDDEN) || '[]')); }
  catch { return new Set(); }
}
function persistHidden() {
  try { localStorage.setItem(LS_HIDDEN, JSON.stringify([...S.hidden])); } catch (_) {}
}

/**
 * @typedef {{
 *   token: string,
 *   bookings: Booking[],
 *   hidden: Set<string>,
 *   filter: 'all'|'pending'|'approved'|'rejected'|'cancelled',
 *   bookSearch: string,
 *   clientSort: string,
 *   clientFilter: string,
 *   dateJump: string,
 *   tab: string,
 *   autoBlock: { enabled: boolean, time: number },
 *   autoSms: boolean,
 *   _smsSendTarget: string|null,
 *   smsEntries: object[],
 *   smsFilter: object,
 *   diarySlots: Slot[],
 *   clients: object[],
 *   clientHistory: object|null,
 *   clientSearch: string,
 *   _clientSearchTimer: number|null,
 *   calData: Record<string, CalEntry>,
 *   calMonth: Date,
 *   slotCache: Record<string, Slot[]>
 * }} AdminState
 */

/** @type {AdminState} */
const S = {
  token:          localStorage.getItem(LS_TOKEN) || '',
  bookings: [],
  hidden:   loadHidden(),
  filter:   'all',
  bookSearch: '',
  clientSort: 'recent',
  clientFilter: 'all',
  dateJump: '',
  tab:      'calendar',
  autoBlock: { enabled: true, time: 20 },
  reminder:  { enabled: false, hour: 20 },
  autoSms:  true,
  _smsSendTarget: null,
  smsEntries:        [],
  smsFilter:         { status: 'all', context: 'all', range: 'all', day: '', search: '' },
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
  ['calendar','bookings','pulse','diary','clients'].forEach(t => {
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
    animate(_tabEl, { opacity: [0, 1], y: [4, 0] },
      { type: spring, stiffness: 350, damping: 28 });
  }

  if (tab === 'calendar') loadAndRenderCalendar();
  if (tab === 'diary')    { loadSmsLog(); loadTwilioStats(); }
  if (tab === 'clients') {
    if (S.clients.length === 0) loadClients('');
    loadReminderConfig();
    updateReminderPreview();
    loadAutoBlockConfig();
  }
}

function updateStats() {
  const today = new Date().toISOString().slice(0, 10);
  const rows  = liveBookings();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pending = rows.filter(b => b.status === 'Pending').length;
  set('stat-pending',  pending);
  set('stat-today',    rows.filter(b => b.date === today && ['Pending','Approved'].includes(b.status)).length);
  set('stat-approved', rows.filter(b => b.date >= today && b.status === 'Approved').length);
  set('stat-total',    rows.length);

  // Live header greeting subtitle
  const sub = document.getElementById('js-header-sub');
  if (sub) sub.textContent = pending
    ? (pending + (pending === 1 ? ' ממתינה לאישור' : ' ממתינות לאישור'))
    : 'הכול מעודכן ✓';
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

// All bookings that are not soft-deleted — the single source for every view.
function liveBookings() {
  return S.bookings.filter(b => !S.hidden.has(b.id));
}

// Free-text match over name + phone for the in-tab booking search box.
function matchSearch(b) {
  const q = S.bookSearch.trim().toLowerCase();
  if (!q) return true;
  if (String(b.name || '').toLowerCase().includes(q)) return true;
  const qDigits = q.replace(/\D/g, '');
  if (qDigits) {
    const phone = String(b.phone || '').replace(/\D/g, '');
    if (phone.includes(qDigits)) return true;
  }
  return false;
}

function visible() {
  let rows = liveBookings().filter(matchSearch);

  if (S.dateJump) {
    return rows.filter(b => b.date === S.dateJump);
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
  const _wrappers = cards.querySelectorAll('.swipe-wrapper');
  if (_wrappers.length) {
    animate(_wrappers, { opacity: [0, 1], y: [8, 0] },
      { delay: stagger(0.04), type: spring, stiffness: 400, damping: 30 });
  }
}

async function onAction(e) {
  const btn    = e.currentTarget;
  const id     = btn.dataset.id;
  const target = btn.dataset.action;
  if (target === 'sms') {
    openSmsModal({ id, phone: btn.dataset.phone, name: btn.dataset.name });
    return;
  }
  if (target === 'delete') {
    await deleteBooking(id);
    return;
  }
  await _commitCardAction(id, target);
}

// Format YYYY-MM-DD → DD/MM/YYYY for Hebrew SMS templates.
function _isoToHe(d) {
  const [y, m, day] = (d || '').split('-');
  return day && m && y ? day + '/' + m + '/' + y : (d || '');
}

// Build the default cancellation/rejection SMS body for the confirmation modal.
function _buildCancelSmsText(booking, target) {
  const when = _isoToHe(booking.date) + ' בשעה ' + (booking.time || '');
  const svc  = booking.serviceName || '';
  if (target === 'Rejected') {
    return '❌ לצערנו, הבקשה לתור ב' + when + ' לא אושרה.\nאפשר לתאם מועד חלופי דרך האפליקציה.';
  }
  return '❌ התור שלך ב' + when + ' בוטל.\nשירות: ' + svc + '\n\nניתן לתאם תור חדש דרך האפליקציה.';
}

// Show the cancel/reject confirmation dialog.
// Resolves with { suppressSms, customSmsBody, keepCalendar } on confirm, or null on abort.
function showCancelModal(booking, target) {
  return new Promise(resolve => {
    const modal      = document.getElementById('js-cancel-modal');
    const titleEl    = document.getElementById('js-cancel-title');
    const smsToggle  = document.getElementById('js-cancel-sms-toggle');
    const smsBodyEl  = document.getElementById('js-cancel-sms-body');
    const smsText    = document.getElementById('js-cancel-sms-text');
    const calSection = document.getElementById('js-cancel-cal-section');
    const calYes     = document.getElementById('js-cancel-cal-yes');
    const calNo      = document.getElementById('js-cancel-cal-no');
    const confirmBtn = document.getElementById('js-cancel-confirm');
    const abortBtn   = document.getElementById('js-cancel-abort');
    const closeBtn   = document.getElementById('js-cancel-close');
    const backdrop   = document.getElementById('js-cancel-backdrop');

    titleEl.textContent = target === 'Cancelled' ? 'ביטול הזמנה' : 'דחיית הזמנה';
    smsText.value = _buildCancelSmsText(booking, target);
    smsToggle.checked = true;
    smsBodyEl.classList.remove('hidden');

    // Calendar option only matters when there is a real calendar event (Approved → Cancelled).
    const hasCalEvent = booking && booking.status === 'Approved';
    calSection.classList.toggle('hidden', !hasCalEvent);

    let calChoice = 'no';
    function _setCalBtn(val) {
      calChoice = val;
      const SEL = 'flex-1 border-2 border-primary bg-primary/10 text-primary font-bold py-2 rounded-xl text-sm transition-all';
      const OFF = 'flex-1 border-2 border-secondary/40 text-text-muted font-semibold py-2 rounded-xl text-sm transition-all';
      calYes.className = val === 'yes' ? SEL : OFF;
      calNo.className  = val === 'no'  ? SEL : OFF;
    }
    _setCalBtn('no');

    modal.classList.remove('hidden');

    function cleanup() {
      modal.classList.add('hidden');
      smsToggle.removeEventListener('change', onToggle);
      calYes.removeEventListener('click', onCalYes);
      calNo.removeEventListener('click', onCalNo);
      confirmBtn.removeEventListener('click', onConfirm);
      abortBtn.removeEventListener('click', onAbort);
      closeBtn.removeEventListener('click', onAbort);
      backdrop.removeEventListener('click', onAbort);
    }
    function onToggle()  { smsBodyEl.classList.toggle('hidden', !smsToggle.checked); }
    function onCalYes()  { _setCalBtn('yes'); }
    function onCalNo()   { _setCalBtn('no'); }
    function onConfirm() {
      cleanup();
      resolve({
        suppressSms:    !smsToggle.checked,
        customSmsBody:  smsToggle.checked ? smsText.value.trim() : null,
        keepCalendar:   calChoice === 'yes',
      });
    }
    function onAbort()   { cleanup(); resolve(null); }

    smsToggle.addEventListener('change', onToggle);
    calYes.addEventListener('click', onCalYes);
    calNo.addEventListener('click', onCalNo);
    confirmBtn.addEventListener('click', onConfirm);
    abortBtn.addEventListener('click', onAbort);
    closeBtn.addEventListener('click', onAbort);
    backdrop.addEventListener('click', onAbort);
  });
}

// Soft-delete: hide the booking from every admin view (persisted locally). If it
// is still live (Pending/Approved) it is also Cancelled server-side so the slot
// frees. Reversible for 5s via the undo toast.
async function deleteBooking(id) {
  const booking = S.bookings.find(b => b.id === id);
  if (!booking) return;
  const wasActive = booking.status === 'Pending' || booking.status === 'Approved';

  let _cancelOpts = null;
  if (wasActive) {
    _cancelOpts = await showCancelModal(booking, 'Cancelled');
    if (_cancelOpts === null) return;
  }

  S.hidden.add(id);
  render();
  updateStats();
  renderVisibleCalendar();
  if (S.tab === 'pulse') renderPulse();

  toastUndo(
    'ההזמנה נמחקה',
    async () => {
      persistHidden();
      if (!wasActive) return;
      try {
        const r = await fetch(
          APP_CONFIG.SUPABASE_URL + '/functions/v1/change-status',
          { method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + APP_CONFIG.SUPABASE_ANON_KEY },
            body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: 'Cancelled',
              suppressSms: _cancelOpts ? _cancelOpts.suppressSms : false,
              customSmsBody: _cancelOpts ? _cancelOpts.customSmsBody : null }) }
        );
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!data.success && data.error !== 'invalid_transition') throw new Error(data.error || 'error');
        apiCall('changeStatus', { bookingId: id, targetStatus: 'Cancelled',
          keepCalendar: _cancelOpts ? _cancelOpts.keepCalendar : false }).catch(e =>
          console.warn('[deleteBooking GAS side-effects failed]', e.message));
        await load(true);            // refresh; the now-Cancelled row stays hidden
        persistHidden();
      } catch (e) {
        console.warn('[deleteBooking cancel failed]', e.message);
      }
    },
    () => {
      S.hidden.delete(id);
      render();
      updateStats();
      renderVisibleCalendar();
      if (S.tab === 'pulse') renderPulse();
    }
  );
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

const SERVICE_DURATION = { gel_classic: 90, gel_feet: 120 };
function bookingDuration(b) {
  return b.duration_min || b.duration || SERVICE_DURATION[b.service] || 90;
}

// Up/down delta badge vs a previous period.
function _setDelta(id, cur, prev) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!prev && !cur) { el.textContent = ''; return; }
  const diff = cur - prev;
  if (diff === 0) { el.textContent = '—'; el.className = 'text-xs font-bold text-text-muted'; return; }
  const up  = diff > 0;
  const pct = prev ? Math.round(Math.abs(diff) / prev * 100) : 100;
  el.textContent = (up ? '▲' : '▼') + ' ' + pct + '%';
  el.className = 'text-xs font-bold ' + (up ? 'text-green-600' : 'text-red-400');
}

const PULSE_STATUS = {
  Pending:   { label: 'ממתינות', color: '#E8972E' },
  Approved:  { label: 'מאושרות', color: '#2E9E54' },
  Rejected:  { label: 'נדחו',    color: '#EF6B6B' },
  Cancelled: { label: 'בוטלו',   color: '#B8AEB4' },
};

function renderStatusMix(counts) {
  const bar = document.getElementById('pulse-statusmix-bar');
  const leg = document.getElementById('pulse-statusmix-legend');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (bar) {
    bar.innerHTML = total === 0 ? ''
      : Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) =>
          '<div style="width:' + (n / total * 100) + '%;background:' + PULSE_STATUS[k].color + '" title="' + PULSE_STATUS[k].label + ': ' + n + '"></div>'
        ).join('');
  }
  if (leg) {
    leg.innerHTML = Object.entries(counts).map(([k, n]) =>
      '<div class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full inline-block shrink-0" style="background:' + PULSE_STATUS[k].color + '"></i>'
      + '<span class="text-text-muted">' + PULSE_STATUS[k].label + '</span>'
      + '<span class="text-text-main font-bold mr-auto">' + n + '</span></div>'
    ).join('');
  }
}

function renderPulseTrend(all, weekStart) {
  const el = document.getElementById('pulse-trend');
  if (!el) return;
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(weekStart); ws.setDate(weekStart.getDate() - i * 7);
    const we = new Date(ws);        we.setDate(ws.getDate() + 6);
    const a = ws.toISOString().slice(0, 10);
    const b = we.toISOString().slice(0, 10);
    const count = all.filter(x => x.status !== 'Rejected' && x.status !== 'Cancelled' && x.date >= a && x.date <= b).length;
    weeks.push({ label: ws.getDate() + '/' + (ws.getMonth() + 1), count });
  }
  const max = Math.max(1, ...weeks.map(w => w.count));
  el.innerHTML = weeks.map((w, i) => {
    const h = Math.max(4, Math.round(w.count / max * 100));
    const isLast = i === weeks.length - 1;
    return '<div class="flex-1 flex flex-col items-center justify-end gap-1 h-full" title="' + w.label + ': ' + w.count + '">'
      + '<span class="text-[9px] font-bold ' + (w.count ? 'text-primary' : 'text-text-muted') + '">' + w.count + '</span>'
      + '<div class="w-full rounded-t-md ' + (isLast ? 'bg-primary' : 'bg-primary/50') + '" style="height:' + h + '%"></div>'
      + '<span class="text-[8px] text-text-muted">' + w.label + '</span>'
      + '</div>';
  }).join('');
}

function renderPulse() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10);
  const all   = liveBookings();
  const isActive = b => b.status !== 'Rejected' && b.status !== 'Cancelled';

  const dow       = now.getDay();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - dow);
  const weekKey   = weekStart.toISOString().slice(0, 10);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(weekStart.getDate() - 7);
  const lastWeekKey   = lastWeekStart.toISOString().slice(0, 10);
  const monthKey      = today.slice(0, 7);
  const lastMonthKey  = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const in7Days       = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const weekCount      = all.filter(b => isActive(b) && b.date >= weekKey && b.date <= today).length;
  const lastWeekCount  = all.filter(b => isActive(b) && b.date >= lastWeekKey && b.date < weekKey).length;
  const monthCount     = all.filter(b => isActive(b) && b.date && b.date.startsWith(monthKey)).length;
  const lastMonthCount = all.filter(b => isActive(b) && b.date && b.date.startsWith(lastMonthKey)).length;
  const upcomingCount  = all.filter(b => b.date > today && b.date <= in7Days && ['Pending','Approved'].includes(b.status)).length;

  const pending   = all.filter(b => b.status === 'Pending').length;
  const approved  = all.filter(b => b.status === 'Approved').length;
  const rejected  = all.filter(b => b.status === 'Rejected').length;
  const cancelled = all.filter(b => b.status === 'Cancelled').length;
  const cancelCount = rejected + cancelled;
  const decided     = approved + rejected;
  const approvalPct = decided ? Math.round(approved / decided * 100) : 0;

  const monthMinutes = all.filter(b => isActive(b) && b.date && b.date.startsWith(monthKey))
    .reduce((sum, b) => sum + bookingDuration(b), 0);
  const monthHours = Math.round(monthMinutes / 60 * 10) / 10;

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('pulse-week',      weekCount);
  setTxt('pulse-month',     monthCount);
  setTxt('pulse-upcoming',  upcomingCount);
  setTxt('pulse-approval',  approvalPct + '%');
  setTxt('pulse-hours',     monthHours);
  setTxt('pulse-cancelled', cancelCount);
  _setDelta('pulse-week-delta',  weekCount,  lastWeekCount);
  _setDelta('pulse-month-delta', monthCount, lastMonthCount);

  // Busiest day + hour (active bookings only)
  const dowCount  = [0, 0, 0, 0, 0, 0, 0];
  const hourCount = {};
  all.forEach(b => {
    if (!isActive(b) || !b.date) return;
    const d = new Date(b.date + 'T12:00:00');
    if (!isNaN(d.getTime())) dowCount[d.getDay()]++;
    if (b.time) { const h = String(b.time).slice(0, 2); hourCount[h] = (hourCount[h] || 0) + 1; }
  });
  const maxDow = Math.max(...dowCount);
  setTxt('pulse-busiest', maxDow > 0 ? ('יום ' + DAY_NAMES_HE[dowCount.indexOf(maxDow)]) : '—');
  const topHour = Object.entries(hourCount).sort((a, b) => b[1] - a[1])[0];
  setTxt('pulse-busiest-hour', topHour ? (topHour[0] + ':00') : '—');

  renderPulseTrend(all, weekStart);
  renderStatusMix({ Pending: pending, Approved: approved, Rejected: rejected, Cancelled: cancelled });

  // New vs returning clients (by active-booking count per phone)
  const visits = {};
  all.forEach(b => { if (!isActive(b)) return; const k = _digits(b.phone); if (k) visits[k] = (visits[k] || 0) + 1; });
  const returning = Object.values(visits).filter(n => n >= 2).length;
  const newOnce   = Object.values(visits).filter(n => n === 1).length;
  const nrTotal   = returning + newOnce;
  const nrBar = document.getElementById('pulse-newret-bar');
  const nrLeg = document.getElementById('pulse-newret-legend');
  if (nrBar) nrBar.innerHTML = nrTotal === 0 ? ''
    : '<div style="width:' + (returning / nrTotal * 100) + '%;background:#A67C8E"></div>'
    + '<div style="width:' + (newOnce / nrTotal * 100) + '%;background:#DDC3A5"></div>';
  if (nrLeg) nrLeg.innerHTML =
    '<span><i class="w-2.5 h-2.5 rounded-full inline-block align-middle" style="background:#A67C8E"></i> חוזרות: <b class="text-text-main">' + returning + '</b></span>'
    + '<span><i class="w-2.5 h-2.5 rounded-full inline-block align-middle" style="background:#DDC3A5"></i> חדשות: <b class="text-text-main">' + newOnce + '</b></span>';

  const svcCount = {};
  all.forEach(b => {
    if (!isActive(b)) return;
    const name = b.serviceName || SERVICE_NAME[b.service] || b.service || 'אחר';
    svcCount[name] = (svcCount[name] || 0) + 1;
  });
  const total = Object.values(svcCount).reduce((a, b) => a + b, 0) || 1;
  const svcEl = document.getElementById('pulse-services');
  if (svcEl) svcEl.innerHTML = Object.entries(svcCount).sort((a,b) => b[1]-a[1]).map(([name, n]) => {
    const pct = Math.round(n / total * 100);
    return `<div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-text-main font-medium">${esc(name)}</span>
        <span class="text-text-muted">${n} (${pct}%)</span>
      </div>
      <div class="h-2 bg-secondary/30 rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full transition-all" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('') || '<p class="text-xs text-text-muted">אין נתונים</p>';

  // Top clients — ranked by active booking count (from the loaded bookings).
  const byClient = {};
  all.forEach(b => {
    if (!isActive(b)) return;
    const key = _digits(b.phone);
    if (!key) return;
    const e = byClient[key] || (byClient[key] = { name: b.name || '(ללא שם)', count: 0 });
    e.count++;
    if (b.name) e.name = b.name;
  });
  const topClients = Object.values(byClient).sort((a, b) => b.count - a.count).slice(0, 5);
  const topEl = document.getElementById('pulse-top-clients');
  if (topEl) {
    topEl.innerHTML = topClients.length === 0
      ? '<p class="text-xs text-text-muted">אין נתונים</p>'
      : topClients.map((c, i) => `
          <div class="flex items-center justify-between py-1.5 border-b border-secondary/20 last:border-0">
            <span class="font-medium text-text-main text-xs">${i + 1}. ${esc(c.name)}</span>
            <span class="text-xs text-text-muted">${c.count} ${c.count === 1 ? 'תור' : 'תורים'}</span>
          </div>`).join('');
  }

  const upcoming = all
    .filter(b => b.date > today && b.date <= in7Days && ['Pending','Approved'].includes(b.status))
    .sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1)
    .slice(0, 8);
  const listEl = document.getElementById('pulse-upcoming-list');
  if (listEl) {
    listEl.innerHTML = upcoming.length === 0
      ? '<p class="text-xs text-text-muted">אין הזמנות קרובות</p>'
      : upcoming.map(b => `
          <div data-pulse-row data-date="${esc(b.date)}"
               class="flex items-center justify-between gap-2 py-1.5 px-1 border-b border-secondary/20 last:border-0 rounded-lg hover:bg-cream cursor-pointer transition-colors">
            <div class="min-w-0">
              <span class="font-medium text-text-main text-xs">${esc(b.name)}</span>
              <span class="text-text-muted text-xs mr-1">${esc(b.serviceName)}</span>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-xs text-text-muted">${(b.date||'').replace(/-/g,'/')} ${esc(b.time)}</span>
              <button data-pulse-del data-id="${esc(b.id)}" title="מחק הזמנה"
                class="p-1 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.87 12.14A2 2 0 0116.14 21H7.86a2 2 0 01-1.99-1.86L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/>
                </svg>
              </button>
            </div>
          </div>`).join('');
    listEl.querySelectorAll('[data-pulse-row]').forEach(row =>
      row.addEventListener('click', () => _pulseOpenDate(row.dataset.date)));
    listEl.querySelectorAll('[data-pulse-del]').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); deleteBooking(btn.dataset.id); }));
  }
}

// Tapping an upcoming row focuses that date in the Bookings tab.
function _pulseOpenDate(dateStr) {
  if (!dateStr) return;
  S.dateJump = dateStr;
  const jump = document.getElementById('js-date-jump');
  if (jump) jump.value = dateStr;
  setTab('bookings');
  render();
}

// DEFAULT_TEMPLATE removed (slots tab deleted)
const DEFAULT_TEMPLATE_UNUSED = [
  { dayOfWeek: 0, dayName: 'ראשון',  active: true,  startTimes: [] },
  { dayOfWeek: 1, dayName: 'שני',    active: true,  startTimes: [] },
  { dayOfWeek: 2, dayName: 'שלישי',  active: true,  startTimes: [] },
  { dayOfWeek: 3, dayName: 'רביעי',  active: true,  startTimes: [] },
  { dayOfWeek: 4, dayName: 'חמישי',  active: true,  startTimes: [] },
  { dayOfWeek: 5, dayName: 'שישי',   active: false, startTimes: [] },
  { dayOfWeek: 6, dayName: 'שבת',    active: false, startTimes: [] },
];

function loadTemplate_unused() {
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

function renderTemplate_unused() {
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

function saveTemplate_unused() {
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

async function generateSlots_unused() {
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


function loadSystemInfo() { /* superseded by loadReminderConfig */ }

function updateReminderPreview() {
  const list = document.getElementById('js-reminder-list');
  if (!list) return;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const appts = liveBookings().filter(b => b.status === 'Approved' && b.date === tomorrow);
  if (appts.length === 0) {
    list.innerHTML = '<div class="text-text-muted italic">אין תורים מאושרים למחר</div>';
  } else {
    list.innerHTML = appts.map(b =>
      '<div class="flex items-center justify-between bg-cream rounded-lg px-2.5 py-1.5">' +
        '<span class="font-semibold">' + esc(b.name) + '</span>' +
        '<span class="text-text-muted">' + esc(b.time) + ' — ' + esc(b.serviceName || b.service) + '</span>' +
      '</div>'
    ).join('');
  }
}

async function sendReminders() {
  const btn = document.getElementById('js-reminder-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="w-4 h-4 spinner"></span> שולח...';
  try {
    const data = await sbCall('send-reminders', {});
    if (!data.success) throw new Error(data.error || 'שגיאה');
    toast('נשלחו ' + data.sent + ' מתוך ' + data.total + ' תזכורות ✅', 'ok');
    updateReminderPreview();
  } catch (e) {
    toast('שגיאה: ' + e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'שלח תזכורות למחר';
  }
}



function loadReminderConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_REMINDER) || '{}');
    S.reminder.enabled = saved.enabled === true;
    S.reminder.hour    = typeof saved.hour === 'number' ? saved.hour : 20;
  } catch (_) { S.reminder = { enabled: false, hour: 20 }; }
  const toggle = document.getElementById('js-reminder-toggle');
  const hourEl = document.getElementById('js-reminder-hour');
  if (toggle) toggle.checked = S.reminder.enabled;
  if (hourEl) hourEl.value   = String(S.reminder.hour);
  _setReminderVisibility(S.reminder.enabled);
}

function saveReminderConfig() {
  try { localStorage.setItem(LS_REMINDER, JSON.stringify({ enabled: S.reminder.enabled, hour: S.reminder.hour })); } catch (_) {}
}

function _setReminderVisibility(enabled) {
  const statusRow  = document.getElementById('js-reminder-status-row');
  const statusIcon = document.getElementById('js-reminder-status-icon');
  const statusText = document.getElementById('js-reminder-status-text');
  const toggleLbl  = document.getElementById('js-reminder-toggle-label');
  const hourEl     = document.getElementById('js-reminder-hour');
  const hour       = hourEl ? (hourEl.value + ':00') : '20:00';
  if (statusRow) {
    statusRow.className = enabled
      ? 'flex items-center gap-2 rounded-xl px-3 py-2 mb-3 bg-green-50 border border-green-100 transition-colors'
      : 'flex items-center gap-2 rounded-xl px-3 py-2 mb-3 bg-gray-100 border border-gray-200 transition-colors';
  }
  if (statusIcon) statusIcon.textContent = enabled ? '✅' : '⏸️';
  if (statusText) {
    statusText.textContent = enabled
      ? 'פעיל — תזכורות יישלחו ב-' + hour
      : 'כבוי — תזכורות לא יישלחו אוטומטית';
    statusText.className = enabled ? 'text-xs font-bold text-green-700' : 'text-xs font-bold text-gray-400';
  }
  if (toggleLbl) {
    toggleLbl.textContent = enabled ? 'פעיל' : 'כבוי';
    toggleLbl.className   = enabled ? 'text-xs font-black text-green-600' : 'text-xs font-black text-gray-400';
  }
}

function _initReminderHours() {
  const sel = document.getElementById('js-reminder-hour');
  if (!sel) return;
  for (let h = 8; h <= 22; h++) {
    const opt = document.createElement('option');
    opt.value = String(h);
    opt.textContent = (h < 10 ? '0' + h : h) + ':00';
    sel.appendChild(opt);
  }
  sel.value = String(S.reminder.hour);
}

async function loadAutoBlockConfig() {
  try {
    const data = await apiCall('getAutoBlockConfig');
    if (!data.success) return;
    S.autoBlock.enabled = data.enabled !== false;
    S.autoBlock.time    = typeof data.time === 'number' ? data.time : 20;
    const toggle  = document.getElementById('js-autoblock-toggle');
    const timeEl  = document.getElementById('js-autoblock-time');
    if (toggle) toggle.checked = S.autoBlock.enabled;
    if (timeEl) timeEl.value   = String(S.autoBlock.time);
    _setAutoBlockSettingsVisibility(S.autoBlock.enabled);
  } catch (_) {}
}

function _setAutoBlockSettingsVisibility(enabled) {
  const settings = document.getElementById('js-autoblock-settings');
  if (settings) {
    settings.style.opacity       = enabled ? '1' : '0.45';
    settings.style.pointerEvents = enabled ? '' : 'none';
  }
  const statusRow  = document.getElementById('js-autoblock-status-row');
  const statusIcon = document.getElementById('js-autoblock-status-icon');
  const statusText = document.getElementById('js-autoblock-status-text');
  const toggleLbl  = document.getElementById('js-autoblock-toggle-label');
  const timeVal    = document.getElementById('js-autoblock-time');
  const hour       = timeVal ? (timeVal.value + ':00') : '20:00';
  if (statusRow) {
    statusRow.className = enabled
      ? 'flex items-center gap-2 rounded-xl px-3 py-2 mb-3 bg-green-50 border border-green-100 transition-colors'
      : 'flex items-center gap-2 rounded-xl px-3 py-2 mb-3 bg-gray-100 border border-gray-200 transition-colors';
  }
  if (statusIcon) statusIcon.textContent = enabled ? '✅' : '⏸️';
  if (statusText) {
    statusText.textContent = enabled
      ? 'פעיל — תורים יינעלו מדי ערב ב-' + hour
      : 'כבוי — תורים יישמרו פתוחים';
    statusText.className = enabled ? 'text-xs font-bold text-green-700' : 'text-xs font-bold text-gray-400';
  }
  if (toggleLbl) {
    toggleLbl.textContent = enabled ? 'פעיל' : 'כבוי';
    toggleLbl.className   = enabled ? 'text-xs font-black text-green-600' : 'text-xs font-black text-gray-400';
  }
}

async function saveAutoBlockConfig(enabled, time) {
  const ind = document.getElementById('js-autoblock-save-indicator');
  if (ind) ind.textContent = 'שומר...';
  try {
    const data = await apiCall('saveAutoBlockConfig', { enabled, time });
    if (!data.success) throw new Error(data.error);
    S.autoBlock.enabled = enabled;
    S.autoBlock.time    = time;
    _setAutoBlockSettingsVisibility(enabled);
    if (ind) { ind.textContent = '✓ נשמר'; setTimeout(() => { ind.textContent = ''; }, 2000); }
  } catch (e) {
    if (ind) ind.textContent = '';
    toast('שגיאה בשמירת הגדרות: ' + e.message, 'err');
  }
}

async function runAutoBlock() {
  const btn = document.getElementById('js-autoblock-run');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="w-4 h-4 spinner"></span>'; }
  try {
    const data = await apiCall('runAutoBlock');
    if (!data.success) throw new Error(data.error);
    if (data.skipped) {
      toast('חסימה אוטומטית כבויה — אפשר במתג למעלה', '');
    } else {
      toast('נחסמו ' + data.blocked + ' תורים למחר ✅', 'ok');
    }
  } catch (e) {
    toast('שגיאה בהפעלת חסימה: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'הפעל עכשיו'; }
  }
}

function openSmsModal(booking) {
  S._smsSendTarget = booking;
  const nm = (booking.name || '').trim();
  document.getElementById('js-sms-recipient').textContent =
    (nm ? nm + ' ' : '') + '(' + fmtPhone(booking.phone) + ')';
  document.getElementById('js-sms-text').value =
    nm ? ('היי ' + nm + ', רציתי לעדכן ש…') : 'היי, רציתי לעדכן ש…';
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

async function loadTwilioStats() {
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const errEl   = document.getElementById('js-twilio-error');
  const balRow  = document.getElementById('js-twilio-balance-row');
  setText('js-twilio-balance', '…');
  ['js-twilio-today','js-twilio-week','js-twilio-month','js-twilio-year','js-twilio-alltime']
    .forEach(id => setText(id, '…'));
  if (errEl) errEl.classList.add('hidden');
  try {
    const data = await sbCall('twilio-stats', {});
    if (!data.success) throw new Error(data.error || 'שגיאה');

    // Each field is null if that Twilio call failed independently (allSettled)
    const fmt = (v) => v != null ? '$' + parseFloat(v).toFixed(2) : '—';

    const bal = data.balance ? parseFloat(data.balance.amount || '0') : null;
    setText('js-twilio-balance', bal != null ? '$' + bal.toFixed(2) : '—');
    if (data.balance) setText('js-twilio-currency', data.balance.currency || 'USD');

    if (balRow && bal != null) {
      const cls = bal < 1
        ? 'flex items-center justify-between rounded-xl px-4 py-3 mb-3 bg-red-50 border border-red-200 transition-colors'
        : bal < 5
          ? 'flex items-center justify-between rounded-xl px-4 py-3 mb-3 bg-amber-50 border border-amber-200 transition-colors'
          : 'flex items-center justify-between rounded-xl px-4 py-3 mb-3 bg-green-50 border border-green-100 transition-colors';
      balRow.className = cls;
      const balEl = document.getElementById('js-twilio-balance');
      if (balEl) balEl.className = 'text-[2rem] leading-none font-black tabular-nums ' +
        (bal < 1 ? 'text-red-600' : bal < 5 ? 'text-amber-600' : 'text-green-600');
    }

    const sp = data.spend || {};
    setText('js-twilio-today',   fmt(sp.today));
    setText('js-twilio-week',    fmt(sp.week));
    setText('js-twilio-month',   fmt(sp.month));
    setText('js-twilio-year',    fmt(sp.year));
    setText('js-twilio-alltime', fmt(sp.allTime));
  } catch (e) {
    ['js-twilio-balance','js-twilio-today','js-twilio-week','js-twilio-month','js-twilio-year','js-twilio-alltime']
      .forEach(id => setText(id, '—'));
    if (errEl) { errEl.textContent = 'שגיאה: ' + e.message; errEl.classList.remove('hidden'); }
  }
}

async function loadSmsLog() {
  const el = document.getElementById('js-sms-log');
  if (!el) return;
  el.innerHTML = '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';
  try {
    const data = await sbCall('sms-log', {});
    if (!data.success) throw new Error(data.error);
    S.smsEntries = data.entries || [];
    renderSmsCenter();
  } catch (e) {
    el.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה: ' + e.message + '</div>';
  }
}

// ── SMS Center: filtering + analytics ───────────────────────────────────────
function smsFiltered(ignoreStatus) {
  const today = new Date().toISOString().slice(0, 10);
  const f = S.smsFilter;
  let rows = S.smsEntries.slice();
  if (!ignoreStatus && f.status !== 'all') rows = rows.filter(e => (e.status || '') === f.status);
  if (f.context !== 'all') rows = rows.filter(e => (e.context || '') === f.context);
  if (f.day) {
    rows = rows.filter(e => (e.ts || '') === f.day);
  } else if (f.range !== 'all') {
    const days = f.range === 'today' ? 0 : (f.range === '7' ? 6 : 29);
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    rows = rows.filter(e => (e.ts || '') >= from && (e.ts || '') <= today);
  }
  if (f.search) {
    const q = f.search.replace(/\D/g, '');
    if (q) rows = rows.filter(e => String(e.to || '').replace(/\D/g, '').includes(q));
  }
  return rows;
}

function _smsPillCls(base, active) {
  return base + ' shrink-0 text-xs font-semibold px-4 py-2 rounded-xl transition-all ' +
    (active ? 'bg-primary text-white shadow-sm'
            : 'bg-cream text-text-muted border border-secondary/40 hover:border-primary hover:text-primary');
}

function renderSmsCenter() {
  const list   = smsFiltered(false);   // list, breakdown, trend honour every filter
  const kpiSet = smsFiltered(true);    // KPIs ignore the status pill (so sent/failed stay meaningful)

  const sent   = kpiSet.filter(e => e.status === 'SENT').length;
  const failed = kpiSet.filter(e => e.status === 'ERROR').length;
  const acct   = sent + failed;
  const rate   = acct ? Math.round(sent / acct * 100) : 100;
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('sms-total',  kpiSet.length);
  setTxt('sms-sent',   sent);
  setTxt('sms-failed', failed);
  setTxt('sms-rate',   rate + '%');

  document.querySelectorAll('.sms-status-pill').forEach(b =>
    b.className = _smsPillCls('sms-status-pill', b.dataset.smsStatus === S.smsFilter.status));
  document.querySelectorAll('.sms-range-pill').forEach(b =>
    b.className = _smsPillCls('sms-range-pill', b.dataset.smsRange === S.smsFilter.range));

  // Breakdown by context
  const byCtx = {};
  list.forEach(e => { const k = e.context || 'אחר'; byCtx[k] = (byCtx[k] || 0) + 1; });
  const ctxEl = document.getElementById('js-sms-by-context');
  if (ctxEl) {
    const rows = Object.entries(byCtx).sort((a, b) => b[1] - a[1]);
    const max  = rows.length ? rows[0][1] : 1;
    ctxEl.innerHTML = rows.length === 0
      ? '<p class="text-xs text-text-muted">אין נתונים בטווח שנבחר</p>'
      : rows.map(([ctx, n]) => {
          const label  = SMS_CONTEXT_LABEL[ctx] || ctx;
          const pct    = Math.round(n / max * 100);
          const active = S.smsFilter.context === ctx;
          return '<button type="button" data-sms-ctx="' + esc(ctx) + '"'
            + ' class="w-full text-right block rounded-lg px-2 py-1.5 -mx-2 transition-all hover:bg-cream ' + (active ? 'ring-1 ring-primary/50 bg-cream' : '') + '">'
            + '<div class="flex justify-between text-xs mb-1"><span class="text-text-main font-medium">' + esc(label) + (active ? ' ✓' : '') + '</span><span class="text-text-muted font-semibold">' + n + '</span></div>'
            + '<div class="h-2 bg-secondary/30 rounded-full overflow-hidden"><div class="h-full bg-primary rounded-full transition-all" style="width:' + pct + '%"></div></div>'
            + '</button>';
        }).join('');
    ctxEl.querySelectorAll('[data-sms-ctx]').forEach(b =>
      b.addEventListener('click', () => {
        const c = b.dataset.smsCtx;
        S.smsFilter.context = (S.smsFilter.context === c) ? 'all' : c;
        const sel = document.getElementById('js-sms-context'); if (sel) sel.value = S.smsFilter.context;
        renderSmsCenter();
      }));
  }

  // Daily activity trend (last 14 days)
  const trendEl = document.getElementById('js-sms-trend');
  if (trendEl) {
    const days = [];
    for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const counts = days.map(d => list.filter(e => (e.ts || '') === d).length);
    const max = Math.max(1, ...counts);
    trendEl.innerHTML = days.map((d, i) => {
      const h = Math.max(4, Math.round(counts[i] / max * 100));
      const active = S.smsFilter.day === d;
      return '<button type="button" data-sms-day="' + d + '" class="flex-1 flex flex-col items-center justify-end gap-1 h-full cursor-pointer" title="' + d + ': ' + counts[i] + '">'
        + '<div class="w-full rounded-t-md transition-all ' + (active ? 'bg-primary ring-2 ring-primary/40' : counts[i] ? 'bg-primary/80 hover:bg-primary' : 'bg-secondary/30') + '" style="height:' + h + '%"></div>'
        + '<span class="text-[8px] ' + (active ? 'text-primary font-bold' : 'text-text-muted') + '">' + d.slice(8) + '</span>'
        + '</button>';
    }).join('');
    trendEl.querySelectorAll('[data-sms-day]').forEach(b =>
      b.addEventListener('click', () => {
        const d = b.dataset.smsDay;
        S.smsFilter.day = (S.smsFilter.day === d) ? '' : d;
        renderSmsCenter();
      }));
  }

  const logEl = document.getElementById('js-sms-log');
  renderSmsLog(list, logEl);
  // Tap a message row to message that number again (resend / contact).
  if (logEl) logEl.querySelectorAll('[data-qa="log-entry"]').forEach(row =>
    row.addEventListener('click', () => { const p = row.dataset.phone; if (p) openSmsModal({ phone: p, name: '' }); }));
}


function renderVisibleCalendar() {
  const y   = S.calMonth.getFullYear();
  const mo  = S.calMonth.getMonth() + 1;
  const key = y + '-' + String(mo).padStart(2, '0');
  S.calData = buildCalData(liveBookings(), S.slotCache[key] || []);
  renderCalendar(
    document.getElementById('js-cal-grid'),
    document.getElementById('js-cal-title'),
    y, mo, S.calData,
    { onDayClick: onCalDayClick }
  );
  _updateCalMonthStats();
  _updateNextPendingBtn();
}

function _updateCalMonthStats() {
  const el = document.getElementById('js-cal-month-stats');
  if (!el) return;
  let pending = 0, approved = 0, free = 0;
  for (const e of Object.values(S.calData)) {
    for (const b of (e.bookings || [])) {
      if (b.status === 'Pending')  pending++;
      if (b.status === 'Approved') approved++;
    }
    free += e.freeSlotCount || 0;
  }
  const chip = (n, label, cls) =>
    n ? '<span class="px-2 py-0.5 rounded-full ' + cls + '">' + n + ' ' + label + '</span>' : '';
  el.innerHTML = chip(pending, 'ממתינות', 'bg-amber-100 text-amber-700')
    + chip(approved, 'מאושרות', 'bg-green-100 text-green-700')
    + chip(free, 'פנויות', 'bg-rose-100 text-rose-500');
  el.classList.toggle('hidden', !pending && !approved && !free);
}

function _updateNextPendingBtn() {
  const btn = document.getElementById('js-cal-next-pending');
  if (!btn) return;
  const today = _todayISO();
  const next = liveBookings()
    .filter(b => b.status === 'Pending' && b.date && b.date >= today)
    .sort((a, b) => a.date < b.date ? -1 : 1)[0];
  btn.classList.toggle('hidden', !next);
  btn.onclick = next ? () => {
    const d = new Date(next.date + 'T00:00:00');
    S.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    loadAndRenderCalendar().then(() => {
      const cell = document.querySelector('[data-date="' + next.date + '"]');
      if (cell) cell.click();
    });
  } : null;
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
  openSheet('day', _dayPayload(dateStr), 'full');
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
    peekContent.innerHTML = parts.length ? parts.join(' • ') : '<span class="text-text-muted">אין תורים</span>';
  }
  if (peekBtn) {
    // Past days cannot accept new slots — hide the "add slot" affordance.
    peekBtn.classList.toggle('hidden', dateStr < _todayISO());
    peekBtn.dataset.peekDate = dateStr;
  }
}

async function _commitCardAction(id, target) {
  let _opts = null;
  if (target === 'Cancelled' || target === 'Rejected') {
    const b = S.bookings.find(b => b.id === id);
    _opts = await showCancelModal(b || { id, date: '', time: '', serviceName: '', status: 'Pending' }, target);
    if (_opts === null) {
      // Spring the card back to its resting position.
      const _w = document.querySelector('[data-swipe-id="' + id + '"]');
      const _c = _w ? _w.querySelector('.swipe-card') : null;
      if (_c) animate(_c, { x: 0, opacity: 1 }, { type: spring, stiffness: 450, damping: 32 });
      return;
    }
  }

  const wrapper  = document.querySelector('[data-swipe-id="' + id + '"]');
  const card     = wrapper ? wrapper.querySelector('.swipe-card') : null;
  const booking  = S.bookings.find(b => b.id === id);
  const prevStatus = booking ? booking.status : null;
  if (booking) booking.status = target;

  if (wrapper && card) {
    const dir = (target === 'Approved') ? 1 : -1;
    wrapper.style.overflow = 'hidden';
    animate(card, { x: `${dir * 115}%`, opacity: [1, 0] },
      { type: spring, stiffness: 450, damping: 32 });
    animate(wrapper,
      { maxHeight: [wrapper.offsetHeight + 'px', '0px'], marginBottom: '0px', opacity: [1, 0] },
      { duration: 0.32, delay: 0.08 });
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
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: target,
              suppressSms: _opts ? _opts.suppressSms : false,
              customSmsBody: _opts ? _opts.customSmsBody : null }) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data.success) throw new Error(data.error || 'error');
        // GAS side-effects (Calendar) — fire-and-forget
        apiCall('changeStatus', { bookingId: id, targetStatus: target,
          keepCalendar: _opts ? _opts.keepCalendar : false }).catch(e => {
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

async function _commitSheetAction(id, target) {
  const booking = S.bookings.find(b => b.id === id);
  if (!booking) return;

  let _opts = null;
  if (target === 'Cancelled' || target === 'Rejected') {
    _opts = await showCancelModal(booking, target);
    if (_opts === null) return;
  }

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
            body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: target,
              suppressSms: _opts ? _opts.suppressSms : false,
              customSmsBody: _opts ? _opts.customSmsBody : null }) }
        );
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (!data.success) throw new Error(data.error || 'error');
        apiCall('changeStatus', { bookingId: id, targetStatus: target,
          keepCalendar: _opts ? _opts.keepCalendar : false }).catch(e => {
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

async function _commitApproveAll(pendingIds) {
  closeSheet();
  const prevStatuses = {};
  pendingIds.forEach(id => {
    const b = S.bookings.find(b => b.id === id);
    if (b) { prevStatuses[id] = b.status; b.status = 'Approved'; }
  });
  renderVisibleCalendar();
  toast('אושרו ' + pendingIds.length + ' הזמנות ✓', 'ok');
  try {
    await Promise.all(pendingIds.map(id =>
      fetch(APP_CONFIG.SUPABASE_URL + '/functions/v1/change-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + APP_CONFIG.SUPABASE_ANON_KEY },
        body: JSON.stringify({ adminToken: S.token, bookingId: id, targetStatus: 'Approved' }),
      }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); })
    ));
    await load(true);
  } catch (e) {
    pendingIds.forEach(id => {
      const b = S.bookings.find(b => b.id === id);
      if (b && prevStatuses[id]) b.status = prevStatuses[id];
    });
    renderVisibleCalendar();
    toast('שגיאה: ' + e.message, 'err');
    await load(true);
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

  const bookSearchEl = document.getElementById('js-book-search');
  if (bookSearchEl) bookSearchEl.addEventListener('input', e => {
    S.bookSearch = e.target.value || '';
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

  // Swipe left/right on the admin calendar grid to navigate months (mobile)
  let _adminSwipeX = null, _adminSwipeY = null;
  const _adminCalGrid = document.getElementById('js-cal-grid');
  if (_adminCalGrid) {
    _adminCalGrid.addEventListener('touchstart', e => {
      _adminSwipeX = e.touches[0].clientX;
      _adminSwipeY = e.touches[0].clientY;
    }, { passive: true });
    _adminCalGrid.addEventListener('touchend', e => {
      if (_adminSwipeX === null) return;
      const dx = e.changedTouches[0].clientX - _adminSwipeX;
      const dy = e.changedTouches[0].clientY - _adminSwipeY;
      _adminSwipeX = _adminSwipeY = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      document.getElementById(dx < 0 ? 'js-cal-next' : 'js-cal-prev').click();
    }, { passive: true });
  }

  const peekAddBtn = document.getElementById('js-cal-peek-add');
  if (peekAddBtn) {
    peekAddBtn.addEventListener('click', () => {
      const d = peekAddBtn.dataset.peekDate;
      if (!d) return;
      if (!isSheetOpen()) { _sheetOpenDate = d; openSheet('day', _dayPayload(d)); }
    });
  }

  _initReminderHours();
  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);
  document.getElementById('js-reminder-toggle').addEventListener('change', () => {
    S.reminder.enabled = document.getElementById('js-reminder-toggle').checked;
    _setReminderVisibility(S.reminder.enabled);
    saveReminderConfig();
  });
  document.getElementById('js-reminder-hour').addEventListener('change', () => {
    S.reminder.hour = parseInt(document.getElementById('js-reminder-hour').value, 10);
    _setReminderVisibility(S.reminder.enabled);
    saveReminderConfig();
  });
  document.getElementById('js-autoblock-toggle').addEventListener('change', () => {
    const enabled = document.getElementById('js-autoblock-toggle').checked;
    const time    = parseInt(document.getElementById('js-autoblock-time').value, 10);
    _setAutoBlockSettingsVisibility(enabled);
    saveAutoBlockConfig(enabled, time);
  });
  document.getElementById('js-autoblock-time').addEventListener('change', () => {
    const enabled = document.getElementById('js-autoblock-toggle').checked;
    const time    = parseInt(document.getElementById('js-autoblock-time').value, 10);
    _setAutoBlockSettingsVisibility(enabled);
    saveAutoBlockConfig(enabled, time);
  });
  document.getElementById('js-autoblock-run').addEventListener('click', runAutoBlock);

  document.getElementById('js-sms-close').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-cancel').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-backdrop').addEventListener('click', closeSmsModal);
  document.getElementById('js-sms-send').addEventListener('click', sendManualSMS);

  document.getElementById('js-log-refresh').addEventListener('click', () => { loadSmsLog(); loadTwilioStats(); });
  document.getElementById('js-twilio-refresh').addEventListener('click', loadTwilioStats);

  // SMS center filters
  document.querySelectorAll('.sms-status-pill').forEach(b =>
    b.addEventListener('click', () => { S.smsFilter.status = b.dataset.smsStatus; renderSmsCenter(); }));
  document.querySelectorAll('.sms-range-pill').forEach(b =>
    b.addEventListener('click', () => { S.smsFilter.range = b.dataset.smsRange; S.smsFilter.day = ''; renderSmsCenter(); }));
  const smsCtxEl = document.getElementById('js-sms-context');
  if (smsCtxEl) smsCtxEl.addEventListener('change', e => { S.smsFilter.context = e.target.value; renderSmsCenter(); });
  const smsSearchEl = document.getElementById('js-sms-search');
  if (smsSearchEl) smsSearchEl.addEventListener('input', e => { S.smsFilter.search = e.target.value || ''; renderSmsCenter(); });

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

  const clientSortEl = document.getElementById('js-client-sort');
  if (clientSortEl) clientSortEl.addEventListener('change', e => {
    S.clientSort = e.target.value;
    if (S.clients.length) renderClients();
  });

  document.querySelectorAll('.client-filter-pill').forEach(btn =>
    btn.addEventListener('click', () => setClientFilter(btn.dataset.clientFilter)));
  setClientFilter('all');

  initSheet();

  document.addEventListener('sheet:action', async e => {
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
            toast('תור בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
          } else {
            toast('התור נוסף ✓', 'ok');
            // Close the sheet and reveal the calendar with the new free slot.
            closeSheet();
            delete S.slotCache[slotDate.substring(0, 7)];
            await load(true);
            await loadAndRenderCalendar();
          }
        } catch (err) {
          toast('שגיאה בהוספת התור', 'err');
        }
      })();
      return;
    }
    if (action === 'deleteSlot' || action === 'blockSlot' || action === 'unblockSlot') {
      const slotId = Number(e.detail.slotId);
      if (!slotId) return;
      const dayDate = _sheetOpenDate;
      (async () => {
        try {
          // deleteSlot removes the slot; blockSlot/unblockSlot flip available↔locked (toggleSlot).
          const apiAction = action === 'deleteSlot' ? 'deleteSlot' : 'toggleSlot';
          const r = await sbCall('admin-slots', { action: apiAction, slotId });
          if (!r.success) throw new Error(r.error);
          const toastMsg = action === 'deleteSlot' ? 'התור נמחק'
                         : action === 'unblockSlot' ? 'התור שוחרר ✓'
                         : 'התור נחסם';
          toast(toastMsg, 'ok');
          if (dayDate) delete S.slotCache[dayDate.substring(0, 7)];
          await load(true);
          await loadAndRenderCalendar();
          // Slot management keeps the popup open — re-open with fresh day data.
          if (dayDate && isSheetOpen()) openSheet('day', _dayPayload(dayDate));
        } catch (err) {
          toast('שגיאה בעדכון התור', 'err');
        }
      })();
      return;
    }
    if (action === 'approveAll') {
      const dayEntry = S.calData[_sheetOpenDate];
      const pending  = ((dayEntry && dayEntry.bookings) ? dayEntry.bookings : [])
        .filter(b => b.status === 'Pending');
      if (pending.length) _commitApproveAll(pending.map(b => b.id));
      return;
    }
    const STATUS_MAP = { approve: 'Approved', reject: 'Rejected', cancel: 'Cancelled' };
    if (STATUS_MAP[action]) await _commitSheetAction(id, STATUS_MAP[action]);
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
    } catch (_) {
      logout();
    }
  } else if (S.token) {
    logout();
  }

  startAutoRefresh();
}

function _updateDiaryDayLabel_unused(date) {
  const el = document.getElementById('js-diary-day-label');
  if (!el || !date) return;
  const d = new Date(date + 'T12:00:00');
  el.textContent = 'יום ' + DAY_NAMES_HE[d.getDay()] + ' · ' + d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
}

function _shiftDiaryDay_unused(delta) {
  const el = document.getElementById('js-diary-date');
  if (!el) return;
  const base = el.value || new Date().toISOString().slice(0, 10);
  const d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  el.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  loadDiarySlots();
}

async function loadDiarySlots_unused() {
  const dateEl = document.getElementById('js-diary-date');
  const date   = dateEl ? dateEl.value : '';
  if (!date) return;
  _updateDiaryDayLabel(date);
  const container = document.getElementById('js-diary-slots');
  if (container) container.innerHTML = '<div class="text-xs text-text-muted text-center py-8"><span class="spinner w-5 h-5 inline-block"></span></div>';
  try {
    const r = await sbCall('admin-slots', { action: 'getSlots', dateFrom: date, dateTo: date });
    if (!r.success) throw new Error(r.error);
    S.diarySlots = r.slots;
    renderDiarySlots(r.slots, container, { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
  } catch (e) {
    toast('שגיאה בטעינת התורים', 'err');
    if (container) container.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

async function toggleDiarySlot_unused(slotId, currentStatus) {
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
        toast('תור זה לא ניתן לשינוי (מוזמן / נעול)', 'err'); return;
      }
      throw new Error(r.error || 'error');
    }
    const lbl = newStatus === 'locked' ? 'חסום ✅' : 'שוחרר ✅';
    toast('תור עודכן — ' + lbl, 'ok');
    await loadDiarySlots();
  } catch (e) {
    renderDiarySlots(S.diarySlots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
    toast('שגיאה בשינוי הסטטוס', 'err');
  }
}

async function deleteDiarySlot_unused(slotId) {
  try {
    const r = await sbCall('admin-slots', { action: 'deleteSlot', slotId });
    if (!r.success) {
      if (r.error === 'cannot_delete_active') toast('לא ניתן למחוק תור תפוס', 'warn');
      else throw new Error(r.error);
      return;
    }
    S.diarySlots = S.diarySlots.filter(s => s.id !== slotId);
    renderDiarySlots(S.diarySlots, document.getElementById('js-diary-slots'), { onToggle: toggleDiarySlot, onDelete: deleteDiarySlot });
    toast('התור נמחק ✓', 'ok');
  } catch (e) {
    toast('שגיאה במחיקת התור', 'err');
  }
}

async function addDiarySlot_unused() {
  const dateEl = document.getElementById('js-diary-date');
  const timeEl = document.getElementById('js-add-slot-time');
  const date   = dateEl ? dateEl.value : '';
  const time   = timeEl ? timeEl.value : '';
  if (!date) { toast('בחרי יום', 'warn'); return; }
  if (!time) { toast('בחרי שעה להוספה', 'warn'); return; }

  const today = new Date().toISOString().slice(0, 10);
  if (date < today) { toast('לא ניתן להוסיף תור בתאריך שעבר', 'warn'); return; }

  const btn = document.getElementById('js-add-slot-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner w-4 h-4"></span>'; }
  try {
    const r = await sbCall('admin-slots', { action: 'addSlot', date, time });
    if (!r.success) throw new Error(r.error);
    if (r.already_exists) {
      toast('תור בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
    } else {
      toast('התור נוסף בהצלחה ✓', 'ok');
      if (timeEl) timeEl.value = '';
      delete S.slotCache[date.substring(0, 7)];
      await loadDiarySlots();
    }
  } catch (e) {
    toast('שגיאה בהוספת התור', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ הוסף'; }
  }
}

function _digits(p) { return String(p || '').replace(/\D/g, ''); }

// Per-client stats derived from the already-loaded bookings (keyed by phone digits).
function computeClientStats() {
  const today = new Date().toISOString().slice(0, 10);
  const map = {};
  liveBookings().forEach(b => {
    const key = _digits(b.phone);
    if (!key) return;
    const s = map[key] || (map[key] = { visits: 0, upcoming: 0, cancelled: 0, lastVisit: '', _last: '' });
    if (b.status === 'Cancelled' || b.status === 'Rejected') { s.cancelled++; return; }
    if (b.date && b.date >= today && (b.status === 'Approved' || b.status === 'Pending')) {
      s.upcoming++;
    } else if (b.status === 'Approved') {
      s.visits++;
      if (b.date && b.date > s._last) {
        s._last = b.date;
        const p = b.date.split('-');
        s.lastVisit = p[2] + '/' + p[1];
      }
    }
  });
  return map;
}

function renderClientsSummary(clients, byPhone) {
  const el = document.getElementById('js-clients-summary');
  if (!el) return;
  const total     = clients.length;
  const returning = clients.filter(c => ((byPhone[c.phone] || {}).visits || 0) >= 2).length;
  const monthKey  = new Date().toISOString().slice(0, 7);
  const newThis   = clients.filter(c => c.created_at && String(c.created_at).slice(0, 7) === monthKey).length;
  el.textContent = total + ' לקוחות · ' + returning + ' חוזרות · ' + newThis + ' חדשות החודש';
}

function sortClients(clients, byPhone) {
  const arr = clients.slice();
  if (S.clientSort === 'visits') {
    arr.sort((a, b) => ((byPhone[b.phone] || {}).visits || 0) - ((byPhone[a.phone] || {}).visits || 0));
  } else if (S.clientSort === 'name') {
    arr.sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), 'he'));
  }
  return arr; // 'recent' keeps server order (created_at desc)
}

// Render the client list from S.clients with computed stats + current sort.
function clientMatchesFilter(c, byPhone) {
  const st = byPhone[c.phone] || {};
  switch (S.clientFilter) {
    case 'upcoming':  return (st.upcoming || 0) > 0;
    case 'returning': return (st.visits   || 0) >= 2;
    case 'inactive':  return (st.upcoming || 0) === 0;
    default:          return true;
  }
}

function setClientFilter(f) {
  S.clientFilter = f;
  document.querySelectorAll('.client-filter-pill').forEach(btn => {
    const active = btn.dataset.clientFilter === f;
    btn.className = 'client-filter-pill shrink-0 text-xs font-semibold px-4 py-2 rounded-xl transition-all '
      + (active ? 'bg-primary text-white shadow-sm'
                : 'bg-white text-text-muted border border-secondary/40 hover:border-primary hover:text-primary');
  });
  if (S.clients.length) renderClients();
}

function renderClients() {
  const container = document.getElementById('js-clients-list');
  if (!container) return;
  const rawStats = computeClientStats();
  const byPhone  = {};
  S.clients.forEach(c => { byPhone[c.phone] = rawStats[_digits(c.phone)] || {}; });
  renderClientsSummary(S.clients, byPhone);
  const filtered = S.clients.filter(c => clientMatchesFilter(c, byPhone));
  renderClientList(sortClients(filtered, byPhone), container, {
    onSelect: loadClientHistory,
    stats:    byPhone,
    onSms:    (phone, name) => openSmsModal({ phone, name }),
  });
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
    renderClients();
  } catch (e) {
    toast('שגיאה בטעינת לקוחות', 'err');
    container.innerHTML = '<div class="text-xs text-red-400 text-center py-8">שגיאה בטעינה</div>';
  }
}

function renderClientHistoryStats(appts) {
  const el = document.getElementById('js-history-stats');
  if (!el) return;
  const todayISO = new Date().toISOString().slice(0, 10);
  const st = a => String(a.status || '').toLowerCase();
  const total    = appts.length;
  const approved = appts.filter(a => st(a) === 'approved').length;
  const upcoming = appts.filter(a => (st(a) === 'pending' || st(a) === 'approved') && a.date && a.date >= todayISO).length;
  const tile = (label, val) =>
    '<div class="bg-white rounded-xl p-2.5 text-center border border-secondary/30 shadow-soft">'
    + '<div class="text-lg font-black text-primary leading-none">' + val + '</div>'
    + '<div class="text-[10px] text-text-muted font-semibold mt-1">' + label + '</div></div>';
  el.innerHTML = tile('סה"כ תורים', total) + tile('מאושרות', approved) + tile('קרובות', upcoming);
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
    renderClientHistoryStats(r.appointments || []);
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
