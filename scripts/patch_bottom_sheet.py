"""patch_bottom_sheet.py — wire admin-sheet.js into admin.js
Usage: python patch_bottom_sheet.py <repo_root>
"""
import sys

if len(sys.argv) < 2:
    sys.exit('Usage: patch_bottom_sheet.py <repo_root>')

ROOT = sys.argv[1].rstrip('/\\')
path = ROOT + '/frontend/admin.js'

with open(path, 'r', encoding='utf-8') as f:
    js = f.read()

original_lines = js.count('\n')

# ── 1. Add import for admin-sheet.js ─────────────────────────────────────────
OLD1 = "import { buildCalData, renderCalendar, formatCalTitle } from './admin-calendar.js';"
NEW1 = (OLD1 + "\nimport { initSheet, openSheet, closeSheet } from './admin-sheet.js';")
assert js.count(OLD1) == 1, 'anchor 1 not unique'
js = js.replace(OLD1, NEW1, 1)

# ── 2. Replace entire onCalDayClick body with a one-liner ─────────────────────
# Strategy: slice between the function start marker and the
# 'function startAutoRefresh' marker — avoids matching any embedded Hebrew.
FN_START  = 'function onCalDayClick(dateStr, entry) {'
FN_END    = '\n\nfunction startAutoRefresh() {'
assert FN_START in js, 'onCalDayClick not found'
assert FN_END   in js, 'startAutoRefresh not found'

si = js.index(FN_START)
ei = js.index(FN_END)

NEW_FN = (
    "function onCalDayClick(dateStr, entry) {\n"
    "  openSheet('day', { dateStr, entry });\n"
    "}"
)
js = js[:si] + NEW_FN + js[ei:]

# ── 3. Add initSheet() call in init() — before the auth check ────────────────
OLD3 = '  if (S.token && sessionValid()) {'
NEW3 = '  initSheet();\n\n  if (S.token && sessionValid()) {'
# This string appears exactly once in init()
assert js.count(OLD3) == 1, 'anchor 3 not unique: ' + str(js.count(OLD3))
js = js.replace(OLD3, NEW3, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(js)

delta = js.count('\n') - original_lines
print('admin.js patched OK (delta ' + str(delta) + ' lines)')
print('Done.')
