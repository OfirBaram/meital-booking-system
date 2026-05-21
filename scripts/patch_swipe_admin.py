"""patch_swipe_admin.py — wire swipe gestures + toastUndo into admin.html and admin.js
Usage: python patch_swipe_admin.py <repo_root>

Changes:
  admin.html:
    1. Replace plain toast div with undo-capable structure (#js-toast-msg + #js-toast-undo)

  admin.js:
    2. Add imports: buildSwipeCard from admin-render, initCardSwipe from admin-gestures
    3. Replace toast() + add toastUndo() + _undoTmr / _pendingUndo vars
    4. Replace render() to use buildSwipeCard + initCardSwipe
    5. Remove CONFIRM_MSG / OK_MSG / BTN_LABEL constants (dead after next step)
    6. Replace entire onAction() with one-liner calling _commitCardAction
    7. Add _commitCardAction() before startAutoRefresh()
    8. Remove confirm() line from deleteDiarySlot (direct delete, no dialog)
    9. Remove confirm() line from blockDates (direct block, no dialog)
"""
import sys
if len(sys.argv) < 2:
    sys.exit('Usage: patch_swipe_admin.py <repo_root>')

ROOT = sys.argv[1].rstrip('/\\')

# ── 1. admin.html: update toast HTML ─────────────────────────────────────────
html_path = ROOT + '/frontend/admin.html'
with open(html_path, 'r', encoding='utf-8') as f:
    html = f.read()

OLD_TOAST_HTML = (
    '  <!-- Toast -->\n'
    '  <div id="js-toast" class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none hidden">\n'
    '    <div class="text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl whitespace-nowrap bg-text-main text-white"></div>\n'
    '  </div>'
)
NEW_TOAST_HTML = (
    '  <!-- Toast (supports plain + undo-capable toasts) -->\n'
    '  <div id="js-toast" class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 hidden">\n'
    '    <div class="flex items-center gap-3 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl pointer-events-auto bg-text-main text-white">\n'
    '      <span id="js-toast-msg" class="whitespace-nowrap"></span>\n'
    '      <button id="js-toast-undo"\n'
    '        class="hidden shrink-0 text-xs font-black tracking-wide underline underline-offset-2\n'
    '               opacity-80 hover:opacity-100 active:scale-95 transition-all whitespace-nowrap">'
    + 'בטל'   # בטל
    + '</button>\n'
    '    </div>\n'
    '  </div>'
)
assert OLD_TOAST_HTML in html, 'toast HTML anchor not found'
html = html.replace(OLD_TOAST_HTML, NEW_TOAST_HTML, 1)

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(html)
print('admin.html patched OK')

# ── admin.js patches ──────────────────────────────────────────────────────────
js_path = ROOT + '/frontend/admin.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

orig_lines = js.count('\n')

# ── 2. Add imports ────────────────────────────────────────────────────────────
OLD2 = "  buildCard,\n  renderDiarySlots"
NEW2 = "  buildCard, buildSwipeCard,\n  renderDiarySlots"
assert js.count(OLD2) == 1, 'import anchor 2 not unique'
js = js.replace(OLD2, NEW2, 1)

OLD2b = "import { initSheet, openSheet, closeSheet } from './admin-sheet.js';"
NEW2b = OLD2b + "\nimport { initCardSwipe } from './admin-gestures.js';"
assert js.count(OLD2b) == 1, 'import anchor 2b not unique'
js = js.replace(OLD2b, NEW2b, 1)

# ── 3. Replace toast() block + add toastUndo ─────────────────────────────────
# Find from 'let _toastTmr' to '\nfunction sessionValid()'
TOAST_START = 'let _toastTmr;'
TOAST_END   = '\nfunction sessionValid()'
assert TOAST_START in js, 'toast start anchor missing'
assert TOAST_END   in js, 'toast end anchor missing'
ts = js.index(TOAST_START)
te = js.index(TOAST_END)

