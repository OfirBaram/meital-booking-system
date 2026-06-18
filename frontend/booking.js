'use strict';

import APP_CONFIG from './config.js';
import { animate, spring, stagger } from './lib/motion.js';
import { trackEvent, identifyUser } from './lib/analytics.js';
import { fetchSiteConfig, applyTheme } from './site-config-client.js';

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const CONFIG = {
  TIMEZONE: 'Asia/Jerusalem',
  OTP_LENGTH: 6,
  OTP_RESEND_SECS: 60,
  LS_PREFIX: 'meital_',
};

// Static fallback — shown until get-site-config resolves, in mock mode,
// and if the network call fails. Mirrors the seeded `services` rows.
// Shape is normalised to the DB row shape (name_he / duration_min) via
// normalizeService() so render code has one contract.
const FALLBACK_SERVICES = [
  { id: 'gel_hands',    name_he: "לק ג'ל לציפורניים",            desc_he: "לק ג'ל מקצועי עם הכנת ציפורן, עיצוב ואפייה מושלמת. עמיד ל-3–4 שבועות.", duration_min: 60, icon: '💅', sort_order: 0 },
  { id: 'regular_feet', name_he: "לק רגיל לציפורניים ברגליים",  desc_he: "לק רגיל מקצועי לציפורניים ברגליים — מגוון צבעים רחב, תוצאה נקייה ומטופחת.", duration_min: 30, icon: '🦶', sort_order: 1 },
];

// Runtime catalog of selectable services (populated from get-site-config).
let CATALOG = FALLBACK_SERVICES.slice();

// ── Multi-service selection helpers ─────────────────────────────────
// State.services is an array of selected service rows. These derive the
// combined duration, the display summary, and the primary id everywhere.
function selectedDuration() {
  return State.services.reduce((sum, s) => sum + (s.duration_min || 0), 0);
}
function servicesSummary() {
  return State.services.map(s => `${s.icon} ${s.name_he}`).join(' + ');
}
function primaryServiceId() {
  return State.services.length ? State.services[0].id : null;
}

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
 *   services: Array<object>,
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
  services: [],          // selected service rows (multi-select, min 1)
  config: {},            // site_config map (texts; colours applied via CSS vars)
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
  _stepEntryTime: 0,
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

