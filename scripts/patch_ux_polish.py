"""patch_ux_polish.py — add micro-interactions and polish animations
Usage: python patch_ux_polish.py <repo_root>

Changes:
  admin.html:
    1. Append UX-polish CSS to the <style> block
    2. Replace sheet handle inner div with sheet-handle-pill class

  admin.js:
    3. setTab() — restart tab-entering animation on target tab
    4. render()  — add cards-entering class after list rebuilds

  admin-calendar.js:
    5. renderCalendar() — add cal-entering class after grid rebuild
"""
import sys
if len(sys.argv) < 2:
    sys.exit('Usage: patch_ux_polish.py <repo_root>')

ROOT = sys.argv[1].rstrip('/\\')

# ============================================================
# 1+2. admin.html — CSS additions + sheet handle pill
# ============================================================
html_path = ROOT + '/frontend/admin.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

POLISH_CSS = """
    /* ── Tab content entrance ─────────────────────────────────────── */
    @keyframes tabIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
    main.tab-entering { animation: tabIn 0.18s ease-out both; }

    /* ── Staggered booking card entrance ──────────────────────────── */
    /* Suppress inner card-in while outer wrapper animates */
    .cards-entering .swipe-wrapper .card-in { animation: none; }
    .cards-entering .swipe-wrapper           { animation: cardIn 0.18s ease both; }
    .cards-entering .swipe-wrapper:nth-child(2) { animation-delay:  30ms; }
    .cards-entering .swipe-wrapper:nth-child(3) { animation-delay:  60ms; }
    .cards-entering .swipe-wrapper:nth-child(4) { animation-delay:  90ms; }
    .cards-entering .swipe-wrapper:nth-child(5) { animation-delay: 120ms; }
    .cards-entering .swipe-wrapper:nth-child(n+6) { animation-delay: 150ms; }
    /* Plain non-swipe cards (Rejected/Cancelled in history view) */
    .cards-entering > [data-booking]:nth-child(2) { animation-delay:  30ms; }
    .cards-entering > [data-booking]:nth-child(3) { animation-delay:  60ms; }
    .cards-entering > [data-booking]:nth-child(4) { animation-delay:  90ms; }
    .cards-entering > [data-booking]:nth-child(n+5) { animation-delay: 120ms; }

    /* ── Calendar month-change entrance ──────────────────────────── */
    @keyframes calCellIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
    /* Override todayPulse during entrance so cells share the same animation */
    .cal-entering .cal-cell,
    .cal-entering .cal-cell.today { animation: calCellIn 0.13s ease-out both; }
    .cal-entering .cal-cell:nth-child(7n+2) { animation-delay: 14ms; }
    .cal-entering .cal-cell:nth-child(7n+3) { animation-delay: 28ms; }
    .cal-entering .cal-cell:nth-child(7n+4) { animation-delay: 42ms; }
    .cal-entering .cal-cell:nth-child(7n+5) { animation-delay: 56ms; }
    .cal-entering .cal-cell:nth-child(7n+6) { animation-delay: 70ms; }
    .cal-entering .cal-cell:nth-child(7n)   { animation-delay: 84ms; }

    /* ── Today cell ambient pulse (kicks in after entrance) ──────── */
    @keyframes todayPulse {
      0%,100% { box-shadow: 0 0 0 0   rgba(166,124,142,0.45); }
      60%     { box-shadow: 0 0 0 7px rgba(166,124,142,0);   }
    }
    .cal-cell.today { animation: todayPulse 2.8s ease-in-out 0.5s infinite; }

    /* ── Sheet drag handle pill ───────────────────────────────────── */
    .sheet-handle-pill {
      width: 2.5rem; height: 4px; border-radius: 9999px;
      background: rgba(176,148,160,0.50);
      transition: width 0.2s cubic-bezier(0.34,1.56,0.64,1),
                  background-color 0.12s ease;
    }
    #js-sheet-handle:active .sheet-handle-pill {
      width: 4rem; background: rgba(166,124,142,0.65);
    }

    /* ── Swipe card drag elevation ───────────────────────────────── */
    .swipe-card.dragging {
      box-shadow: 0 10px 28px -6px rgba(74,46,58,0.20),
                  0 4px  10px -4px rgba(74,46,58,0.12);
    }

    /* ── Active nav tab dot indicator ────────────────────────────── */
    @keyframes dotAppear { from { transform:scale(0); opacity:0; } to { transform:scale(1); opacity:1; } }
    .nav-tab.text-primary::after {
      content: ''; display: block;
      width: 4px; height: 4px; border-radius: 50%;
      background: currentColor; margin-top: 2px;
      animation: dotAppear 0.18s cubic-bezier(0.34,1.56,0.64,1) both;
    }

    /* ── prefers-reduced-motion: disable all non-essential motion ── */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration:        0.01ms !important;
        animation-iteration-count: 1      !important;
        transition-duration:       0.01ms !important;
      }
    }

"""