# New toast section (all string concatenation to avoid Python encoding issues)
# Hebrew: 'שגיאה' = error label checked nowhere in this block, ok.
NEW_TOAST_SECTION = (
    'let _toastTmr;\n'
    'let _undoTmr    = null;\n'
    'let _pendingUndo = null;\n'
    '\n'
    "function toast(msg, type = '') {\n"
    "  const wrap    = document.getElementById('js-toast');\n"
    "  const inner   = wrap.querySelector('div');\n"
    "  const msgEl   = document.getElementById('js-toast-msg');\n"
    "  const undoBtn = document.getElementById('js-toast-undo');\n"
    '  clearTimeout(_toastTmr);\n'
    '  // Flush any pending undo — commit it before showing unrelated toast\n'
    '  if (_pendingUndo) {\n'
    '    clearTimeout(_undoTmr);\n'
    '    const prev = _pendingUndo; _pendingUndo = null;\n'
    '    prev.commitFn();\n'
    '  }\n'
    "  if (undoBtn) undoBtn.classList.add('hidden');\n"
    '  if (msgEl) msgEl.textContent = msg;\n'
    '  else inner.textContent = msg;\n'
    "  inner.className = [\n"
    "    'flex items-center gap-3 text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl pointer-events-auto',\n"
    "    type === 'err' ? 'bg-red-500 text-white' :\n"
    "    type === 'ok'  ? 'bg-green-600 text-white' :\n"
    "                     'bg-text-main text-white',\n"
    "  ].join(' ');\n"
    "  wrap.classList.remove('hidden');\n"
    "  wrap.classList.add('toast-in');\n"
    '  _toastTmr = setTimeout(() => {\n'
    "    wrap.classList.add('hidden');\n"
    "    wrap.classList.remove('toast-in');\n"
    '  }, 3200);\n'
    '}\n'
    '\n'
    "function toastUndo(label, commitFn, onUndo, ttl = 5000) {\n"
    '  // Flush previous pending commit before showing new toast\n'
    '  if (_pendingUndo) {\n'
    '    clearTimeout(_undoTmr);\n'
    '    const prev = _pendingUndo; _pendingUndo = null;\n'
    '    prev.commitFn();\n'
    '  }\n'
    '  clearTimeout(_toastTmr);\n'
    '\n'
    "  const wrap    = document.getElementById('js-toast');\n"
    "  const inner   = wrap.querySelector('div');\n"
    "  const msgEl   = document.getElementById('js-toast-msg');\n"
    "  let   undoBtn = document.getElementById('js-toast-undo');\n"
    '\n'
    '  if (msgEl) msgEl.textContent = label;\n'
    "  inner.className = 'flex items-center gap-3 text-sm font-semibold px-4 py-3"
    " rounded-2xl shadow-xl pointer-events-auto bg-text-main text-white';\n"
    "  wrap.classList.remove('hidden');\n"
    "  wrap.classList.add('toast-in');\n"
    '\n'
    '  _pendingUndo = { commitFn };\n'
    '\n'
    '  // Replace button to clear stale listeners (cloneNode trick)\n'
    '  if (undoBtn) {\n'
    '    const fresh = undoBtn.cloneNode(true);\n'
    '    undoBtn.parentNode.replaceChild(fresh, undoBtn);\n'
    '    undoBtn = fresh;\n'
    "    undoBtn.classList.remove('hidden');\n"
    '    undoBtn.addEventListener(\'click\', () => {\n'
    '      clearTimeout(_undoTmr);\n'
    '      _pendingUndo = null;\n'
    "      wrap.classList.add('hidden');\n"
    "      wrap.classList.remove('toast-in');\n"
    "      const b2 = document.getElementById('js-toast-undo');\n"
    "      if (b2) b2.classList.add('hidden');\n"
    '      onUndo && onUndo();\n'
    '    }, { once: true });\n'
    '  }\n'
    '\n'
    '  _undoTmr = setTimeout(() => {\n'
    '    _pendingUndo = null;\n'
    "    wrap.classList.add('hidden');\n"
    "    wrap.classList.remove('toast-in');\n"
    "    const b2 = document.getElementById('js-toast-undo');\n"
    "    if (b2) b2.classList.add('hidden');\n"
    '    commitFn();\n'
    '  }, ttl);\n'
    '}'
)
js = js[:ts] + NEW_TOAST_SECTION + js[te:]

# ── 4. render(): buildCard → buildSwipeCard + initCardSwipe ──────────────────
OLD4 = (
    "  cards.innerHTML = rows.map(buildCard).join('');\n"
    "  cards.classList.remove('hidden');\n"
    "  cards.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));"
)
NEW4 = (
    "  cards.innerHTML = rows.map(buildSwipeCard).join('');\n"
    "  cards.classList.remove('hidden');\n"
    "  cards.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction));\n"
    "  cards.querySelectorAll('.swipe-wrapper').forEach(w =>\n"
    "    initCardSwipe(w, { onCommit: _commitCardAction }));"
)
assert js.count(OLD4) == 1, 'render anchor not unique'
js = js.replace(OLD4, NEW4, 1)

# ── 5. Remove dead CONFIRM_MSG / OK_MSG / BTN_LABEL constants ────────────────
CONSTS_START = 'const CONFIRM_MSG = {'
CONSTS_END   = 'async function onAction(e) {'
assert CONSTS_START in js, 'CONFIRM_MSG not found'
assert CONSTS_END   in js, 'onAction not found'
cs = js.index(CONSTS_START)
ce = js.index(CONSTS_END)
js = js[:cs] + js[ce:]

# ── 6. Replace onAction body with one-liner ──────────────────────────────────
ONACTION_START = 'async function onAction(e) {'
ONACTION_END   = '\nfunction setFilter('
assert ONACTION_START in js, 'onAction start not found'
assert ONACTION_END   in js, 'setFilter not found'
oas = js.index(ONACTION_START)
oae = js.index(ONACTION_END)

