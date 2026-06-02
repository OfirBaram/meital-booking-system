'use strict';

import APP_CONFIG from './config.js';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const CONFIG = {
  TIMEZONE: 'Asia/Jerusalem',
  OTP_LENGTH: 6,
  OTP_RESEND_SECS: 60,
  LS_PREFIX: 'meital_',
};

const SERVICES = [
  {
    id: 'gel_classic',
    name: "לק ג'ל קלאסי",
    desc: "ציפוי ג'ל מושלם — צבע מלא, פרנץ' או ombre לפי בחירה",
    duration: 90,
    icon: '✨',
  },
  {
    id: 'gel_feet',
    name: "לק ג'ל + רגליים",
    desc: "טיפול ג'ל מלא לידיים ולרגליים",
    duration: 120,
    icon: '🌸',
  },
];

const HE_MONTHS = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];
const HE_DAYS_SHORT = ["א'","ב'","ג'","ד'","ה'","ו'","ש'"];
const HE_DAYS_FULL  = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

const STEP_LABELS = [
  'בחירת שירות',
  'תאריך ושעה',
  'פרטים אישיים',
  'אימות SMS',
];

// ═══════════════════════════════════════════════════
// APPLICATION STATE
// ═══════════════════════════════════════════════════

/**
 * @typedef {{
 *   step: 1|2|3|4|5,
 *   service: string|null,
 *   date: string|null,
 *   time: string|null,
 *   slotId: string|null,
 *   name: string,
 *   phone: string,
 *   bookingId: string|null,
 *   calMonth: Date|null,
 *   slots: Record<string, string[]>,
 *   loading: boolean,
 *   prefetchedMonths: Set<string>,
 *   otpCooldownUntil: number
 * }} AppState
 */

/** @type {AppState} */
const State = {
  step: 1,
  service: null,
  date: null,
  time: null,
  slotId: null,
  name: '',
  phone: '',
  bookingId: null,
  calMonth: null,
  slots: {},
  loading: false,
  prefetchedMonths: new Set(),
  otpCooldownUntil: 0,
};

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

function uuid4() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function _jerusalemOffset(date) {
  // Use Intl to resolve the real UTC offset for the given instant (DST-aware).
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  const tz = (parts.find(p => p.type === 'timeZoneName') || {}).value || '';
  const m  = tz.match(/GMT([+-])(\d+)/);
  if (!m) return '+03:00'; // safe fallback
  return `${m[1]}${m[2].padStart(2, '0')}:00`;
}

function toISO8601Jerusalem(dateStr, timeStr) {
  const d      = new Date(`${dateStr}T${timeStr}:00`);
  const offset = _jerusalemOffset(d);
  return {
    local:    `${dateStr}T${timeStr}:00`,
    timezone: CONFIG.TIMEZONE,
    tagged:   `${dateStr}T${timeStr}:00${offset}`,
  };
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function formatDateHe(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return `יום ${HE_DAYS_FULL[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatPhone(raw) {
  const d = raw.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0,3)}-${d.slice(3)}` : raw;
}

function isValidPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  return /^05[0-9]{8}$/.test(digits);
}

function isValidName(n) {
  return n.trim().length >= 2;
}

const _ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
function sanitize(str) {
  return String(str).replace(/[<>&"']/g, c => _ESC[c]).slice(0, 200);
}

function today0() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ═══════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════

const LS = {
  get(k) {
    try { const v = localStorage.getItem(CONFIG.LS_PREFIX + k); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(CONFIG.LS_PREFIX + k, JSON.stringify(v)); }
    catch { /* quota exceeded */ }
  },
  del(k) {
    try { localStorage.removeItem(CONFIG.LS_PREFIX + k); }
    catch { /* ignore */ }
  },
};

// ═══════════════════════════════════════════════════
// API LAYER
// ═══════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('הבקשה ארכה יותר מדי. נסי שוב.');
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

async function apiGetSlots(year, month) {
  if (APP_CONFIG.SUPABASE_URL && !APP_CONFIG.IS_MOCK_MODE) {
    const r = await fetchWithTimeout(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/get-slots?year=${year}&month=${month}`,
      { headers: { 'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}` } }
    );
    return r.json();
  }
  return mockSlots(year, month);
}

// Converts any Israeli mobile format to E.164 before sending to the backend.
// State.phone is stored as digits-only (e.g. "0542290881"); the backend
// normalizePhone() already handles both formats, but sending E.164 from the
// frontend makes the wire format unambiguous and easier to read in logs.
function toE164(digits) {
  const d = (digits || '').replace(/\D/g, '');
  if (d.startsWith('972') && d.length === 12) return '+' + d;
  if (d.startsWith('05')  && d.length === 10)  return '+972' + d.slice(1);
  return digits; // pass through unchanged if format is unrecognised
}