async function apiGetSlots(year, month, duration) {
  if (APP_CONFIG.SUPABASE_URL && !APP_CONFIG.IS_MOCK_MODE) {
    const durQs = (duration && duration > 0) ? `&duration=${duration}` : '';
    const r = await fetchWithTimeout(
      `${APP_CONFIG.SUPABASE_URL}/functions/v1/get-slots?year=${year}&month=${month}${durQs}`,
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

async function apiCheckActiveBooking(phone) {
  if (!APP_CONFIG.SUPABASE_URL || APP_CONFIG.IS_MOCK_MODE) return { active: false };
  const r = await fetchWithTimeout(
    `${APP_CONFIG.SUPABASE_URL}/functions/v1/check-active-booking`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APP_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ phone: toE164(phone) }),
    }
  );
  if (!r.ok) return { active: false };
  return r.json();
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
            id:           State.bookingId,
            name:         State.name,
            phone:        toE164(State.phone),
            service:      primaryServiceId(),          // primary id (backward compat)
            service_ids:  State.services.map(s => s.id),
            serviceName:  servicesSummary(),           // display summary
            date:         State.date,
            time:         State.time,
            duration:     selectedDuration(),          // combined duration
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
      html += `<div class="w-7 h-7 rounded-full bg-gradient-to-br from-primary-lt to-primary flex items-center justify-center shadow-md shadow-primary/30 ring-[3px] ring-cream transition-all">
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
  const wrap = document.getElementById('js-services');
  wrap.innerHTML = CATALOG.map(s => {
    const selected = State.services.some(x => x.id === s.id);
    const iconHtml = s.image_url
      ? `<img src="${sanitize(s.image_url)}" alt="" class="w-9 h-9 rounded-lg object-cover mt-0.5" />`
      : `<span class="text-2xl mt-0.5" aria-hidden="true">${sanitize(s.icon)}</span>`;
    const checkHtml = selected
      ? '<svg class="w-3.5 h-3.5" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>'
      : '';
    return `
    <button
      class="service-card text-right bg-white rounded-2xl p-4 shadow-sm w-full ${selected ? 'selected' : ''}"
      data-id="${sanitize(s.id)}" data-qa="card-service-${sanitize(s.id)}"
      aria-pressed="${selected ? 'true' : 'false'}"
    >
      <div class="flex items-start gap-3">
        ${iconHtml}
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-text-main text-[15px] mb-1">${sanitize(s.name_he)}</div>
          <p class="text-text-muted text-xs font-light leading-relaxed">${sanitize(s.desc_he)}</p>
          <span class="inline-block mt-1.5 text-[11px] font-medium text-primary/70">${Number(s.duration_min)} דק׳</span>
        </div>
        <span class="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selected ? 'bg-primary border-primary' : 'border-secondary'}" aria-hidden="true">${checkHtml}</span>
      </div>
    </button>`;
  }).join('');

  // Delegated click — attached once; survives innerHTML re-renders.
  if (!wrap._svcWired) {
    wrap._svcWired = true;
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-id]');
      if (btn) toggleService(btn.dataset.id);
    });
  }
  renderServiceSummary();
}

// Toggle a service in/out of the multi-select. Minimum-1 is enforced by
// updateNav (the Continue button stays disabled while nothing is chosen).
function toggleService(id) {
  const svc = CATALOG.find(x => x.id === id);
  if (!svc) return;
  const idx = State.services.findIndex(x => x.id === id);
  if (idx >= 0) State.services.splice(idx, 1);
  else          State.services.push(svc);

  trackEvent('service_selected', {
    service_id:     id,
    service_name:   svc.name_he,
    duration_min:   svc.duration_min,
    selected_count: State.services.length,
  });

  renderServices();
  updateNav();
  const fresh = document.querySelector(`[data-id="${id}"]`);
  if (fresh) animate(fresh, { scale: [0.97, 1.03, 1] }, { type: spring, stiffness: 500, damping: 18 });
}

// Live summary of the current selection shown beneath the service grid.
function renderServiceSummary() {
  let bar = document.getElementById('js-service-summary');
  if (!bar) {
    const step1 = document.getElementById('step-1');
    if (!step1) return;
    bar = document.createElement('div');
    bar.id = 'js-service-summary';
    bar.className = 'mt-4';
    bar.setAttribute('data-qa', 'service-summary');
    step1.appendChild(bar);
  }
  if (!State.services.length) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="flex items-center justify-between gap-3 rounded-2xl bg-primary/5 border border-primary/15 px-4 py-3">
      <span class="text-sm font-semibold text-text-main leading-snug">${sanitize(servicesSummary())}</span>
      <span class="text-xs font-bold text-primary whitespace-nowrap">${selectedDuration()} דק׳</span>
    </div>`;
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

  const _todayNowTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: CONFIG.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());

  let html = '';
  let hasAnyAvail = false;
  for (let i = 0; i < firstDow; i++) html += '<div></div>';

  for (let d = 1; d <= daysInMon; d++) {
    const date = new Date(year, month, d);
    const key  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const past = date < floor;
    const dow  = date.getDay();
    const fri  = dow === 5;
    const sat  = dow === 6;
    const isToday = date.getTime() === floor.getTime();
    const rawSlots = slots[key] ?? [];
    const slotCount = isToday
      ? rawSlots.filter(t => (typeof t === 'string' ? t : t.time) > _todayNowTime).length
      : rawSlots.length;
    const has = slotCount > 0;
    const sel  = selDate === key;
    const disabled = past || fri || sat || !has;
    if (!disabled) hasAnyAvail = true;
    const disabledReason = !disabled ? '' : past ? 'past' : (fri || sat) ? 'weekend' : 'no-slots';

    const cls = [
      'cal-day',
      disabled ? 'disabled' : 'avail',
      disabledReason,
      sel      ? 'selected' : '',
      isToday && !sel ? 'today-ring' : '',
    ].filter(Boolean).join(' ');

    html += `
      <div class="${cls}" data-date="${key}" data-qa="cal-day" role="button" tabindex="${disabled ? -1 : 0}"
           aria-label="${key}" aria-pressed="${sel}">
        <span>${d}</span>
        ${!disabled ? '<span class="dot-avail"></span>' : disabledReason === 'no-slots' ? '<span class="dot-no-slots"></span>' : ''}
      </div>`;
  }

  document.getElementById('js-calendar').innerHTML = html;
  // Staggered spring entrance for calendar day cells
  const _days = document.querySelectorAll('#js-calendar .cal-day');
  if (_days.length) {
    animate(_days, { opacity: [0, 1], scale: [0.88, 1] },
      { delay: stagger(0.015), type: spring, stiffness: 400, damping: 28 });
  }

  // Empty-month notice + next-available shortcut
  let _emptyEl = document.getElementById('js-cal-empty');
  if (!_emptyEl) {
    _emptyEl = document.createElement('div');
    _emptyEl.id = 'js-cal-empty';
    _emptyEl.className = 'mt-4 text-center';
    _emptyEl.dir = 'rtl';
    _emptyEl.innerHTML =
      '<p class="text-sm text-text-muted mb-2">אין תורים פנויים לחודש זה</p>'
      + '<button id="js-cal-next-avail" class="text-xs font-semibold text-primary hover:underline">← חפשי חודש קרוב יותר</button>';
    document.getElementById('js-cal-loading').insertAdjacentElement('beforebegin', _emptyEl);
    document.getElementById('js-cal-next-avail').addEventListener('click', () => {
      const next = new Date(State.calMonth.getFullYear(), State.calMonth.getMonth() + 1, 1);
      State.calMonth = next;
      loadMonthSlots(next.getFullYear(), next.getMonth() + 1);
    });
  }
  _emptyEl.classList.toggle('hidden', hasAnyAvail);
}