NEW_ONACTION = (
    'async function onAction(e) {\n'
    '  const btn    = e.currentTarget;\n'
    '  const id     = btn.dataset.id;\n'
    '  const target = btn.dataset.action;\n'
    "  if (target === 'sms') {\n"
    '    openSmsModal({ id, phone: btn.dataset.phone, name: btn.dataset.name });\n'
    '    return;\n'
    '  }\n'
    '  _commitCardAction(id, target);\n'
    '}\n'
)
js = js[:oas] + NEW_ONACTION + js[oae:]

# ── 7. Add _commitCardAction before startAutoRefresh ─────────────────────────
# Hebrew strings as Unicode escape sequences so this Python file stays ASCII-safe
# approved = ("ההזמנה אושרה") = 'ההזמנה אושרה'
# rejected = ("ההזמנה נדחתה") = 'ההזמנה נדחתה'
# cancelled= ("ההזמנה בוטלה") = 'ההזמנה בוטלה'
COMMIT_FN = (
    'function _commitCardAction(id, target) {\n'
    "  const wrapper  = document.querySelector('[data-swipe-id=\"' + id + '\"]');\n"
    "  const card     = wrapper ? wrapper.querySelector('.swipe-card') : null;\n"
    "  const booking  = S.bookings.find(b => b.id === id);\n"
    '  const prevStatus = booking ? booking.status : null;\n'
    '  if (booking) booking.status = target;\n'
    '\n'
    '  if (wrapper && card) {\n'
    "    const dir = (target === 'Approved') ? 1 : -1;\n"
    "    card.style.transition = 'transform 0.22s ease-in';\n"
    "    card.style.transform  = 'translate3d(' + (dir * 115) + '%, 0, 0)';\n"
    "    wrapper.style.overflow   = 'hidden';\n"
    "    wrapper.style.transition = 'max-height 0.28s 0.1s, margin-bottom 0.28s 0.1s, opacity 0.2s 0.08s';\n"
    '    setTimeout(() => {\n'
    "      wrapper.style.maxHeight    = '0';\n"
    "      wrapper.style.marginBottom = '0';\n"
    "      wrapper.style.opacity      = '0';\n"
    '    }, 40);\n'
    '  }\n'
    '\n'
    '  const OK = {\n'
    "    Approved:  'ההזמנה אושרה',\n"   # ההזמנה אושרה
    "    Rejected:  'ההזמנה נדחתה',\n"   # ההזמנה נדחתה
    "    Cancelled: 'ההזמנה בוטלה',\n"   # ההזמנה בוטלה
    '  };\n'
    "  toastUndo(\n"
    "    OK[target] || 'עודכן',\n"  # עודכן
    '    async () => {\n'
    '      try {\n'
    "        const data = await apiCall('changeStatus', { bookingId: id, targetStatus: target });\n"
    "        if (!data.success) throw new Error(data.error || 'error');\n"
    '        await load(true);\n'
    '      } catch (e) {\n'
    '        if (booking && prevStatus) booking.status = prevStatus;\n'
    "        toast('שגיאה: ' + e.message, 'err');\n"  # שגיאה:
    '        await load(true);\n'
    '      }\n'
    '    },\n'
    '    () => {\n'
    '      if (booking && prevStatus) booking.status = prevStatus;\n'
    '      render();\n'
    '    }\n'
    '  );\n'
    '}\n'
    '\n'
)
AUTOREFRESH = 'function startAutoRefresh() {'
assert AUTOREFRESH in js, 'startAutoRefresh not found'
ar = js.index(AUTOREFRESH)
js = js[:ar] + COMMIT_FN + js[ar:]

# ── 8. Remove confirm() from deleteDiarySlot ─────────────────────────────────
DS_START = 'async function deleteDiarySlot(slotId) {'
assert DS_START in js, 'deleteDiarySlot not found'
ds = js.index(DS_START)
# Find the confirm line after ds_start
confirm_ds = js.index("  if (!confirm(", ds)
eol_ds     = js.index('\n', confirm_ds) + 1
js = js[:confirm_ds] + js[eol_ds:]

# ── 9. Remove confirm() from blockDates ──────────────────────────────────────
BD_START = 'async function blockDates() {'
assert BD_START in js, 'blockDates not found'
bd = js.index(BD_START)
confirm_bd = js.index("  if (!confirm(", bd)
eol_bd     = js.index('\n', confirm_bd) + 1
js = js[:confirm_bd] + js[eol_bd:]

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js)

delta = js.count('\n') - orig_lines
print('admin.js patched OK (delta ' + str(delta) + ' lines)')
print('confirm() calls remaining: ' + str(js.count('if (!confirm(')))
print('Done.')
