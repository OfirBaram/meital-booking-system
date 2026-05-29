"""Patches for frontend/admin-sheet.js — Phase 1+2+3 of admin-calendar-day-management."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
F = ROOT / 'frontend' / 'admin-sheet.js'

def read():
    return F.read_text(encoding='utf-8').replace('\r\n', '\n')

def write(content):
    F.write_text(content, encoding='utf-8', newline='\n')

def patch(old, new, label):
    content = read()
    if old not in content:
        # Show a nearby snippet for debugging
        probe = old.splitlines()[0][:50]
        for i, line in enumerate(content.splitlines(), 1):
            if probe in line:
                print(f'  Nearest match line {i}: {line!r}')
                break
        print(f'ERROR: old string not found for patch "{label}"')
        print(f'Looking for: {old[:120]!r}')
        sys.exit(1)
    if content.count(old) > 1:
        print(f'ERROR: old string found more than once for patch "{label}"')
        sys.exit(1)
    write(content.replace(old, new, 1))
    print(f'✓ {label}')

def verify(snippet, label):
    if snippet not in read():
        print(f'ERROR: verification failed: {label!r}')
        sys.exit(1)
    print(f'  ✓ verified: {label}')

# ── Patch 1: JSDoc header ──────────────────────────────────────────────────────
patch(
    " * DOM (browser-only, E2E-tested):\n"
    " *   initSheet()                  — wire listeners once on DOMContentLoaded\n"
    " *   openSheet(type, payload, snap) — show sheet with content\n"
    " *   closeSheet()                 — hide with exit animation\n"
    " *\n"
    " * Content types:\n"
    " *   'day' — date header + booking list + add-slot footer button\n"
    " *\n"
    " * Actions dispatched on document for admin.js to handle:\n"
    " *   CustomEvent 'sheet:action'  { detail: { action, id, date } }",
    # ----
    " * DOM (browser-only, E2E-tested):\n"
    " *   initSheet()                  — wire listeners once on DOMContentLoaded\n"
    " *   openSheet(type, payload, snap) — show sheet with content\n"
    " *   closeSheet()                 — hide with exit animation\n"
    " *   updateSheetSlots(dateStr, slots) — patch available-slot section after async load\n"
    " *   refreshSheetDay(payload)     — re-render day content in-place (no animation)\n"
    " *\n"
    " * Content types:\n"
    " *   'day' — date header + booking rows (with actions) + slot chips + add-slot footer\n"
    " *\n"
    " * Actions dispatched on document for admin.js to handle:\n"
    " *   CustomEvent 'sheet:action'  { detail: { action, id, date, slotId } }",
    'JSDoc header'
)

# ── Patch 2: _bookingRow — add action buttons ──────────────────────────────────
patch(
    "  const svc = b.serviceName || b.service || ''\n"
    "\n"
    "  return (\n"
    "    '<div class=\"bg-cream rounded-2xl p-3.5 border border-secondary/30 shadow-sm card-in\"'\n",
    # ----
    "  const svc = b.serviceName || b.service || ''\n"
    "\n"
    "  let actionHtml = ''\n"
    "  if (b.status === 'Pending') {\n"
    "    actionHtml =\n"
    "      '<div class=\"flex gap-2 mt-2.5 pt-2.5 border-t border-secondary/20\">'\n"
    "      + '<button data-sheet-action=\"Approved\" data-id=\"' + _esc(b.id) + '\"'\n"
    "      + ' class=\"flex-1 bg-green-500 text-white text-xs font-bold py-2 rounded-xl'\n"
    "      + ' hover:bg-green-600 active:scale-[0.97] transition-all min-h-[36px]\">✓ אשר</button>'\n"
    "      + '<button data-sheet-action=\"Rejected\" data-id=\"' + _esc(b.id) + '\"'\n"
    "      + ' class=\"flex-1 bg-red-500 text-white text-xs font-bold py-2 rounded-xl'\n"
    "      + ' hover:bg-red-600 active:scale-[0.97] transition-all min-h-[36px]\">✗ דחה</button>'\n"
    "      + '</div>'\n"
    "  } else if (b.status === 'Approved') {\n"
    "    actionHtml =\n"
    "      '<div class=\"mt-2.5 pt-2.5 border-t border-secondary/20\">'\n"
    "      + '<button data-sheet-action=\"Cancelled\" data-id=\"' + _esc(b.id) + '\"'\n"
    "      + ' class=\"w-full border border-red-300 text-red-500 text-xs font-bold py-2 rounded-xl'\n"
    "      + ' hover:bg-red-50 active:scale-[0.97] transition-all min-h-[36px]\">✗ בטל הזמנה</button>'\n"
    "      + '</div>'\n"
    "  }\n"
    "\n"
    "  return (\n"
    "    '<div class=\"bg-cream rounded-2xl p-3.5 border border-secondary/30 shadow-sm card-in\"'\n",
    '_bookingRow action buttons'
)

# Add actionHtml just before closing </div>
patch(
    "    + '<div class=\"flex items-center gap-3 text-xs text-text-muted\">'\n"
    "    + '<span class=\"font-medium\">' + _esc(b.time || '') + '</span>'\n"
    "    + '<span>' + _esc(svc) + '</span>'\n"
    "    + '</div>'\n"
    "    + '</div>'\n"
    "  )\n"
    "}",
    # ----
    "    + '<div class=\"flex items-center gap-3 text-xs text-text-muted\">'\n"
    "    + '<span class=\"font-medium\">' + _esc(b.time || '') + '</span>'\n"
    "    + '<span>' + _esc(svc) + '</span>'\n"
    "    + '</div>'\n"
    "    + actionHtml\n"
    "    + '</div>'\n"
    "  )\n"
    "}",
    '_bookingRow close tag + actionHtml'
)

# ── Patch 3: _renderDay + new _renderDayFooter ────────────────────────────────
patch(
    "  if (!entry || !entry.bookings || entry.bookings.length === 0) {\n"
    "    contentEl.innerHTML =\n"
    "      '<div class=\"flex flex-col items-center justify-center py-12 text-center\">'\n"
    "      + '<div class=\"text-4xl mb-3\">💅</div>'\n"
    "      + '<p class=\"text-sm font-medium text-text-muted\">אין הזמנות ביום זה</p>'\n"
    "      + '</div>'\n"
    "  } else {\n"
    "    const sorted = entry.bookings.slice().sort((a, b) =>\n"
    "      (a.time || '') < (b.time || '') ? -1 : 1)\n"
    "    contentEl.innerHTML = sorted.map(_bookingRow).join('')\n"
    "  }\n"
    "\n"
    "  if (footerEl) {\n"
    "    footerEl.innerHTML =\n"
    "      '<button data-sheet-action=\"addSlot\" data-date=\"' + _esc(dateStr) + '\"'\n"
    "      + ' class=\"w-full bg-primary text-white font-bold py-3 rounded-xl'\n"
    "      + ' hover:bg-primary-dk active:scale-[0.98] transition-all'\n"
    "      + ' flex items-center justify-center gap-2 text-sm\">'\n"
    "      + '<svg class=\"w-4 h-4 shrink-0\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">'\n"
    "      + '<path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.5\" d=\"M12 4v16m8-8H4\"/>'\n"
    "      + '</svg>'\n"
    "      + ' הוסף חריץ זמן'\n"
    "      + '</button>'\n"
    "    footerEl.classList.remove('hidden')\n"
    "    footerEl.querySelector('[data-sheet-action]').addEventListener('click', _onSheetAction)\n"
    "  }\n"
    "}",
    # ----
    "  let bookingsHtml\n"
    "  if (!entry || !entry.bookings || entry.bookings.length === 0) {\n"
    "    bookingsHtml =\n"
    "      '<div class=\"flex flex-col items-center justify-center py-8 text-center\">'\n"
    "      + '<div class=\"text-3xl mb-2\">💅</div>'\n"
    "      + '<p class=\"text-sm font-medium text-text-muted\">אין הזמנות ביום זה</p>'\n"
    "      + '</div>'\n"
    "  } else {\n"
    "    const sorted = entry.bookings.slice().sort((a, b) =>\n"
    "      (a.time || '') < (b.time || '') ? -1 : 1)\n"
    "    bookingsHtml = '<div class=\"space-y-2\">' + sorted.map(_bookingRow).join('') + '</div>'\n"
    "  }\n"
    "\n"
    "  contentEl.innerHTML =\n"
    "    bookingsHtml\n"
    "    + '<div id=\"js-sheet-slots\" class=\"mt-3\">'\n"
    "    + '<div class=\"flex items-center gap-2 py-1\">'\n"
    "    + '<span class=\"w-3.5 h-3.5 spinner inline-block shrink-0\"></span>'\n"
    "    + '<span class=\"text-xs text-text-muted\">טוען תורים...</span>'\n"
    "    + '</div>'\n"
    "    + '</div>'\n"
    "\n"
    "  contentEl.querySelectorAll('[data-sheet-action]').forEach(btn =>\n"
    "    btn.addEventListener('click', _onSheetAction))\n"
    "\n"
    "  if (footerEl) _renderDayFooter(footerEl, dateStr)\n"
    "}\n"
    "\n"
    "function _renderDayFooter(footerEl, dateStr) {\n"
    "  footerEl.innerHTML =\n"
    "    '<div id=\"js-sheet-footer-default\">'\n"
    "    + '<button data-sheet-action=\"addSlot\" data-date=\"' + _esc(dateStr) + '\"'\n"
    "    + ' class=\"w-full bg-primary text-white font-bold py-3 rounded-xl'\n"
    "    + ' hover:bg-primary-dk active:scale-[0.98] transition-all'\n"
    "    + ' flex items-center justify-center gap-2 text-sm\">'\n"
    "    + '<svg class=\"w-4 h-4 shrink-0\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\">'\n"
    "    + '<path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2.5\" d=\"M12 4v16m8-8H4\"/>'\n"
    "    + '</svg>'\n"
    "    + ' הוסף תור'\n"
    "    + '</button>'\n"
    "    + '</div>'\n"
    "    + '<div id=\"js-sheet-footer-form\" class=\"hidden\">'\n"
    "    + '<div class=\"flex gap-2 items-center\">'\n"
    "    + '<input id=\"js-sheet-add-time\" type=\"time\" step=\"1800\"'\n"
    "    + ' class=\"flex-1 border border-secondary/60 rounded-xl px-3 py-2.5 text-sm'\n"
    "    + ' text-text-main focus:outline-none focus:ring-2 focus:ring-primary/30'\n"
    "    + ' focus:border-primary transition-colors\">'\n"
    "    + '<button data-sheet-action=\"addSlotSubmit\" data-date=\"' + _esc(dateStr) + '\"'\n"
    "    + ' class=\"bg-primary text-white font-bold px-4 py-2.5 rounded-xl'\n"
    "    + ' hover:bg-primary-dk active:scale-[0.98] transition-all text-sm shrink-0 min-h-[44px]\">'\n"
    "    + 'הוסף</button>'\n"
    "    + '<button data-sheet-action=\"cancelAddSlot\"'\n"
    "    + ' class=\"border border-secondary/40 text-text-muted font-semibold px-3 py-2.5'\n"
    "    + ' rounded-xl hover:bg-cream active:scale-[0.98] transition-all text-sm shrink-0 min-h-[44px]\">'\n"
    "    + 'ביטול</button>'\n"
    "    + '</div>'\n"
    "    + '</div>'\n"
    "  footerEl.classList.remove('hidden')\n"
    "  footerEl.querySelectorAll('[data-sheet-action]').forEach(btn =>\n"
    "    btn.addEventListener('click', _onSheetAction))\n"
    "}",
    '_renderDay + _renderDayFooter'
)

# ── Patch 4: _onSheetAction — add slotId ─────────────────────────────────────
patch(
    "  const id     = btn.dataset.id   || ''\n"
    "  const date   = btn.dataset.date || ''\n"
    "  document.dispatchEvent(new CustomEvent('sheet:action', {\n"
    "    detail: { action, id, date },\n",
    # ----
    "  const id     = btn.dataset.id     || ''\n"
    "  const date   = btn.dataset.date   || ''\n"
    "  const slotId = btn.dataset.slotId || ''\n"
    "  document.dispatchEvent(new CustomEvent('sheet:action', {\n"
    "    detail: { action, id, date, slotId },\n",
    '_onSheetAction slotId'
)

# ── Patch 5: Add new exports at bottom ────────────────────────────────────────
patch(
    "function _esc(s) {\n"
    "  return String(s || '').replace(/[&<>\"']/g, c => _ESC_MAP[c])\n"
    "}",
    # ----
    "function _esc(s) {\n"
    "  return String(s || '').replace(/[&<>\"']/g, c => _ESC_MAP[c])\n"
    "}\n"
    "\n"
    "// ── Public: patch available-slot section after async load ─────────────────\n"
    "\n"
    "export function updateSheetSlots(dateStr, slots) {\n"
    "  if (!_state.open || _state.type !== 'day') return\n"
    "  if (_state.payload && _state.payload.dateStr !== dateStr) return\n"
    "  const el = document.getElementById('js-sheet-slots')\n"
    "  if (!el) return\n"
    "\n"
    "  const available = (slots || []).filter(s => s.status === 'available')\n"
    "  const locked    = (slots || []).filter(s => s.status === 'locked')\n"
    "\n"
    "  if (available.length === 0 && locked.length === 0) {\n"
    "    el.innerHTML = ''\n"
    "    return\n"
    "  }\n"
    "\n"
    "  let html =\n"
    "    '<div class=\"pt-3 border-t border-secondary/20\">'\n"
    "    + '<div class=\"text-[10px] font-bold text-text-muted uppercase tracking-widest mb-2\">תורים פנויים</div>'\n"
    "    + '<div class=\"flex flex-wrap gap-1.5\">'\n"
    "\n"
    "  available.forEach(s => {\n"
    "    html +=\n"
    "      '<div class=\"flex items-center gap-1.5 bg-white border border-secondary/30 rounded-xl px-2.5 py-1.5 shadow-sm\">'\n"
    "      + '<span class=\"text-xs font-semibold text-text-main\">' + _esc(s.time || '') + '</span>'\n"
    "      + '<button data-sheet-action=\"lockSlot\" data-slot-id=\"' + _esc(String(s.id)) + '\"'\n"
    "      + ' class=\"text-[10px] font-semibold text-text-muted hover:text-red-500 transition-colors leading-none\">'\n"
    "      + 'נעל</button>'\n"
    "      + '</div>'\n"
    "  })\n"
    "\n"
    "  locked.forEach(s => {\n"
    "    html +=\n"
    "      '<div class=\"flex items-center gap-1.5 bg-secondary/20 rounded-xl px-2.5 py-1.5\">'\n"
    "      + '<span class=\"text-xs font-medium text-text-muted line-through\">' + _esc(s.time || '') + '</span>'\n"
    "      + '<span class=\"text-[10px] text-text-muted mx-0.5\">נעול</span>'\n"
    "      + '<button data-sheet-action=\"unlockSlot\" data-slot-id=\"' + _esc(String(s.id)) + '\"'\n"
    "      + ' class=\"text-[10px] font-semibold text-green-600 hover:text-green-700 transition-colors leading-none\">'\n"
    "      + 'שחרר</button>'\n"
    "      + '</div>'\n"
    "  })\n"
    "\n"
    "  html += '</div></div>'\n"
    "  el.innerHTML = html\n"
    "  el.querySelectorAll('[data-sheet-action]').forEach(btn =>\n"
    "    btn.addEventListener('click', _onSheetAction))\n"
    "}\n"
    "\n"
    "// ── Public: re-render day content in-place without open animation ─────────\n"
    "\n"
    "export function refreshSheetDay(payload) {\n"
    "  if (!_state.open || _state.type !== 'day') return\n"
    "  _state = { ..._state, payload }\n"
    "  _renderContent()\n"
    "}",
    'New exports: updateSheetSlots + refreshSheetDay'
)

# ── Verifications ─────────────────────────────────────────────────────────────
for snippet, label in [
    ('updateSheetSlots', 'export updateSheetSlots'),
    ('refreshSheetDay', 'export refreshSheetDay'),
    ('data-sheet-action="Approved"', 'Approve button'),
    ('data-sheet-action="Rejected"', 'Reject button'),
    ('data-sheet-action="Cancelled"', 'Cancel button'),
    ('js-sheet-footer-default', 'footer default div'),
    ('js-sheet-footer-form', 'footer form div'),
    ('js-sheet-slots', 'slots section'),
    ('הוסף תור', 'renamed to תור'),
    ('slotId', 'slotId in event'),
    ('lockSlot', 'lockSlot action'),
    ('unlockSlot', 'unlockSlot action'),
]:
    verify(snippet, label)

print('\nAll admin-sheet.js patches applied and verified.')