async function apiSendOTP(phone) {
  if (APP_CONFIG.SUPABASE_URL && !APP_CONFIG.IS_MOCK_MODE) {
    const r = await fetchWithTimeout(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/send-otp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ phone: toE164(phone) }),
      }
    );
    return r.json();
  }
  return { success: true };
}

async function apiVerifyAndBook(otp) {
  if (APP_CONFIG.SUPABASE_URL && !APP_CONFIG.IS_MOCK_MODE) {
    const r = await fetchWithTimeout(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/verify-and-book`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          otp,
          booking: {
            id:          State.bookingId,
            name:        State.name,
            phone:       toE164(State.phone),
            service:     State.service.id,
            serviceName: State.service.name,
            date:        State.date,
            time:        State.time,
            duration:    State.service.duration,
          },
        }),
      }
    );
    return r.json();
  }

  await delay(750);
  if (otp === '000000') return { success: false, error: 'invalid_otp' };
  return { success: true, bookingId: State.bookingId, status: 'Pending' };
}

function mockSlots(year, month) {
  const slots = {};
  const floor = today0();
  const days  = new Date(year, month, 0).getDate();
  const BASE  = ['09:00','10:30','12:00','13:30','15:00','16:30'];

  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month - 1, d);
    const dow = date.getDay();
    if (date < floor || dow === 5 || dow === 6) continue;
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const avail = BASE.filter(() => Math.random() > 0.38);
    if (avail.length) slots[key] = avail;
  }
  return { success: true, slots };
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════
// RENDER — PROGRESS BAR
// ═══════════════════════════════════════════════════

function renderProgress() {
  const { step } = State;
  const progEl = document.getElementById('js-progress');
  if (step === 5) { progEl.classList.add('hidden'); return; }
  progEl.classList.remove('hidden');

  let html = '';
  STEP_LABELS.forEach((lbl, i) => {
    const n = i + 1, done = n < step, curr = n === step;
    html += `<div class="flex flex-col items-center shrink-0" data-qa="step-indicator-${n}">`;
    if (done) {
      html += `<div class="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-sm transition-all">
        <svg class="w-3.5 h-3.5" fill="none" stroke="white" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
      </div>
      <span class="text-[10px] font-medium text-primary/80 mt-1.5 leading-none whitespace-nowrap">${lbl}</span>`;
    } else if (curr) {
      html += `<div class="w-7 h-7 rounded-full bg-gradient-to-br from-[#C4A0B0] to-[#A67C8E] flex items-center justify-center shadow-md shadow-primary/30 ring-[3px] ring-cream transition-all">
        <span class="text-white font-bold text-[11px]">${n}</span>
      </div>
      <span class="text-[10px] font-semibold text-primary mt-1.5 leading-none whitespace-nowrap">${lbl}</span>`;
    } else {
      html += `<div class="w-7 h-7 rounded-full border border-secondary/70 bg-white flex items-center justify-center transition-all">
        <span class="text-[10px] font-medium text-text-muted/40">${n}</span>
      </div>
      <span class="text-[10px] font-medium text-text-muted/40 mt-1.5 leading-none whitespace-nowrap">${lbl}</span>`;
    }
    html += '</div>';
    if (i < STEP_LABELS.length - 1) {
      html += `<div class="flex-1 h-[1.5px] mt-3.5 mx-1.5 transition-all duration-500 ${done ? 'bg-primary/50' : 'bg-secondary/50'}"></div>`;
    }
  });

  document.getElementById('js-progress-steps').innerHTML = html;
  const labelEl = document.getElementById('js-progress-label');
  if (labelEl) labelEl.textContent = '';
}

// ═══════════════════════════════════════════════════
// RENDER — SERVICE CARDS
// ═══════════════════════════════════════════════════

function renderServices() {
  document.getElementById('js-services').innerHTML = SERVICES.map(s => `
    <button
      class="service-card text-right bg-white rounded-2xl p-4 shadow-sm w-full"
      data-id="${s.id}" data-qa="card-service-${s.id}"
    >
      <div class="flex items-start gap-3">
        <span class="text-2xl mt-0.5" aria-hidden="true">${s.icon}</span>
        <div class="flex-1">
          <div class="font-semibold text-text-main text-[15px] mb-1">${s.name}</div>
          <p class="text-text-muted text-xs font-light leading-relaxed">${s.desc}</p>
        </div>
      </div>
    </button>
  `).join('');

  document.getElementById('js-services').addEventListener('click', e => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    State.service = SERVICES.find(s => s.id === btn.dataset.id);
    document.querySelectorAll('[data-qa^="card-service"]').forEach(c =>
      c.classList.toggle('selected', c.dataset.id === btn.dataset.id));
    updateNav();
  });
}

// ═══════════════════════════════════════════════════
// RENDER — CALENDAR
// ═══════════════════════════════════════════════════

function renderDayHeaders() {
  document.getElementById('js-day-headers').innerHTML =
    HE_DAYS_SHORT.map(d => `<div class="text-center text-[11px] font-medium text-text-muted py-1">${d}</div>`).join('');
}

let _calMonthKey = ''; // cache key: avoids full DOM rebuild on same-month date picks

function renderCalendar() {
  const { calMonth, slots, date: selDate } = State;
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();
  const floor = today0();
  const monthKey = `${year}-${month}`;

  document.getElementById('js-month-label').textContent = `${HE_MONTHS[month]} ${year}`;

  // Same month -- patch selection only, no DOM rebuild
  if (_calMonthKey === monthKey) {
    const calEl = document.getElementById('js-calendar');
    calEl.querySelectorAll('.cal-day.selected').forEach(el => {
      el.classList.remove('selected');
      el.setAttribute('aria-pressed', 'false');
      const dot = el.querySelector('.dot-avail');
      if (dot) dot.removeAttribute('style');
    });
    if (selDate) {
      const selEl = calEl.querySelector(`[data-date="${selDate}"]`);
      if (selEl && !selEl.classList.contains('disabled')) {
        selEl.classList.add('selected');
        selEl.setAttribute('aria-pressed', 'true');
        const dot = selEl.querySelector('.dot-avail');
        if (dot) dot.style.background = 'white';
      }
    }
    return;
  }

  // Month changed -- full rebuild
  _calMonthKey = monthKey;
  const firstDow  = new Date(year, month, 1).getDay();
  const daysInMon = new Date(year, month + 1, 0).getDate();

  let html = '';
  for (let i = 0; i < firstDow; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMon; d++) {
    const date = new Date(year, month, d);
    const key  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const past = date < floor;
    const dow  = date.getDay();
    const fri  = dow === 5;
    const sat  = dow === 6;
    const has  = (slots[key] ?? []).length > 0;
    const sel  = selDate === key;
    const isToday = date.getTime() === floor.getTime();
    const disabled = past || fri || sat || !has;

    const cls = [
      'cal-day',
      disabled ? 'disabled' : 'avail',
      sel      ? 'selected' : '',
      isToday && !sel ? 'today-ring' : '',
    ].join(' ');

    html += `
      <div class="${cls}" data-date="${key}" data-qa="cal-day" role="button" tabindex="${disabled ? -1 : 0}"
           aria-label="${key}" aria-pressed="${sel}">
        <span>${d}</span>
        ${has && !disabled && !sel ? '<span class="dot-avail"></span>' : ''}
        ${sel ? '<span class="dot-avail" style="background:white"></span>' : ''}
      </div>`;
  }

  document.getElementById('js-calendar').innerHTML = html;

  // Empty-month notice
  let _emptyEl = document.getElementById('js-cal-empty');
  if (!_emptyEl) {
    _emptyEl = document.createElement('p');
    _emptyEl.id = 'js-cal-empty';
    _emptyEl.className = 'mt-4 text-center text-sm text-text-muted';
    _emptyEl.dir = 'rtl';
    _emptyEl.textContent = 'אין תורים פנויים לחודש זה, נסי חודש אחר';
    document.getElementById('js-cal-loading').insertAdjacentElement('beforebegin', _emptyEl);
  }
  _emptyEl.classList.toggle('hidden', html.includes('cal-day avail'));
}

function renderCalendarSkeleton() {
  document.getElementById('js-calendar').innerHTML =
    Array.from({ length: 35 }, () =>
      '<div class="cal-day disabled animate-pulse bg-secondary/30 rounded-lg"></div>'
    ).join('');
}

function _setCalendarLoading(on) {
  const el = document.getElementById('js-cal-loading');
  if (el) el.classList.toggle('hidden', !on);
}

async function loadMonthSlots(year, month) {
  const key = `${year}-${month}`;
  if (State.prefetchedMonths.has(key)) { renderCalendar(); return; }
  renderCalendarSkeleton();
  _setCalendarLoading(true);
  try {
    const res = await apiGetSlots(year, month);
    if (res.success) {
      State.slots = { ...State.slots, ...res.slots };
      State.prefetchedMonths.add(key);
    } else {
      toast('שגיאה בטעינת זמינות. נסי שוב.', 'error');
    }
  } catch (e) {
    toast(e.message.includes('ארכה') ? e.message : 'בעיית חיבור. נסי לרענן את הדף.', 'error');
  } finally {
    _setCalendarLoading(false);
  }
  renderCalendar();
}

// ═══════════════════════════════════════════════════
// RENDER — TIME SLOTS
// ═══════════════════════════════════════════════════

function renderSlots(dateKey) {
  const slotsWrap = document.getElementById('js-slots-wrap');
  const slotsGrid = document.getElementById('js-slots');
  const noSlots   = document.getElementById('js-no-slots');
  const times     = State.slots[dateKey] ?? [];

  if (!times.length) {
    slotsWrap.classList.add('hidden');
    noSlots.classList.remove('hidden');
    return;
  }
  noSlots.classList.add('hidden');
  slotsWrap.classList.remove('hidden');

  slotsGrid.innerHTML = times.map(t => {
    const time = typeof t === 'string' ? t : t.time;
    const id   = typeof t === 'string' ? '' : t.id;
    return `
    <div class="time-slot ${State.time === time ? 'selected' : ''}"
         data-time="${time}" data-slot-id="${id}" data-qa="slot-btn">
      <span class="font-semibold text-sm">${time}</span>
    </div>
  `;
  }).join('');
}

// ═══════════════════════════════════════════════════
// RENDER — OTP INPUTS
// ═══════════════════════════════════════════════════

function renderOTPInputs() {
  const wrap = document.getElementById('js-otp-inputs');
  wrap.innerHTML = Array.from({ length: CONFIG.OTP_LENGTH }, (_, i) => `
    <input
      class="otp-input"
      type="text"
      inputmode="numeric"
      pattern="[0-9]"
      maxlength="1"
      autocomplete="${i === 0 ? 'one-time-code' : 'off'}"
      data-idx="${i}" data-qa="otp-digit"
      aria-label="ספרה ${i + 1}"
    >
  `).join('');

  const inputs = wrap.querySelectorAll('.otp-input');

  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', e => {
      const digit = e.target.value.replace(/\D/g, '').slice(-1);
      e.target.value = digit;
      e.target.classList.toggle('filled', !!digit);
      e.target.classList.remove('error');
      if (digit && idx < inputs.length - 1) inputs[idx + 1].focus();
      if (getOTP().length === CONFIG.OTP_LENGTH) autoSubmitOTP();
    });

    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].focus();
        inputs[idx - 1].value = '';
        inputs[idx - 1].classList.remove('filled');
      }
      if (e.key === 'ArrowLeft'  && idx < inputs.length - 1) inputs[idx + 1].focus();
      if (e.key === 'ArrowRight' && idx > 0) inputs[idx - 1].focus();
    });

    inp.addEventListener('paste', e => {
      e.preventDefault();
      const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CONFIG.OTP_LENGTH);
      digits.split('').forEach((ch, i) => {
        if (inputs[i]) { inputs[i].value = ch; inputs[i].classList.add('filled'); }
      });
      if (digits.length === CONFIG.OTP_LENGTH) autoSubmitOTP();
      else if (inputs[digits.length]) inputs[digits.length].focus();
    });
  });

  setTimeout(() => inputs[0]?.focus(), 300);
}

function getOTP() {
  return Array.from(document.querySelectorAll('[data-qa="otp-digit"]')).map(i => i.value).join('');
}

function clearOTPInputs(markError = false) {
  document.querySelectorAll('[data-qa="otp-digit"]').forEach(i => {
    i.value = '';
    i.classList.remove('filled');
    if (markError) i.classList.add('error');
  });
  setTimeout(() => {
    document.querySelectorAll('[data-qa="otp-digit"]').forEach(i => i.classList.remove('error'));
    document.querySelector('[data-qa="otp-digit"][data-idx="0"]')?.focus();
  }, 400);
}

// ═══════════════════════════════════════════════════
// RENDER — CONFIRMATION
// ═══════════════════════════════════════════════════

function renderConfirmation() {
  const rows = [
    { label: 'שירות', value: sanitize(`${State.service.icon} ${State.service.name}`) },
    { label: 'תאריך', value: sanitize(formatDateHe(State.date)) },
    { label: 'שעה',   value: sanitize(State.time) },
    { label: 'לקוחה', value: sanitize(State.name) },
    { label: 'טלפון', value: sanitize(formatPhone(State.phone)) },
  ];

  document.getElementById('js-confirm-details').innerHTML = rows.map(r => `
    <div class="flex items-center justify-between" data-qa="confirm-row">
      <span class="text-text-muted text-xs font-medium">${r.label}</span>
      <span class="text-text-main text-sm font-semibold">${r.value}</span>
    </div>
  `).join('');

  // Demoted to a quiet reference line — a raw UUID is support metadata, not client UX.
  // Full UUID stays in the DOM for traceability (and the E2E gate that asserts it).
  document.getElementById('js-confirm-id').innerHTML = `
    <p class="text-[10px] text-text-muted/50 text-center font-light tracking-wide">
      אסמכתא: <span class="font-mono">${State.bookingId}</span>
    </p>
  `;

  document.getElementById('js-nav').classList.add('hidden');

  // A11y: move focus to the heading so screen-reader users are told the request
  // was sent (focus was on the now-hidden OTP box). preventScroll keeps showStep's
  // scroll-to-top intact.
  const heading = document.getElementById('js-confirm-heading');
  if (heading) heading.focus({ preventScroll: true });
}

// ═══════════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════════

function showStep(n) {
  [1,2,3,4,5].forEach(i => {
    const el = document.getElementById(`step-${i}`);
    if (!el) return;
    el.classList.toggle('hidden', i !== n);
    if (i === n) {
      el.style.animation = 'none';
      void el.offsetHeight;
      el.style.animation = '';
    }
  });
  State.step = n;
  renderProgress();
  updateNav();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNav() {
  const { step, service, date, time, name, phone } = State;
  const btnNext = document.getElementById('btn-next');
  const btnBack = document.getElementById('btn-back');

  btnBack.classList.toggle('hidden', step === 1 || step === 5);

  let ok = false;
  switch (step) {
    case 1: ok = !!service;                              btnNext.textContent = 'המשך';          break;
    case 2: ok = !!date && !!time;                       btnNext.textContent = 'המשך';          break;
    case 3: ok = isValidName(name) && isValidPhone(phone); btnNext.textContent = "שלחי קוד SMS"; break;
    case 4: ok = getOTP().length === CONFIG.OTP_LENGTH;  btnNext.textContent = 'אמתי';          break;
  }
  btnNext.disabled = !ok;
}

// ═══════════════════════════════════════════════════
// STEP HANDLERS
// ═══════════════════════════════════════════════════

async function handleNext() {
  const { step } = State;

  if (step === 1) {
    const now = new Date();
    State.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    showStep(2);
    document.getElementById('js-step2-service-label').textContent =
      `${State.service.icon} ${State.service.name}`;
    const year = now.getFullYear(), month = now.getMonth() + 1;
    if (State.prefetchedMonths.has(`${year}-${month}`)) {
      renderCalendar();
    } else {
      loadMonthSlots(year, month);
    }
  }

  else if (step === 2) {
    showStep(3);
    document.getElementById('js-step3-summary').textContent =
      `${State.service.icon} ${State.service.name} · ${formatDateHe(State.date)} · ${State.time}`;

    const saved = LS.get('client');
    if (saved?.name && saved?.phone) {
      document.getElementById('js-returning-banner').classList.remove('hidden');
      document.getElementById('js-returning-name').textContent = saved.name;
      document.getElementById('inp-name').value  = saved.name;
      document.getElementById('inp-phone').value = saved.phone;
      State.name  = saved.name;
      State.phone = saved.phone;
      updateNav();
    } else {
      document.getElementById('js-returning-banner').classList.add('hidden');
    }
  }

  else if (step === 3) {
    const cooldownLeft = State.otpCooldownUntil - Date.now();
    if (cooldownLeft > 0) {
      toast(`ניתן לשלוח קוד שוב בעוד ${Math.ceil(cooldownLeft / 1000)} שניות.`, 'error');
      return;
    }

    State.name  = document.getElementById('inp-name').value.trim();
    State.phone = document.getElementById('inp-phone').value.replace(/\D/g,'');
    State.bookingId = uuid4();
    LS.set('client', { name: State.name, phone: State.phone });

    setLoading(true);
    let res;
    try {
      res = await apiSendOTP(State.phone);
    } catch {
      setLoading(false);
      toast('שגיאת חיבור. בדקי את החיבור לאינטרנט ונסי שוב.', 'error');
      return;
    }
    setLoading(false);

    if (res.success || APP_CONFIG.IS_MOCK_MODE) {
      State.otpCooldownUntil = Date.now() + 30_000;
      showStep(4);
      document.getElementById('js-otp-phone').textContent =
        `קוד אימות נשלח למספר ${formatPhone(State.phone)}`;
      renderOTPInputs();
      startResendTimer();
    } else if (res.error === 'rate_limited') {
      const secs = res.retryAfter || 30;
      toast(`ניתן לשלוח קוד שוב בעוד ${secs} שניות.`, 'error');
    } else if (res.error === 'quota_exceeded') {
      toast('שירות השליחה אינו זמין כרגע. נסי שוב מאוחר יותר.', 'error');
    } else {
      toast('שגיאה בשליחת SMS. בדקי את המספר ונסי שוב.', 'error');
    }
  }

  else if (step === 4) {
    await submitOTP(getOTP());
  }
}

function handleBack() {
  const { step } = State;
  if (step <= 1 || step === 5) return;

  if (step === 4 && resendTimer) clearInterval(resendTimer);
  showStep(step - 1);

  if (step - 1 === 2) {
    renderCalendar();
    if (State.date) renderSlots(State.date);
  }
}

async function submitOTP(otp) {
  setLoading(true);
  let res;
  try {
    res = await apiVerifyAndBook(otp);
  } catch {
    setLoading(false);
    toast('שגיאת חיבור. נסי שוב בעוד מספר שניות.', 'error');
    return;
  }
  setLoading(false);

  if (res.success) {
    showStep(5);
    renderConfirmation();
  } else if (res.error === 'slot_not_available' || res.error === 'slot_not_found') {
    // Slot was taken, locked, or never existed — clear selection and send user back.
    toast('התור שבחרת כבר לא זמין. בחרי תאריך ושעה חדשים.', 'error');
    State.date            = null;
    State.time            = null;
    State.slotId          = null;
    State.slots           = {};           // clear stale cache so the unavailable slot disappears
    State.prefetchedMonths = new Set();
    setTimeout(() => {
      showStep(2);
      // Reload fresh availability so the user can't re-select the same gone slot
      if (State.calMonth) {
        loadMonthSlots(State.calMonth.getFullYear(), State.calMonth.getMonth() + 1);
      }
    }, 2500);
  } else {
    document.getElementById('js-otp-error').textContent = 'הקוד שגוי. בדקי ונסי שוב.';
    document.getElementById('js-otp-error').classList.remove('hidden');
    clearOTPInputs(true);
    setTimeout(() => document.getElementById('js-otp-error').classList.add('hidden'), 3500);
  }
}

async function autoSubmitOTP() {
  updateNav();
  await delay(200);
  const otp = getOTP();
  if (otp.length === CONFIG.OTP_LENGTH) await submitOTP(otp);
}

// ═══════════════════════════════════════════════════
// RESEND TIMER
// ═══════════════════════════════════════════════════

let resendTimer = null;

function startResendTimer() {
  const btn   = document.getElementById('js-resend');
  const timer = document.getElementById('js-resend-timer');
  let secs = CONFIG.OTP_RESEND_SECS;

  btn.disabled = true;
  timer.textContent = `(${secs}s)`;
  if (resendTimer) clearInterval(resendTimer);

  resendTimer = setInterval(() => {
    secs--;
    timer.textContent = `(${secs}s)`;
    if (secs <= 0) {
      clearInterval(resendTimer);
      btn.disabled = false;
      timer.textContent = '';
    }
  }, 1000);
}

// ═══════════════════════════════════════════════════
// LOADING STATE
// ═══════════════════════════════════════════════════

function setLoading(on) {
  State.loading = on;
  const btn = document.getElementById('btn-next');
  if (on) {
    btn.innerHTML = `
      <svg class="spinner w-5 h-5 mx-auto" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity=".25"/>
        <path fill="currentColor" opacity=".75" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"/>
      </svg>`;
    btn.disabled = true;
  } else {
    updateNav();
  }
}

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  const bg  = type === 'error' ? 'bg-red-50 border-red-200 text-red-700'
             : 'bg-white border-secondary/40 text-text-main';
  el.className = `pointer-events-auto ${bg} border rounded-xl px-4 py-3 text-sm font-medium text-center shadow-md mb-2 transition-all`;
  el.textContent = msg;
  const wrap = document.getElementById('js-toast');
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ═══════════════════════════════════════════════════
// LEGAL MODAL
// ═══════════════════════════════════════════════════

const LEGAL_CONTENT = {
  privacy: {
    title: 'מדיניות פרטיות',
    html: `
      <p class="font-semibold text-text-muted text-xs uppercase tracking-widest mb-1">עדכון אחרון: מאי 2025</p>
      <p>סטודיו <strong>מיטל שבע ברעם — לק ג'ל בוטק</strong> מחויב לשמירה על פרטיות לקוחותיו.</p>
      <h3 class="font-semibold mt-3">מידע שנאסף</h3>
      <p>האתר אוסף <strong>שם מלא ומספר טלפון בלבד</strong>, לצורך תיאום תורים. המידע אינו משמש למטרות שיווקיות ואינו מועבר לצדדים שלישיים — למעט שירות SMS (Twilio) לאימות זהות בתהליך ההזמנה.</p>
      <h3 class="font-semibold mt-3">אחסון המידע</h3>
      <p>פרטי ההזמנות נשמרים במסד נתונים מאובטח (Supabase), הנגיש לבעלת הסטודיו בלבד. המידע נשמר לתקופה הדרושה לצרכים תפעוליים.</p>
      <h3 class="font-semibold mt-3">זכויות המשתמש</h3>
      <p>ניתן לבקש עיון, תיקון או מחיקה של המידע האישי בכל עת בפנייה ישירה:</p>
      <a href="mailto:meital_sheva7@hotmail.com" class="text-primary underline underline-offset-2">meital_sheva7@hotmail.com</a>
    `,
  },
  accessibility: {
    title: 'הצהרת נגישות',
    html: `
      <p class="font-semibold text-text-muted text-xs uppercase tracking-widest mb-1">עדכון אחרון: מאי 2025</p>
      <p>סטודיו <strong>מיטל שבע ברעם</strong> פועל להנגשת האתר בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות ולתקן WCAG 2.1 ברמה AA.</p>
      <h3 class="font-semibold mt-3">מאפיינים קיימים</h3>
      <ul class="space-y-1.5 list-none">
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>ניווט מלא במקלדת ו-Tab</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תגי ARIA לכל הרכיבים האינטראקטיביים</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תמיכה בקוראי מסך (Screen Readers)</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>יחס ניגוד צבעים עומד בתקן AA</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>ממשק RTL מלא (עברית)</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תמיכה בהגדלת טקסט עד 200%</li>
      </ul>
      <h3 class="font-semibold mt-3">פנייה בנושא נגישות</h3>
      <p>נתקלת בחסם? נשמח לסייע:</p>
      <a href="mailto:meital_sheva7@hotmail.com" class="text-primary underline underline-offset-2">meital_sheva7@hotmail.com</a>
    `,
  },
};

let _modalTrigger = null;

function openModal(key) {
  const content = LEGAL_CONTENT[key];
  if (!content) return;
  document.getElementById('js-modal-title').textContent = content.title;
  document.getElementById('js-modal-body').innerHTML   = content.html;
  const modal = document.getElementById('js-modal');
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('js-modal-close').focus(), 50);
}

function closeModal() {
  const modal = document.getElementById('js-modal');
  modal.classList.add('hidden');
  modal.style.display = '';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (_modalTrigger) { _modalTrigger.focus(); _modalTrigger = null; }
}

function isModalOpen() {
  const el = document.getElementById('js-modal');
  return el ? !el.classList.contains('hidden') : false;
}

function setupModalListeners() {
  document.getElementById('js-modal-close').addEventListener('click', closeModal);
  document.getElementById('js-modal-backdrop').addEventListener('click', closeModal);

  document.getElementById('js-open-privacy').addEventListener('click', e => {
    _modalTrigger = e.currentTarget;
    openModal('privacy');
  });
  document.getElementById('js-open-accessibility').addEventListener('click', e => {
    _modalTrigger = e.currentTarget;
    openModal('accessibility');
  });

  // Esc closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isModalOpen()) closeModal();
  });

  // Focus trap: cycle Tab within the modal panel
  document.getElementById('js-modal').addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isModalOpen()) return;
    const panel     = document.getElementById('js-modal-panel');
    const focusable = [...panel.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}
// ═══════════════════════════════════════════════════
// FORM VALIDATION (live)
// ═══════════════════════════════════════════════════

function setupFormListeners() {
  const nameInp  = document.getElementById('inp-name');
  const phoneInp = document.getElementById('inp-phone');

  nameInp.addEventListener('input', () => {
    State.name = nameInp.value.trim();
    updateNav();
  });

  phoneInp.addEventListener('input', () => {
    let v = phoneInp.value.replace(/\D/g,'').slice(0,10);
    phoneInp.value = v;
    State.phone = v;
    updateNav();

    const valid = v.length === 10 && isValidPhone(v);
    phoneInp.classList.toggle('border-green-400', valid);
    phoneInp.classList.toggle('border-red-300',   v.length === 10 && !valid);
    if (v.length < 10) { phoneInp.classList.remove('border-green-400','border-red-300'); }
  });
}

// ═══════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════

function wireEvents() {
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-back').addEventListener('click', handleBack);

  document.getElementById('js-prev-month').addEventListener('click', () => {
    const { calMonth } = State;
    const prev = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
    const floor = new Date(today0().getFullYear(), today0().getMonth(), 1);
    if (prev < floor) return;
    State.calMonth = prev;
    loadMonthSlots(prev.getFullYear(), prev.getMonth() + 1);
  });

  document.getElementById('js-next-month').addEventListener('click', () => {
    const { calMonth } = State;
    const next = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    State.calMonth = next;
    loadMonthSlots(next.getFullYear(), next.getMonth() + 1);
  });

  document.getElementById('js-calendar').addEventListener('click', e => {
    const day = e.target.closest('[data-date]');
    if (!day || day.classList.contains('disabled')) return;
    State.date   = day.dataset.date;
    State.time   = null;
    State.slotId = null;
    renderCalendar();
    renderSlots(State.date);
    updateNav();
  });

  document.getElementById('js-slots').addEventListener('click', e => {
    const slot = e.target.closest('[data-time]');
    if (!slot) return;
    State.time   = slot.dataset.time;
    State.slotId = slot.dataset.slotId ? parseInt(slot.dataset.slotId, 10) : null;
    renderSlots(State.date);
    updateNav();
  });

  document.getElementById('js-resend').addEventListener('click', async () => {
    setLoading(true);
    let res;
    try {
      res = await apiSendOTP(State.phone);
    } catch {
      setLoading(false);
      toast('שגיאת חיבור בשליחת הקוד. נסי שוב.', 'error');
      return;
    }
    setLoading(false);
    if (res.success || APP_CONFIG.IS_MOCK_MODE) {
      clearOTPInputs();
      document.getElementById('js-otp-error').classList.add('hidden');
      startResendTimer();
      toast('קוד חדש נשלח 📲');
    } else if (res.error === 'rate_limited') {
      const secs = res.retryAfter || 30;
      toast(`ניתן לשלוח קוד שוב בעוד ${secs} שניות.`, 'error');
    } else if (res.error === 'quota_exceeded') {
      toast('שירות השליחה אינו זמין כרגע. נסי שוב מאוחר יותר.', 'error');
    } else {
      toast('שגיאה בשליחת SMS. בדקי את המספר ונסי שוב.', 'error');
    }
  });

  document.getElementById('js-not-me').addEventListener('click', () => {
    LS.del('client');
    document.getElementById('inp-name').value  = '';
    document.getElementById('inp-phone').value = '';
    State.name  = '';
    State.phone = '';
    document.getElementById('js-returning-banner').classList.add('hidden');
    document.getElementById('inp-name').focus();
    updateNav();
  });
}

// resetApp — start a fresh booking. The "book another" button was removed from
// the pending-confirmation screen (the WhatsApp CTA replaced it), so this is no
// longer wired to any control; kept for programmatic reuse / tests.
function resetApp() {
  State.service   = null;
  State.date      = null;
  State.time      = null;
  State.slotId    = null;
  State.name      = '';
  State.phone     = '';
  State.bookingId        = null;
  State.otpCooldownUntil = 0;

  document.getElementById('js-nav').classList.remove('hidden');
  document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
  showStep(1);
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════

async function prefetchSlots() {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const key   = `${year}-${month}`;
  if (State.prefetchedMonths.has(key)) return;
  try {
    const res = await apiGetSlots(year, month);
    if (res.success) {
      State.slots = { ...State.slots, ...res.slots };
      State.prefetchedMonths.add(key);
    }
  } catch { /* silent — calendar will load on demand */ }
}

function init() {
  if (APP_CONFIG.IS_MAINTENANCE_MODE) {
    document.getElementById('js-maintenance').classList.remove('hidden');
    return;
  }
  renderProgress();
  renderDayHeaders();
  renderServices();
  setupFormListeners();
  wireEvents();
  setupModalListeners();
  prefetchSlots();
}

document.addEventListener('DOMContentLoaded', init);
