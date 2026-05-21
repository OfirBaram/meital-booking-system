"""Phase 1 skeleton patcher — admin.html + admin.js
Usage: python patch_skeleton.py <repo_root>
"""
import sys

if len(sys.argv) < 2:
    print('Usage: patch_skeleton.py <repo_root>')
    sys.exit(1)
ROOT = sys.argv[1].rstrip('/\\')

# ── 1. admin.js ───────────────────────────────────────────────────────────────
js_path = ROOT + '/frontend/admin.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

js = js.replace("  tab:      'bookings',", "  tab:      'calendar',", 1)
js = js.replace(
    "  ['bookings','pulse','slots','diary','clients'].forEach(t => {",
    "  ['calendar','bookings','pulse','slots','diary','clients'].forEach(t => {",
    1
)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
print('admin.js OK')

# ── 2. admin.html ─────────────────────────────────────────────────────────────
html_path = ROOT + '/frontend/admin.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

# ── 2a. CSS additions ─────────────────────────────────────────────────────────
NEW_CSS = """
    /* ── Bottom Sheet ──────────────────────────────────────────────────── */
    @keyframes sheetSlideUp   { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes sheetSlideDown { from { transform: translateY(0); }    to { transform: translateY(100%); } }
    @keyframes backdropFadeIn  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes backdropFadeOut { from { opacity: 1; } to { opacity: 0; } }
    .sheet-panel { will-change: transform; }
    .sheet-entering { animation: sheetSlideUp   0.32s cubic-bezier(0.32,0.72,0,1) both; }
    .sheet-exiting  { animation: sheetSlideDown 0.28s cubic-bezier(0.32,0.72,0,1) both; }
    .backdrop-in  { animation: backdropFadeIn  0.22s ease both; }
    .backdrop-out { animation: backdropFadeOut 0.22s ease both; }

    /* ── Calendar cells ─────────────────────────────────────────────────── */
    .cal-cell {
      aspect-ratio: 1/1; border-radius: 0.625rem; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 2px; cursor: pointer;
      min-height: 40px; position: relative; transition: background-color 0.1s;
      -webkit-tap-highlight-color: transparent; user-select: none;
    }
    .cal-cell:active       { transform: scale(0.86); transition: transform 0.07s; }
    .cal-cell.today        { background: #A67C8E; color: #fff; font-weight: 900; border-radius: 0.75rem; }
    .cal-cell.cal-selected { background: #F3EBF0; color: #A67C8E; font-weight: 700; }
    .cal-cell.other-month  { opacity: 0.22; pointer-events: none; }
    .cal-cell.past         { opacity: 0.42; }
    .cal-cell.blocked      { opacity: 0.28; pointer-events: none; }
    .cal-dots { display: flex; gap: 2px; justify-content: center; }
    .cal-dot  { width: 4px; height: 4px; border-radius: 50%; flex-shrink: 0; }

    /* ── Swipe cards ────────────────────────────────────────────────────── */
    .swipe-wrapper { position: relative; overflow: hidden; border-radius: 1rem; }
    .swipe-card {
      position: relative; will-change: transform; touch-action: pan-y;
      transition: transform 0.38s cubic-bezier(0.34,1.56,0.64,1);
    }
    .swipe-card.dragging { transition: none; }
    .swipe-reveal {
      position: absolute; inset: 0; display: flex; align-items: center;
      border-radius: 1rem; font-weight: 700; font-size: .875rem; color: #fff;
      padding: 0 1.25rem; opacity: 0; transition: opacity 0.12s; pointer-events: none;
    }
    .swipe-reveal.approve { background: #22c55e; justify-content: flex-end; }
    .swipe-reveal.reject  { background: #f87171; justify-content: flex-start; }

"""

html = html.replace(
    '    /* Bottom nav safe area */',
    NEW_CSS + '    /* Bottom nav safe area */',
    1
)
assert '/* Bottom nav safe area */' in html, 'CSS anchor not found'

