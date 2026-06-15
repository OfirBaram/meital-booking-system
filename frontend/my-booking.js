'use strict';
import APP_CONFIG from './config.js';

const BASE  = `${APP_CONFIG.SUPABASE_URL}/functions/v1`;
const ANON  = APP_CONFIG.SUPABASE_ANON_KEY;

const HE_MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const HE_DAYS   = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const STATUS_LABELS = { pending: 'ממתינה לאישור ⏳', approved: 'מאושרת ✅', cancelled: 'בוטלה', rejected: 'נדחתה' };
const SESSION_KEY  = 'client_portal_token';
const RESEND_SECS  = 60;

const State = {
  phone: '',
  activeBooking: null,
  history: [],
  rsYear: 0, rsMonth: 0,
  rsSlots: {},      // loaded month keys -> { "YYYY-MM-DD": ["HH:MM", ...] }
  rsDate: null, rsTime: null,
  resendTimer: null,
};

const tok = () => sessionStorage.getItem(SESSION_KEY) ?? '';

// ── API ──────────────────────────────────────────────────────────────────────

async function post(fn, body, useToken = false) {
  const auth = useToken ? tok() : ANON;
  const r = await fetch(`${BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON, 'Authorization': `Bearer ${auth}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function get(fn, params = {}, useToken = false) {
  const auth = useToken ? tok() : ANON;
  const qs   = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
  const r = await fetch(`${BASE}/${fn}${qs}`, {
    headers: { 'apikey': ANON, 'Authorization': `Bearer ${auth}` },
  });
  return r.json();
}

// ── Screens ──────────────────────────────────────────────────────────────────

const SCREENS = ['screen-phone','screen-otp','screen-dashboard','screen-reschedule'];
function show(id) {
  SCREENS.forEach(s => { const el = document.getElementById(s); if (el) el.hidden = (s !== id); });
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;
function toast(msg, isErr = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = el.className.replace(/bg-\S+/g, '').trim() + (isErr ? ' bg-red-500' : ' bg-gray-800');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

// ── Loading ───────────────────────────────────────────────────────────────────

function setLoad(id, on) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (!btn.dataset.orig) btn.dataset.orig = btn.textContent;
  btn.disabled = on;
  btn.textContent = on ? '...' : btn.dataset.orig;
}

// ── Phone screen ──────────────────────────────────────────────────────────────

async function sendOtp() {
  const raw = (document.getElementById('inp-phone')?.value ?? '').trim();
  if (!raw) { toast('הכניסי מספר טלפון', true); return; }
  setLoad('btn-send-otp', true);
  try {
    const r = await post('send-otp', { phone: raw });
    if (r.success) {
      State.phone = raw;
      const el = document.getElementById('otp-phone-display');
      if (el) el.textContent = raw;
      startResend();
      show('screen-otp');
    } else {
      toast(r.error === 'rate_limited' ? 'המתיני לפני שליחה נוספת' : 'שגיאה בשליחת הקוד', true);
    }
  } catch { toast('בעיית תקשורת — נסי שוב', true); }
  finally { setLoad('btn-send-otp', false); }
}

// ── OTP screen ────────────────────────────────────────────────────────────────

function startResend() {
  let s = RESEND_SECS;
  clearInterval(State.resendTimer);
  const btn = document.getElementById('btn-resend-otp');
  const cd  = document.getElementById('resend-countdown');
  if (btn) btn.disabled = true;
  if (cd)  cd.textContent = s;
  State.resendTimer = setInterval(() => {
    s--;
    if (cd) cd.textContent = s;
    if (s <= 0) { clearInterval(State.resendTimer); if (btn) btn.disabled = false; }
  }, 1000);
}

async function verifyOtp() {
  const otp = (document.getElementById('inp-otp')?.value ?? '').trim();
  if (!/^\d{6}$/.test(otp)) { toast('קוד חייב להיות 6 ספרות', true); return; }
  setLoad('btn-verify-otp', true);
  try {
    const r = await post('client-auth', { phone: State.phone, otp });
    if (r.success && r.token) {
      sessionStorage.setItem(SESSION_KEY, r.token);
      await loadPortal();
      show('screen-dashboard');
    } else {
      const msg = r.error === 'invalid_otp'              ? 'קוד שגוי — נסי שוב'
                : r.error === 'otp_not_found_or_expired' ? 'הקוד פג תוקף — שלחי שוב'
                : 'שגיאה באימות';
      toast(msg, true);
    }
  } catch { toast('בעיית תקשורת — נסי שוב', true); }
  finally { setLoad('btn-verify-otp', false); }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function loadPortal() {
  const r = await get('client-portal', {}, true);
  if (!r.success) {
    if (r.error === 'invalid_or_expired_token' || r.error === 'missing_token') {
      sessionStorage.removeItem(SESSION_KEY);
      show('screen-phone');
      toast('פג תוקף הכניסה — הכניסי מספר שוב', true);
    } else {
      toast('שגיאה בטעינת הנתונים', true);
    }
    return;
  }
  State.activeBooking = r.active;
  State.history       = r.history ?? [];
  renderDashboard();
}

function renderDashboard() {
  renderActive();
  renderHistory();
}

function sanitize(s) {
  return String(s ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
}

function fmtDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr ?? ''));
  if (!m) return String(dateStr ?? '');
  const dow = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])).getUTCDay();
  return `יום ${HE_DAYS[dow]}, ${m[3]}.${m[2]}.${m[1]}`;
}

