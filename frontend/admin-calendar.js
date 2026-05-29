/**
 * admin-calendar.js — pure calendar module
 *
 * Exports:
 *   computeCalendarGrid(year, month, [_today])  → CalCell[]
 *   buildCalData(bookings)                       → CalData
 *   calDayStatus(entry)                          → { dots[], hasPendingOrApproved }
 *   formatCalTitle(year, month)                  → string
 *   renderCalendar(gridEl, titleEl, year, month, calData, [opts])
 *
 * Pure functions have zero DOM dependency and are directly importable in
 * Vitest (node environment).  renderCalendar is DOM-only and is covered by
 * E2E tests only.
 */

const MONTHS_HE = [
  'ינואר','פברואר','מרץ','אפריל','מאי','יוני',
  'יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר',
];

const DOT_CLS = {
  amber: 'bg-amber-400',
  green: 'bg-green-500',
  rose:  'bg-rose-400',
};

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * Compute a 35- or 42-cell calendar grid for the given year and 1-based month.
 * Week starts on Sunday (dow 0).  Cells outside the target month are marked
 * isOtherMonth.  Pass _today (YYYY-MM-DD) to override the real date for tests.
 *
 * @param {number} year
 * @param {number} month   1-based
 * @param {string} [_today] override for testing
 * @returns {Array<{dateStr, dayNum, isOtherMonth, isToday, isPast, isFriday, isSaturday}>}
 */
export function computeCalendarGrid(year, month, _today) {
  const today    = _today || _todayISO();
  const dow0     = new Date(year, month - 1, 1).getDay();     // dow of 1st
  const lastDay  = new Date(year, month, 0).getDate();        // days in month
  const total    = (dow0 + lastDay) > 35 ? 42 : 35;
  const startMs  = new Date(year, month - 1, 1 - dow0).getTime(); // first Sunday

  return Array.from({ length: total }, (_, i) => {
    const d   = new Date(startMs + i * 86_400_000);
    const y   = d.getFullYear();
    const mo  = d.getMonth() + 1;
    const da  = d.getDate();
    const ds  = y + '-' + String(mo).padStart(2,'0') + '-' + String(da).padStart(2,'0');
    const dow = d.getDay();
    return {
      dateStr:      ds,
      dayNum:       da,
      isOtherMonth: y !== year || mo !== month,
      isToday:      ds === today,
      isPast:       ds < today,
      isFriday:     dow === 5,
      isSaturday:   dow === 6,
    };
  });
}

/**
 * Group a flat bookings array by date and derive per-day flags.
 *
 * @param {Array}  bookings  from GAS listBookings
 * @param {Array}  [slots]   from admin-slots getSlots (marks hasFreeSlot / freeSlotCount)
 * @returns {Object}  { 'YYYY-MM-DD': { bookings[], hasPending, hasApproved, hasFreeSlot, freeSlotCount } }
 */
export function buildCalData(bookings, slots = []) {
  const out = {};
  const _e = d => { if (!out[d]) out[d] = { bookings: [], hasPending: false, hasApproved: false, hasFreeSlot: false, freeSlotCount: 0 }; };
  for (const b of (bookings || [])) {
    if (!b.date) continue;
    _e(b.date);
    out[b.date].bookings.push(b);
    if (b.status === 'Pending')  out[b.date].hasPending  = true;
    if (b.status === 'Approved') out[b.date].hasApproved = true;
  }
  for (const s of (slots || [])) {
    if (!s.date || s.status !== 'Available') continue;
    _e(s.date);
    out[s.date].hasFreeSlot = true;
    out[s.date].freeSlotCount++;
  }
  return out;
}

/**
 * Derive the dot indicators for a single calendar cell.
 *
 * @param {Object|null|undefined} entry  value from buildCalData output
 * @returns {{ dots: string[], hasPendingOrApproved: boolean, bookingCount: number }}
 */