function renderCalendarSkeleton() {
  document.getElementById('js-calendar').innerHTML =
    Array.from({ length: 35 }, () =>
      '<div class="cal-day disabled skeleton-cell rounded-lg"></div>'
    ).join('');
}

function _setCalendarLoading(on) {
  const el = document.getElementById('js-cal-loading');
  if (el) el.classList.toggle('hidden', !on);
}

async function loadMonthSlots(year, month) {
  const _dur = selectedDuration();
  const key = `${year}-${month}-${_dur}`;
  if (State.prefetchedMonths.has(key)) { renderCalendar(); return; }
  renderCalendarSkeleton();
  _setCalendarLoading(true);
  try {
    const res = await apiGetSlots(year, month, _dur);
    if (res.success) {
      State.slots = { ...State.slots, ...res.slots };
      State.prefetchedMonths.add(key);
      const _mSlots = Object.entries(res.slots ?? {});
      const _mDays  = _mSlots.filter(([,s]) => s.length > 0).length;
      const _mTotal = _mSlots.reduce((sum,[,s]) => sum + s.length, 0);
      trackEvent('calendar_slots_loaded', {
        year, month,
        days_with_slots: _mDays,
        total_slot_count: _mTotal,
        has_availability: _mTotal > 0,
        months_browsed: State.prefetchedMonths.size,
        from_cache: false,
      });
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
  let times       = State.slots[dateKey] ?? [];

  // Filter out past times for today (handles stale prefetch cache)
  const _todayObj = today0();
  const todayKey = `${_todayObj.getFullYear()}-${String(_todayObj.getMonth()+1).padStart(2,'0')}-${String(_todayObj.getDate()).padStart(2,'0')}`;
  if (dateKey === todayKey) {
    const nowTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: CONFIG.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
    times = times.filter(t => (typeof t === 'string' ? t : t.time) > nowTime);
  }

  if (!times.length) {
    slotsWrap.classList.add('hidden');
    const allPast = dateKey === todayKey && (State.slots[dateKey] ?? []).length > 0;
    noSlots.textContent = allPast
      ? 'כל הזמנות היום עברו — בחרי תאריך אחר 📅'
      : 'אין זמנים זמינים לתאריך זה';
    noSlots.classList.remove('hidden');
    return;
  }
  noSlots.classList.add('hidden');
  slotsWrap.classList.remove('hidden');

  const _dur = selectedDuration() || 60;
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
      if (digits.length === CONFIG.OTP_LENGTH) { trackEvent('otp_pasted'); autoSubmitOTP(); }
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
  if (markError) {
    const wrap = document.getElementById('js-otp-inputs');
    animate(wrap, { x: [-6, 6, -4, 4, 0] }, { duration: 0.35, easing: 'ease-out' });
  }
  setTimeout(() => {
    document.querySelectorAll('[data-qa="otp-digit"]').forEach(i => i.classList.remove('error'));
    document.querySelector('[data-qa="otp-digit"][data-idx="0"]')?.focus();
  }, 400);
}

// ═══════════════════════════════════════════════════
// RENDER — CONFIRMATION
// ═══════════════════════════════════════════════════

function renderConfirmation() {
  const svcRows = State.services.map((svc, i) => ({
    label: i === 0 ? 'שירות' : '',
    value: sanitize(`${svc.icon} ${svc.name_he} (${svc.duration_min} דק׳)`),
  }));
  const rows = [
    ...svcRows,
    ...(State.services.length > 1
      ? [{ label: 'סה״כ זמן', value: sanitize(`${selectedDuration()} דק׳`) }]
      : []),
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

  // Short readable reference — first UUID segment (8 hex chars), uppercased.
  // Full UUID kept in a sr-only span so E2E tests (textContent regex) still match.
  const shortRef = State.bookingId.split('-')[0].toUpperCase();
  const confirmIdEl = document.getElementById('js-confirm-id');
  confirmIdEl.innerHTML = `
    <p class="text-[11px] text-text-muted/60 text-center font-medium tracking-wide">
      מס׳ הזמנה: <span class="font-mono font-bold text-text-muted">${shortRef}</span>
    </p>
    <span class="sr-only">${State.bookingId}</span>
  `;

  // Personalised heading — use first name (word before first space).
  const firstName = sanitize(State.name.split(' ')[0]);
  const heading = document.getElementById('js-confirm-heading');
  if (heading) heading.textContent = `הבקשה נשלחה, ${firstName}! 🌸`;

  // WhatsApp pre-filled message with booking details.
  const waText = [
    `שלום מיטל! קבעתי תור ✨`,
    `${servicesSummary()} (${selectedDuration()} דק׳)`,
    `📅 ${formatDateHe(State.date)} · 🕐 ${State.time}`,
    `אני ${State.name} (${formatPhone(State.phone)})`,
  ].join('\n');
  const waEl = document.getElementById('js-whatsapp');
  if (waEl) waEl.href = `https://api.whatsapp.com/send/?phone=972547686865&text=${encodeURIComponent(waText)}`;

  document.getElementById('js-nav').classList.add('hidden');

  // A11y: move focus to the heading.
  if (heading) heading.focus({ preventScroll: true });
}

// ═══════════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════════

function showStep(n) {
  const _STEP_NAMES = ['','service_selection','date_time','personal_info','otp_verify','confirmation'];
  const _prevStep = State.step;
  const _elapsed = State._stepEntryTime ? Math.round((Date.now() - State._stepEntryTime) / 1000) : 0;
  [1,2,3,4,5].forEach(i => {
    const el = document.getElementById(`step-${i}`);
    if (!el) return;
    el.classList.toggle('hidden', i !== n);
    if (i === n) {
      animate(el, { opacity: [0, 1], y: [16, 0] },
        { type: spring, stiffness: 300, damping: 25 });
    }
  });
  State.step = n;
  State._stepEntryTime = Date.now();
  trackEvent('wizard_step_viewed', {
    step: n,
    step_name: _STEP_NAMES[n],
    previous_step: _prevStep,
    time_on_previous_step_sec: _elapsed,
  });
  renderProgress();
  updateNav();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNav() {
  const { step, date, time, name, phone } = State;
  const btnNext = document.getElementById('btn-next');
  const btnBack = document.getElementById('btn-back');

  btnBack.classList.toggle('hidden', step === 1 || step === 5);

  let ok = false;
  switch (step) {
    case 1: ok = State.services.length >= 1;             btnNext.textContent = State.config.booking_continue_btn || 'המשך'; break;
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
    document.getElementById('js-step2-service-label').textContent = servicesSummary();
    const year = now.getFullYear(), month = now.getMonth() + 1;
    const _dur = selectedDuration();
    if (State.prefetchedMonths.has(`${year}-${month}-${_dur}`)) {
      renderCalendar();
      const _pfx = `${year}-${String(month).padStart(2,'0')}`;
      const _pfSlots = Object.entries(State.slots).filter(([k]) => k.startsWith(_pfx));
      const _pfDays  = _pfSlots.filter(([,s]) => s.length > 0).length;
      const _pfTotal = _pfSlots.reduce((sum,[,s]) => sum + s.length, 0);
      trackEvent('calendar_slots_loaded', {
        year, month,
        days_with_slots: _pfDays,
        total_slot_count: _pfTotal,
        has_availability: _pfTotal > 0,
        months_browsed: State.prefetchedMonths.size,
        from_cache: true,
      });
    } else {
      loadMonthSlots(year, month);
    }
  }

  else if (step === 2) {
    showStep(3);
    document.getElementById('js-step3-summary').textContent =
      `${servicesSummary()} · ${formatDateHe(State.date)} · ${State.time}`;

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
    let activeCheck = { active: false };
    try { activeCheck = await apiCheckActiveBooking(State.phone); } catch {}
    if (activeCheck.active) {
      setLoading(false);
      toast(`כבר קיים תור פעיל בתאריך ${activeCheck.date} בשעה ${activeCheck.time}. לשינוי או ביטול — צרי קשר.`, 'error');
      trackEvent('active_booking_blocked', { service_id: primaryServiceId(), date: State.date });
      return;
    }
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
      trackEvent('otp_requested', {
        service_id: primaryServiceId(),
        date:       State.date,
        time:       State.time,
      });
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
    identifyUser(State.phone);
    trackEvent('booking_completed', {
      booking_id:   State.bookingId,
      service_type: primaryServiceId(),
      service_id:   primaryServiceId(),
      service_name: servicesSummary(),
      duration_min: selectedDuration(),
      date:         State.date,
      time:         State.time,
    });
    showStep(5);
    renderConfirmation();
  } else if (res.error === 'slot_not_available' || res.error === 'slot_not_found') {
    // Slot was taken, locked, or never existed — clear selection and send user back.
    trackEvent('slot_conflict_detected', { service_id: primaryServiceId(), date: State.date, time: State.time });
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
    trackEvent('otp_failed');
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
      <p class="font-semibold text-text-muted text-xs uppercase tracking-widest mb-1">עדכון אחרון: יוני 2026</p>
      <p>סטודיו <strong>מיטל שבע ברעם — לק ג'ל בוטיק</strong> מחויב לשמירה על פרטיות לקוחותיו.</p>
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
      <p class="font-semibold text-text-muted text-xs uppercase tracking-widest mb-1">עדכון אחרון: יוני 2026</p>
      <p>סטודיו <strong>מיטל שבע ברעם</strong> פועל להנגשת האתר בהתאם לחוק שוויון זכויות לאנשים עם מוגבלות ולתקן WCAG 2.1 ברמה AA.</p>
      <h3 class="font-semibold mt-3">מאפיינים קיימים</h3>
      <ul class="space-y-1.5 list-none">
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>ניווט מלא במקלדת ו-Tab</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תגי ARIA לכל הרכיבים האינטראקטיביים</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תמיכה בקוראי מסך (Screen Readers)</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>יחס ניגוד צבעים עומד בתקן AA לטקסט גדול</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>ממשק RTL מלא (עברית)</li>
        <li class="flex gap-2"><span class="text-primary shrink-0">✓</span>תמיכה בהגדלת טקסט עד 200%</li>
      </ul>
      <h3 class="font-semibold mt-3">פנייה בנושא נגישות</h3>
      <p>נתקלת בחסם? אשמח לסייע:</p>
      <a href="mailto:meital_sheva7@hotmail.com" class="text-primary underline underline-offset-2">meital_sheva7@hotmail.com</a>
      <p class="mt-3 text-xs"><a href="./accessibility.html" class="text-primary underline underline-offset-2">להצהרת הנגישות המלאה &#x2192;</a></p>
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
  document.getElementById('js-open-accessibility').addEventListener('click', () => {
    window.location.href = './accessibility.html';
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
    trackEvent('calendar_month_changed', { direction: 'prev', year: prev.getFullYear(), month: prev.getMonth() + 1 });
    loadMonthSlots(prev.getFullYear(), prev.getMonth() + 1);
  });

  document.getElementById('js-next-month').addEventListener('click', () => {
    const { calMonth } = State;
    const next = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
    State.calMonth = next;
    trackEvent('calendar_month_changed', { direction: 'next', year: next.getFullYear(), month: next.getMonth() + 1 });
    loadMonthSlots(next.getFullYear(), next.getMonth() + 1);
  });

  document.getElementById('js-calendar').addEventListener('click', e => {
    const day = e.target.closest('[data-date]');
    if (!day || day.classList.contains('disabled')) return;
    State.date   = day.dataset.date;
    State.time   = null;
    State.slotId = null;
    trackEvent('date_selected', {
      date:            State.date,
      slots_available: (State.slots[State.date] ?? []).length,
    });
    renderCalendar();
    renderSlots(State.date);
    updateNav();
  });

  // Swipe left/right on the calendar grid to navigate months (mobile)
  let _swipeX = null, _swipeY = null;
  const _calEl = document.getElementById('js-calendar');
  _calEl.addEventListener('touchstart', e => {
    _swipeX = e.touches[0].clientX;
    _swipeY = e.touches[0].clientY;
  }, { passive: true });
  _calEl.addEventListener('touchend', e => {
    if (_swipeX === null) return;
    const dx = e.changedTouches[0].clientX - _swipeX;
    const dy = e.changedTouches[0].clientY - _swipeY;
    _swipeX = _swipeY = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    document.getElementById(dx < 0 ? 'js-next-month' : 'js-prev-month').click();
  }, { passive: true });

  document.getElementById('js-slots').addEventListener('click', e => {
    const slot = e.target.closest('[data-time]');
    if (!slot) return;
    State.time   = slot.dataset.time;
    State.slotId = slot.dataset.slotId ? parseInt(slot.dataset.slotId, 10) : null;
    trackEvent('time_selected', {
      time:       State.time,
      date:       State.date,
      service_id: primaryServiceId(),
    });
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
      trackEvent('otp_resent');
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
    trackEvent('returning_user_dismissed');
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
  State.services  = [];
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
  // Warm with the default 60-min duration (legacy get-slots ignores duration;
  // smart path re-fetches per real total via the duration-keyed cache).
  const _dur  = 60;
  const key   = `${year}-${month}-${_dur}`;
  if (State.prefetchedMonths.has(key)) return;
  try {
    const res = await apiGetSlots(year, month, _dur);
    if (res.success) {
      State.slots = { ...State.slots, ...res.slots };
      State.prefetchedMonths.add(key);
    }
  } catch { /* silent — calendar will load on demand */ }
}

async function init() {
  if (APP_CONFIG.IS_MAINTENANCE_MODE) {
    document.getElementById('js-maintenance').classList.remove('hidden');
    return;
  }
  renderProgress();
  renderDayHeaders();
  // Load live catalog + theme + texts before first render. Falls back to
  // FALLBACK_SERVICES + shipped defaults if the network call fails — the
  // page must never block on this.
  await loadSiteConfig();
  renderServices();
  applyTexts();
  trackEvent('wizard_started', { is_returning_user: !!LS.get('client') });
  setupFormListeners();
  wireEvents();
  setupModalListeners();
  prefetchSlots();
  applyURLPreset();
}

// Fetch services + config from get-site-config; apply colours immediately.
async function loadSiteConfig() {
  if (APP_CONFIG.IS_MOCK_MODE) return;
  const data = await fetchSiteConfig(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
  if (!data) return;
  if (Array.isArray(data.services) && data.services.length) CATALOG = data.services;
  State.config = data.config || {};
  applyTheme(State.config);
}

// Apply editable texts from site_config to the page chrome.
function applyTexts() {
  const c = State.config || {};
  const set = (sel, val) => { if (!val) return; const el = document.querySelector(sel); if (el) el.textContent = val; };
  set('#step-1 > h2', c.booking_step1_title);
  const note = document.getElementById('js-confirm-note');
  if (note && c.booking_confirm_note) note.textContent = c.booking_confirm_note;
}
function applyURLPreset() {
  var p      = new URLSearchParams(location.search);
  var svcId  = p.get('service');
  var date   = p.get('date');
  var time   = p.get('time');
  if (!svcId || !date || !time) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return;
  var svc = CATALOG.find(function(s) { return s.id === svcId; });
  if (!svc) return;
  State.services = [svc];
  State.date     = date;
  State.time     = time;
  var parts      = date.split('-').map(Number);
  State.calMonth = new Date(parts[0], parts[1] - 1, 1);
  renderServices();
  var lbl = document.getElementById('js-step2-service-label');
  if (lbl) lbl.textContent = servicesSummary();
  var summary = document.getElementById('js-step3-summary');
  if (summary) summary.textContent = servicesSummary() + ' · ' + formatDateHe(date) + ' · ' + time;
  var saved = LS.get('client');
  if (saved && saved.name && saved.phone) {
    var banner = document.getElementById('js-returning-banner');
    if (banner) banner.classList.remove('hidden');
    var nameEl = document.getElementById('js-returning-name');
    if (nameEl) nameEl.textContent = saved.name;
    var inpN = document.getElementById('inp-name');
    if (inpN) inpN.value = saved.name;
    var inpP = document.getElementById('inp-phone');
    if (inpP) inpP.value = saved.phone;
    State.name  = saved.name;
    State.phone = saved.phone;
  }
  showStep(3);
  loadMonthSlots(parts[0], parts[1]);
}


document.addEventListener('DOMContentLoaded', init);