function renderActive() {
  const el = document.getElementById('active-section');
  if (!el) return;
  const b = State.activeBooking;

  if (!b) {
    el.innerHTML = `<div class="bg-white rounded-2xl p-6 text-center shadow-sm">
      <p class="text-gray-400">אין לך הזמנה פעילה כרגע</p>
    </div>`;
    return;
  }

  const chip = b.status === 'approved'
    ? '<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">מאושרת ✅</span>'
    : '<span class="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">ממתינה לאישור ⏳</span>';

  const btns = [];
  if (b.can_reschedule) {
    btns.push(`<button id="btn-start-rs" class="flex-1 border-2 border-[#A67C8E] text-[#A67C8E] rounded-xl py-2 text-sm font-semibold hover:bg-[#A67C8E]/5 transition-colors">📅 שני תאריך</button>`);
  }
  if (b.can_cancel) {
    btns.push(`<button id="btn-open-cancel" class="flex-1 border border-gray-200 text-gray-400 rounded-xl py-2 text-sm hover:border-red-200 hover:text-red-400 transition-colors">ביטול</button>`);
  }
  if (!b.can_cancel && !b.can_reschedule) {
    btns.push(`<a href="https://wa.me/972547686865" target="_blank" rel="noopener"
      class="flex-1 text-center bg-green-500 text-white rounded-xl py-2 text-sm font-semibold hover:opacity-90 transition-opacity">💬 WhatsApp</a>`);
  }

  const rsNote = b.reschedule_count >= 1
    ? '<p class="text-xs text-gray-400 mt-1">שינוי תאריך כבר בוצע — לשינוי נוסף פני למיטל ישירות</p>' : '';

  el.innerHTML = `
    <div class="bg-white rounded-2xl p-5 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <span class="font-bold text-[#A67C8E]">ההזמנה שלך</span>
        ${chip}
      </div>
      <div class="space-y-1.5 text-sm text-gray-700 mb-4">
        <p>💅 <strong>${sanitize(b.serviceName)}</strong></p>
        <p>📅 ${fmtDate(b.date)}</p>
        <p>🕐 ${sanitize(b.time)}</p>
      </div>
      ${rsNote}
      <div class="flex gap-2 mt-3">${btns.join('')}</div>
    </div>`;

  document.getElementById('btn-start-rs')?.addEventListener('click', startReschedule);
  document.getElementById('btn-open-cancel')?.addEventListener('click', openCancel);
}