export function calDayStatus(entry) {
  if (!entry) return { dots: [], hasPendingOrApproved: false, bookingCount: 0 };
  const dots = [];
  if (entry.hasPending)  dots.push('amber');
  if (entry.hasApproved) dots.push('green');
  if (entry.hasFreeSlot) dots.push('rose');
  return { dots, hasPendingOrApproved: entry.hasPending || entry.hasApproved, bookingCount: entry.bookings.length };
}

/**
 * Format a year + 1-based month as a Hebrew title string.
 * e.g. formatCalTitle(2026, 5) → 'מאי 2026'
 */
export function formatCalTitle(year, month) {
  return MONTHS_HE[month - 1] + ' ' + year;
}

// ─── DOM rendering (browser-only, not unit-tested) ────────────────────────────

/**
 * Render the calendar grid and update the month title element.
 * Uses DocumentFragment for a single reflow.
 *
 * @param {HTMLElement}  gridEl    #js-cal-grid
 * @param {HTMLElement}  titleEl   #js-cal-title
 * @param {number}       year
 * @param {number}       month     1-based
 * @param {Object}       calData   from buildCalData()
 * @param {Object}       [opts]    { onDayClick(dateStr, entry|null) }
 */
export function renderCalendar(gridEl, titleEl, year, month, calData, opts = {}) {
  if (titleEl) titleEl.textContent = formatCalTitle(year, month);
  if (!gridEl) return;

  const cells = computeCalendarGrid(year, month);
  const frag  = document.createDocumentFragment();

  cells.forEach(cell => {
    const entry             = calData[cell.dateStr] || null;
    const { dots, bookingCount } = calDayStatus(entry);
    const btn               = document.createElement('button');
    btn.dataset.date        = cell.dateStr;
    btn.setAttribute('aria-label', cell.dateStr);
    btn.className           = _cellClass(cell);
    btn.type                = 'button';

    const numSpan           = document.createElement('span');
    numSpan.className       = 'text-xs font-semibold leading-none';
    numSpan.textContent     = cell.dayNum;
    btn.appendChild(numSpan);

    if (!cell.isOtherMonth && dots.length > 0) {
      const dotsDiv = document.createElement('div');
      dotsDiv.className = 'cal-dots';
      if (bookingCount > 1) {
        // Multiple bookings: count badge replaces individual dots
        const countEl = document.createElement('span');
        countEl.className = 'text-[8px] font-black leading-none ' +
          ((entry && entry.hasPending) ? 'text-amber-500' : 'text-green-600');
        countEl.textContent = bookingCount;
        dotsDiv.appendChild(countEl);
      } else {
        // 0 or 1 booking: show booking dot (not rose)
        dots.filter(c => c !== 'rose').forEach(color => {
          const dot = document.createElement('div');
          dot.className = 'cal-dot ' + (DOT_CLS[color] || 'bg-gray-400');
          dotsDiv.appendChild(dot);
        });
      }
      // Rose dot always rendered separately (free slot indicator)
      if (dots.includes('rose')) {
        const roseDot = document.createElement('div');
        roseDot.className = 'cal-dot ' + DOT_CLS.rose;
        dotsDiv.appendChild(roseDot);
      }
      btn.appendChild(dotsDiv);
    }

    if (opts.onDayClick && !cell.isOtherMonth) {
      btn.addEventListener('click', () => opts.onDayClick(cell.dateStr, entry));
    }

    frag.appendChild(btn);
  });

  gridEl.innerHTML = '';
  gridEl.appendChild(frag);
  // Trigger column-staggered entrance animation
  gridEl.classList.remove('cal-entering');
  void gridEl.offsetWidth;
  gridEl.classList.add('cal-entering');
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function _cellClass(cell) {
  const parts = ['cal-cell'];
  if (cell.isOtherMonth)               parts.push('other-month');
  else if (cell.isToday)               parts.push('today');
  else if (cell.isPast)                parts.push('past');
  if (cell.isFriday || cell.isSaturday) parts.push('opacity-40 cursor-default');
  return parts.join(' ');
}

function _todayISO() {
  const n = new Date();
  return n.getFullYear() + '-'
    + String(n.getMonth() + 1).padStart(2, '0') + '-'
    + String(n.getDate()).padStart(2, '0');
}