# ── 2b. Calendar tab HTML (inserted before BOOKINGS tab) ──────────────────────
CALENDAR_TAB = """    <!-- ── TAB: CALENDAR (visual month view, default tab) ── -->
    <main id="tab-calendar" class="max-w-2xl mx-auto px-4 pt-3 pb-2">

      <!-- Month navigator -->
      <div class="flex items-center justify-between mb-3 px-1">
        <button id="js-cal-next" data-qa="btn-cal-next" aria-label="חודש הבא"
          class="w-9 h-9 flex items-center justify-center rounded-xl text-text-muted hover:text-primary hover:bg-cream active:scale-90 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 id="js-cal-title" class="text-base font-black text-text-main tracking-tight select-none">...</h2>
        <button id="js-cal-prev" data-qa="btn-cal-prev" aria-label="חודש קודם"
          class="w-9 h-9 flex items-center justify-center rounded-xl text-text-muted hover:text-primary hover:bg-cream active:scale-90 transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <!-- Day-of-week header (RTL: Sunday=rightmost, rendered first in DOM) -->
      <div class="grid grid-cols-7 mb-1 px-0.5 select-none">
        <div class="text-center text-[11px] font-semibold text-text-muted py-1">א</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1">ב</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1">ג</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1">ד</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1">ה</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1 opacity-40">ו</div>
        <div class="text-center text-[11px] font-semibold text-text-muted py-1 opacity-40">ש</div>
      </div>

      <!-- Calendar grid — populated by admin-calendar.js; 35 skeleton cells shown meanwhile -->
      <div id="js-cal-grid" class="grid grid-cols-7 gap-0.5 px-0.5">
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/10"></div>
        <div class="cal-cell animate-pulse bg-secondary/10"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/10"></div><div class="cal-cell animate-pulse bg-secondary/10"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/10"></div>
        <div class="cal-cell animate-pulse bg-secondary/10"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/10"></div><div class="cal-cell animate-pulse bg-secondary/10"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/20"></div>
        <div class="cal-cell animate-pulse bg-secondary/20"></div><div class="cal-cell animate-pulse bg-secondary/10"></div>
        <div class="cal-cell animate-pulse bg-secondary/10"></div>
      </div>

      <!-- Selected-day peek strip -->
      <div id="js-cal-peek" class="mt-3 bg-white rounded-2xl border border-secondary/30 shadow-sm overflow-hidden">
        <div class="px-4 py-3 flex items-center justify-between">
          <div id="js-cal-peek-date" class="text-xs font-bold text-text-muted uppercase tracking-widest">בחרי יום</div>
          <button id="js-cal-peek-add" data-qa="btn-cal-add-slot"
            class="hidden text-xs font-bold px-3 py-1.5 bg-primary text-white rounded-xl hover:bg-primary-dk active:scale-95 transition-all flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M12 4v16m8-8H4"/>
            </svg>
            הוסף שעה
          </button>
        </div>
        <div id="js-cal-peek-content" class="px-4 pb-3 text-xs text-text-muted">
          לחצי על יום בלוח השנה לצפייה בהזמנות
        </div>
      </div>
    </main>

"""

html = html.replace(
    '    <!-- ── TAB: BOOKINGS ── -->',
    CALENDAR_TAB + '    <!-- ── TAB: BOOKINGS ── -->',
    1
)
assert 'id="tab-calendar"' in html, 'calendar tab not inserted'

# ── 2c. Make tab-bookings hidden by default ───────────────────────────────────
html = html.replace(
    '    <main id="tab-bookings" class="max-w-2xl mx-auto px-4 pt-5">',
    '    <main id="tab-bookings" class="hidden max-w-2xl mx-auto px-4 pt-5">',
    1
)
assert 'id="tab-bookings" class="hidden' in html, 'tab-bookings not hidden'

# ── 2d. Bottom sheet overlay (inserted before the SMS modal) ──────────────────
SHEET_HTML = """
    <!-- ════ BOTTOM SHEET OVERLAY ════ -->
    <div id="js-sheet" class="fixed inset-0 z-50 hidden" role="dialog" aria-modal="true" aria-labelledby="js-sheet-title">
      <!-- Backdrop -->
      <div id="js-sheet-backdrop" class="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>

      <!-- Panel -->
      <div id="js-sheet-panel" class="sheet-panel absolute bottom-0 inset-x-0 max-w-2xl mx-auto bg-white rounded-t-3xl shadow-2xl flex flex-col"
           style="max-height:92vh;">

        <!-- Drag handle -->
        <div id="js-sheet-handle" class="pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing shrink-0 touch-none select-none">
          <div class="w-10 h-1 bg-secondary/60 rounded-full"></div>
        </div>

        <!-- Header -->
        <div class="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 id="js-sheet-title" class="font-black text-base text-text-main"></h3>
          <button id="js-sheet-close" data-qa="btn-sheet-close"
            class="w-8 h-8 flex items-center justify-center rounded-xl text-text-muted hover:text-primary hover:bg-cream active:scale-90 transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="h-px bg-secondary/20 shrink-0 mx-5"></div>

        <!-- Scrollable content -->
        <div id="js-sheet-content" class="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3"></div>

        <!-- Footer (action buttons, shown by JS) -->
        <div id="js-sheet-footer" class="hidden px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shrink-0 border-t border-secondary/20"></div>
      </div>
    </div>

"""

html = html.replace(
    '\n  <!-- ════ MANUAL SMS MODAL ════ -->',
    SHEET_HTML + '\n  <!-- ════ MANUAL SMS MODAL ════ -->',
    1
)
assert 'id="js-sheet"' in html, 'bottom sheet not inserted'

# ── 2e. Calendar nav button (first in nav, active by default) ─────────────────
# Make existing bookings button inactive
OLD_BOOKINGS_NAV = '        <button data-tab="bookings" data-qa="nav-tab-bookings"\n          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-primary transition-all">'
NEW_BOOKINGS_NAV = '        <button data-tab="bookings" data-qa="nav-tab-bookings"\n          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-text-muted transition-all">'
assert OLD_BOOKINGS_NAV in html, 'bookings nav not found'
html = html.replace(OLD_BOOKINGS_NAV, NEW_BOOKINGS_NAV, 1)

CAL_NAV = """        <button data-tab="calendar" data-qa="nav-tab-calendar"
          class="nav-tab flex-1 flex flex-col items-center gap-0.5 py-2.5 text-primary transition-all">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          <span class="text-[10px] font-bold">יומן</span>
        </button>
"""

html = html.replace(
    '        <button data-tab="bookings" data-qa="nav-tab-bookings"',
    CAL_NAV + '        <button data-tab="bookings" data-qa="nav-tab-bookings"',
    1
)
assert 'data-qa="nav-tab-calendar"' in html, 'calendar nav tab not inserted'

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print('admin.html OK')
print('All patches applied.')