function renderHistory() {
  const el = document.getElementById('history-section');
  if (!el) return;
  if (!State.history.length) { el.innerHTML = ''; return; }
  const rows = State.history.map(h => `
    <div class="flex justify-between items-center py-2.5 border-b border-gray-50 last:border-0">
      <div>
        <p class="text-sm font-medium text-gray-700">${sanitize(h.serviceName)}</p>
        <p class="text-xs text-gray-400">${fmtDate(h.date)} · ${sanitize(h.time)}</p>
      </div>
      <span class="text-xs text-gray-400 mr-2">${STATUS_LABELS[h.status] ?? h.status}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="bg-white rounded-2xl px-4 py-3 shadow-sm">
      <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">היסטוריה</p>
      ${rows}
    </div>`;
}

// ── Cancel modal ──────────────────────────────────────────────────────────────

function openCancel() {
  document.getElementById('modal-cancel').hidden = false;
}
function closeCancel() {
  document.getElementById('modal-cancel').hidden = true;
}

async function confirmCancel() {
  const b = State.activeBooking;
  if (!b) return;
  closeCancel();
  setLoad('btn-open-cancel', true);
  try {
    const r = await post('client-cancel', { booking_id: b.id }, true);
    if (r.success) {
      toast('ההזמנה בוטלה בהצלחה');
      await loadPortal();
    } else {
      if (r.error === 'invalid_or_expired_token' || r.error === 'missing_token') {
        sessionStorage.removeItem(SESSION_KEY);
        show('screen-phone');
        toast('פג תוקף הכניסה — הכניסי מספר שוב', true);
        return;
      }
      const msg = r.error === 'too_late_to_cancel'
        ? 'לא ניתן לבטל — פחות מ-48 שעות לטיפול. פני למיטל ישירות.'
        : 'שגיאה בביטול — נסי שוב';
      toast(msg, true);
    }
  } catch { toast('בעיית תקשורת — נסי שוב', true); }
}

// ── Reschedule ────────────────────────────────────────────────────────────────

async function startReschedule() {
  const now = new Date();
  State.rsYear  = now.getFullYear();
  State.rsMonth = now.getMonth() + 1;
  State.rsDate  = null;
  State.rsTime  = null;
  const confirmBtn = document.getElementById('btn-confirm-reschedule');
  if (confirmBtn) confirmBtn.disabled = true;
  show('screen-reschedule');
  await loadRsMonth(State.rsYear, State.rsMonth);
}

async function loadRsMonth(year, month) {
  document.getElementById('rs-month-label').textContent = `${HE_MONTHS[month-1]} ${year}`;
  const key = `${year}-${String(month).padStart(2,'0')}`;
  if (State.rsSlots[key] !== undefined) { renderRsCal(); return; }
  const service = State.activeBooking?.service ?? 'gel_hands';
  const r = await get('get-slots', { year, month, service });
  if (r.slots) Object.assign(State.rsSlots, r.slots);
  renderRsCal();
}

function renderRsCal() {
  const y = State.rsYear, m = State.rsMonth;
  document.getElementById('rs-month-label').textContent = `${HE_MONTHS[m-1]} ${y}`;
  const grid = document.getElementById('rs-calendar-grid');
  if (!grid) return;

  const firstDow    = new Date(y, m-1, 1).getDay();   // 0=Sun
  const daysInMonth = new Date(y, m, 0).getDate();
  const today       = new Date(); today.setHours(0,0,0,0);
  const currentDate = State.activeBooking?.date;

  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate = new Date(y, m-1, d);
    const hasSlots = !!(State.rsSlots[ds]?.length);
    const past    = dayDate < today;
    const isCur   = ds === currentDate;
    const isSel   = ds === State.rsDate;

    let cls = 'w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm ';
    if (past || isCur || !hasSlots) {
      cls += 'text-gray-200 cursor-default';
    } else if (isSel) {
      cls += 'bg-[#A67C8E] text-white font-bold cursor-pointer';
    } else {
      cls += 'text-gray-700 hover:bg-[#A67C8E]/10 cursor-pointer font-medium';
    }

    const dot = hasSlots && !past && !isCur ? '<div class="w-1 h-1 bg-[#DDC3A5] rounded-full mx-auto mt-0.5"></div>' : '';
    const onclick = (!past && !isCur && hasSlots) ? ` data-rs-date="${ds}"` : '';
    html += `<div class="text-center"><div class="${cls}"${onclick}>${d}</div>${dot}</div>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('[data-rs-date]').forEach(el => {
    el.addEventListener('click', () => selectRsDate(el.dataset.rsDate));
  });
}

function selectRsDate(ds) {
  State.rsDate = ds;
  State.rsTime = null;
  const confirmBtn = document.getElementById('btn-confirm-reschedule');
  if (confirmBtn) confirmBtn.disabled = true;
  renderRsCal();
  renderRsTimes();
  const timeSec = document.getElementById('rs-times-section');
  if (timeSec) timeSec.hidden = false;
}

function renderRsTimes() {
  const times = State.rsSlots[State.rsDate] ?? [];
  const el = document.getElementById('rs-times-grid');
  if (!el) return;
  el.innerHTML = times.map(t => {
    const sel = t === State.rsTime;
    return `<button data-rs-time="${t}" class="px-4 py-2 rounded-xl text-sm border-2 font-medium transition-all ${sel ? 'bg-[#A67C8E] text-white border-[#A67C8E]' : 'border-gray-200 text-gray-700 hover:border-[#A67C8E]'}">${t}</button>`;
  }).join('');
  el.querySelectorAll('[data-rs-time]').forEach(btn => {
    btn.addEventListener('click', () => selectRsTime(btn.dataset.rsTime));
  });
}

function selectRsTime(t) {
  State.rsTime = t;
  renderRsTimes();
  const btn = document.getElementById('btn-confirm-reschedule');
  if (btn) btn.disabled = false;
}

function changeRsMonth(delta) {
  State.rsMonth += delta;
  if (State.rsMonth > 12) { State.rsMonth = 1;  State.rsYear++; }
  if (State.rsMonth < 1)  { State.rsMonth = 12; State.rsYear--; }
  loadRsMonth(State.rsYear, State.rsMonth);
}

async function confirmReschedule() {
  const b = State.activeBooking;
  if (!b || !State.rsDate || !State.rsTime) return;
  const btn = document.getElementById('btn-confirm-reschedule');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  try {
    const r = await post('client-reschedule', { booking_id: b.id, new_date: State.rsDate, new_time: State.rsTime }, true);
    if (r.success) {
      toast(`✅ שינוי אושר! ${fmtDate(r.new_date)} ${r.new_time}`);
      State.rsSlots = {};
      await loadPortal();
      show('screen-dashboard');
    } else {
      if (r.error === 'invalid_or_expired_token' || r.error === 'missing_token') {
        sessionStorage.removeItem(SESSION_KEY);
        show('screen-phone');
        toast('פג תוקף הכניסה — הכניסי מספר שוב', true);
        return;
      }
      const msg = {
        reschedule_limit_reached: 'כבר ביצעת שינוי — לשינוי נוסף פני למיטל',
        too_late_to_reschedule:   'לא ניתן לשנות — פחות מ-48 שעות לטיפול',
        new_slot_not_available:   'החריץ נתפס בינתיים — בחרי שעה אחרת',
      }[r.error] ?? 'שגיאה — נסי שוב';
      toast(msg, true);
      if (btn) { btn.disabled = false; btn.textContent = 'אשרי שינוי תאריך'; }
    }
  } catch {
    toast('בעיית תקשורת — נסי שוב', true);
    if (btn) { btn.disabled = false; btn.textContent = 'אשרי שינוי תאריך'; }
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  // Phone screen
  document.getElementById('btn-send-otp')?.addEventListener('click', sendOtp);
  document.getElementById('inp-phone')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendOtp(); });

  // OTP screen
  document.getElementById('btn-verify-otp')?.addEventListener('click', verifyOtp);
  document.getElementById('inp-otp')?.addEventListener('keydown', e => { if (e.key === 'Enter') verifyOtp(); });
  document.getElementById('btn-resend-otp')?.addEventListener('click', async () => {
    const inp = document.getElementById('inp-otp');
    if (inp) inp.value = '';
    await sendOtp();
  });
  document.getElementById('btn-back-phone')?.addEventListener('click', () => {
    clearInterval(State.resendTimer);
    show('screen-phone');
  });

  // Cancel modal
  document.getElementById('modal-cancel-backdrop')?.addEventListener('click', closeCancel);
  document.getElementById('modal-btn-close')?.addEventListener('click', closeCancel);
  document.getElementById('modal-btn-reschedule')?.addEventListener('click', () => {
    closeCancel();
    startReschedule();
  });
  document.getElementById('modal-btn-confirm-cancel')?.addEventListener('click', confirmCancel);

  // Reschedule screen
  document.getElementById('btn-back-dashboard')?.addEventListener('click', () => show('screen-dashboard'));
  document.getElementById('rs-btn-prev')?.addEventListener('click', () => changeRsMonth(-1));
  document.getElementById('rs-btn-next')?.addEventListener('click', () => changeRsMonth(1));
  document.getElementById('btn-confirm-reschedule')?.addEventListener('click', confirmReschedule);

  // Auto-load if token already in session
  if (tok()) {
    loadPortal()
      .then(() => show('screen-dashboard'))
      .catch(() => { sessionStorage.removeItem(SESSION_KEY); });
  }
}

document.addEventListener('DOMContentLoaded', init);