# Insert CSS before the closing </style> of the custom style block
STYLE_END = '    main { padding-bottom: 5rem; }\n  </style>'
assert STYLE_END in html, 'style end anchor not found'
html = html.replace(STYLE_END, '    main { padding-bottom: 5rem; }' + POLISH_CSS + '  </style>', 1)

# Replace sheet handle inner div
OLD_PILL = '<div class="w-10 h-1 bg-secondary/60 rounded-full"></div>'
NEW_PILL = '<div class="sheet-handle-pill"></div>'
assert OLD_PILL in html, 'sheet handle pill anchor not found'
html = html.replace(OLD_PILL, NEW_PILL, 1)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print('admin.html patched OK')

# ============================================================
# 3+4. admin.js — setTab animation + render cards-entering
# ============================================================
js_path = ROOT + '/frontend/admin.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

orig_lines = js.count('\n')

# 3. setTab(): inject tab-entering restart before the tab-specific logic
OLD3 = "  if (tab === 'slots')    loadTemplate();\n  if (tab === 'calendar') renderVisibleCalendar();"
NEW3 = (
    "  // Restart entrance animation on the newly visible tab\n"
    "  const _tabEl = document.getElementById('tab-' + tab);\n"
    "  if (_tabEl) { _tabEl.classList.remove('tab-entering'); void _tabEl.offsetWidth; _tabEl.classList.add('tab-entering'); }\n"
    "\n"
    "  if (tab === 'slots')    loadTemplate();\n"
    "  if (tab === 'calendar') renderVisibleCalendar();"
)
assert js.count(OLD3) == 1, 'setTab anchor not unique: ' + str(js.count(OLD3))
js = js.replace(OLD3, NEW3, 1)

# 4. render(): add cards-entering after swipe wrappers are initialised
OLD4 = "    initCardSwipe(w, { onCommit: _commitCardAction }));\n}"
NEW4 = (
    "    initCardSwipe(w, { onCommit: _commitCardAction }));\n"
    "  // Staggered entrance animation\n"
    "  cards.classList.remove('cards-entering');\n"
    "  void cards.offsetWidth;\n"
    "  cards.classList.add('cards-entering');\n"
    "}"
)
assert js.count(OLD4) == 1, 'render anchor not unique: ' + str(js.count(OLD4))
js = js.replace(OLD4, NEW4, 1)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)
print('admin.js patched OK (+' + str(js.count('\n') - orig_lines) + ' lines)')

# ============================================================
# 5. admin-calendar.js — cal-entering on month change
# ============================================================
cal_path = ROOT + '/frontend/admin-calendar.js'
with open(cal_path, 'r', encoding='utf-8') as f:
    cal = f.read()

OLD5 = "  gridEl.innerHTML = '';\n  gridEl.appendChild(frag);\n}"
NEW5 = (
    "  gridEl.innerHTML = '';\n"
    "  gridEl.appendChild(frag);\n"
    "  // Trigger column-staggered entrance animation\n"
    "  gridEl.classList.remove('cal-entering');\n"
    "  void gridEl.offsetWidth;\n"
    "  gridEl.classList.add('cal-entering');\n"
    "}"
)
assert cal.count(OLD5) == 1, 'renderCalendar anchor not unique: ' + str(cal.count(OLD5))
cal = cal.replace(OLD5, NEW5, 1)

with open(cal_path, 'w', encoding='utf-8') as f:
    f.write(cal)
print('admin-calendar.js patched OK')
print('Done.')
