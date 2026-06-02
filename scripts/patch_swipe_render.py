"""patch_swipe_render.py — add buildSwipeCard export to admin-render.js
Usage: python patch_swipe_render.py <repo_root>
"""
import sys
if len(sys.argv) < 2:
    sys.exit('Usage: patch_swipe_render.py <repo_root>')

ROOT = sys.argv[1].rstrip('/\\')
path = ROOT + '/frontend/admin-render.js'

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

ANCHOR = "    + (btns ? '<div class=\"flex gap-2\">' + btns + '</div>' : '')\n    + '</div>';\n}"
assert ANCHOR in src, 'buildCard closing brace not found'

# Labels written as Unicode escapes to avoid any editor/encoding issues
# Hebrew: approve label = 'אשר' (אשר)
#         reject label  = 'דחה' (דחה)
#         cancel label  = 'בטל' (בטל)
BUILD_SWIPE = (
    "\n\n"
    "// ─── buildSwipeCard ───────────────────────────────────────────\n"
    "// Wraps Pending/Approved cards in a .swipe-wrapper with reveal layers.\n"
    "// Rejected/Cancelled are returned as plain buildCard output (no swipe).\n"
    "\n"
    "export function buildSwipeCard(b) {\n"
    "  const inner = buildCard(b);\n"
    "  if (b.status !== 'Pending' && b.status !== 'Approved') return inner;\n"
    "\n"
    "  const approveLabel = 'אשר';\n"          # אשר
    "  const rejectLabel  = b.status === 'Pending' ? 'דחה' : 'בטל';\n"  # דחה / בטל
    "\n"
    "  const approveLayer = b.status === 'Pending'\n"
    "    ? '<div class=\"swipe-reveal approve\" aria-hidden=\"true\">'\n"
    "      + '<span class=\"font-bold text-sm\">' + approveLabel + '</span></div>'\n"
    "    : '';\n"
    "\n"
    "  const rejectLayer = '<div class=\"swipe-reveal reject\" aria-hidden=\"true\">'\n"
    "    + '<span class=\"font-bold text-sm\">' + rejectLabel + '</span></div>';\n"
    "\n"
    "  return '<div class=\"swipe-wrapper\"'\n"
    "    + ' data-swipe-id=\"' + esc(b.id) + '\"'\n"
    "    + ' data-swipe-status=\"' + esc(b.status) + '\">'\n"
    "    + rejectLayer\n"
    "    + approveLayer\n"
    "    + '<div class=\"swipe-card\">' + inner + '</div>'\n"
    "    + '</div>';\n"
    "}"
)

src = src.replace(ANCHOR, ANCHOR + BUILD_SWIPE, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print('admin-render.js patched OK')
