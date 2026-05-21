"""patch_calendar_logic.py — wire admin-calendar.js into admin.js
Usage: python patch_calendar_logic.py <repo_root>
"""
import sys

if len(sys.argv) < 2:
    print('Usage: patch_calendar_logic.py <repo_root>')
    sys.exit(1)

ROOT = sys.argv[1].rstrip('/\\')
path = ROOT + '/frontend/admin.js'

with open(path, 'r', encoding='utf-8') as f:
    js = f.read()

original = js  # keep for diff summary

# ── 1. Add import after admin-render import ───────────────────────────────────
OLD1 = "} from './admin-render.js';"
NEW1 = "} from './admin-render.js';\nimport { buildCalData, renderCalendar, formatCalTitle } from './admin-calendar.js';"
assert js.count(OLD1) == 1, 'anchor 1 not found or ambiguous'
js = js.replace(OLD1, NEW1, 1)

# ── 2. Add calData + calMonth to state ────────────────────────────────────────
OLD2 = '  _clientSearchTimer: null,'
NEW2 = '  _clientSearchTimer: null,\n  calData:  {},\n  calMonth: new Date(),'
assert js.count(OLD2) == 1, 'anchor 2 not found or ambiguous'
js = js.replace(OLD2, NEW2, 1)

# ── 3. In login(): set calData after bookings, render calendar after stats ─────
# login() ends its try block with: updateStats(); then } catch
OLD3 = ('    S.bookings = data.bookings || [];\n'
        '    showDash();\n'
        '    hideSkeleton();\n'
        '    render();\n'
        '    updateStats();\n'
        '  } catch (_) {')
NEW3 = ('    S.bookings = data.bookings || [];\n'
        '    S.calData = buildCalData(S.bookings);\n'
        '    showDash();\n'
        '    hideSkeleton();\n'
        '    render();\n'
        '    updateStats();\n'
        '    renderVisibleCalendar();\n'
        '  } catch (_) {')
assert js.count(OLD3) == 1, 'anchor 3 (login) not found or ambiguous: ' + str(js.count(OLD3))
js = js.replace(OLD3, NEW3, 1)

# ── 4. In load(): set calData + trigger renderVisibleCalendar ─────────────────
OLD4 = ("    S.bookings = data.bookings || [];\n"
        "    render();\n"
        "    updateStats();\n"
        "    if (S.tab === 'pulse') renderPulse();")
NEW4 = ("    S.bookings = data.bookings || [];\n"
        "    S.calData = buildCalData(S.bookings);\n"
        "    render();\n"
        "    updateStats();\n"
        "    if (S.tab === 'pulse') renderPulse();\n"
        "    if (S.tab === 'calendar') renderVisibleCalendar();")
assert js.count(OLD4) == 1, 'anchor 4 (load) not found or ambiguous'
js = js.replace(OLD4, NEW4, 1)

# ── 5. In setTab(): add calendar case ────────────────────────────────────────
OLD5 = "  if (tab === 'slots')  loadTemplate();"
NEW5 = ("  if (tab === 'slots')    loadTemplate();\n"
        "  if (tab === 'calendar') renderVisibleCalendar();")
assert js.count(OLD5) == 1, 'anchor 5 (setTab) not found or ambiguous'
js = js.replace(OLD5, NEW5, 1)

# ── 6. In init() auto-login path: set calData + render calendar ──────────────
OLD6 = ('      S.bookings = data.bookings || [];\n'
        '      showDash();\n'
        '      hideSkeleton();\n'
        '      render();\n'
        '      updateStats();\n'
        '      loadAutoSmsToggle();')
NEW6 = ('      S.bookings = data.bookings || [];\n'
        '      S.calData = buildCalData(S.bookings);\n'
        '      showDash();\n'
        '      hideSkeleton();\n'
        '      render();\n'
        '      updateStats();\n'
        '      renderVisibleCalendar();\n'
        '      loadAutoSmsToggle();')
assert js.count(OLD6) == 1, 'anchor 6 (init auto-login) not found or ambiguous'
js = js.replace(OLD6, NEW6, 1)

# ── 7. Add month-nav button handlers in init() ───────────────────────────────
OLD7 = ("  document.querySelectorAll('.nav-tab').forEach(btn =>\n"
        "    btn.addEventListener('click', () => setTab(btn.dataset.tab)));")
NEW7 = ("  document.querySelectorAll('.nav-tab').forEach(btn =>\n"
        "    btn.addEventListener('click', () => setTab(btn.dataset.tab)));\n\n"
        "  document.getElementById('js-cal-prev').addEventListener('click', () => {\n"
        "    S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() - 1, 1);\n"
        "    renderVisibleCalendar();\n"
        "  });\n"
        "  document.getElementById('js-cal-next').addEventListener('click', () => {\n"
        "    S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + 1, 1);\n"
        "    renderVisibleCalendar();\n"
        "  });")
assert js.count(OLD7) == 1, 'anchor 7 (nav-tab) not found or ambiguous'
js = js.replace(OLD7, NEW7, 1)

# ── 8. Insert renderVisibleCalendar + onCalDayClick before startAutoRefresh ──
RENDER_FN = (
    "function renderVisibleCalendar() {\n"
    "  const y  = S.calMonth.getFullYear();\n"
    "  const mo = S.calMonth.getMonth() + 1;\n"
    "  renderCalendar(\n"
    "    document.getElementById('js-cal-grid'),\n"
    "    document.getElementById('js-cal-title'),\n"
    "    y, mo, S.calData,\n"
    "    { onDayClick: onCalDayClick }\n"
    "  );\n"
    "}\n"
    "\n"
    "function onCalDayClick(dateStr, entry) {\n"
    "  const peekDate    = document.getElementById('js-cal-peek-date');\n"
    "  const peekContent = document.getElementById('js-cal-peek-content');\n"
    "  const peekAdd     = document.getElementById('js-cal-peek-add');\n"
    "  if (!peekDate) return;\n"
    "\n"
    "  peekDate.textContent = dateStr.replace(/-/g, '/');\n"
    "\n"
    "  if (!entry || entry.bookings.length === 0) {\n"
    "    peekContent.innerHTML = '<span class=\"text-text-muted\">\\u05d0\\u05d9\\u05df \\u05d4\\u05d6\\u05de\\u05e0\\u05d5\\u05ea \\u05d1\\u05d9\\u05d5\\u05dd \\u05d6\\u05d4</span>';\n"
    "    if (peekAdd) peekAdd.classList.remove('hidden');\n"
    "    return;\n"
    "  }\n"
    "\n"
    "  peekContent.innerHTML = entry.bookings\n"
    "    .slice()\n"
    "    .sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1)\n"
    "    .map(b =>\n"
    "      '<div class=\"flex items-center justify-between py-1.5 border-b border-secondary/15 last:border-0\">'\n"
    "      + '<div class=\"min-w-0\">'\n"
    "      + '<span class=\"font-semibold text-text-main text-xs\">' + esc(b.name) + '</span>'\n"
    "      + '<span class=\"text-text-muted text-xs mr-2\">' + esc(b.time || '') + '</span>'\n"
    "      + '</div>'\n"
    "      + '<span class=\"shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold '\n"
    "      + (STATUS_CLS[b.status] || 'bg-gray-100 text-gray-500') + '\">'\n"
    "      + (LABELS[b.status] || esc(b.status))\n"
    "      + '</span>'\n"
    "      + '</div>'\n"
    "    ).join('');\n"
    "  if (peekAdd) peekAdd.classList.remove('hidden');\n"
    "}\n"
    "\n"
)
OLD8 = "function startAutoRefresh() {"
NEW8 = RENDER_FN + "function startAutoRefresh() {"
assert js.count(OLD8) == 1, 'anchor 8 (startAutoRefresh) not found or ambiguous'
js = js.replace(OLD8, NEW8, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(js)

added = js.count('\n') - original.count('\n')
print('admin.js patched OK (+' + str(added) + ' lines)')
print('Done.')
