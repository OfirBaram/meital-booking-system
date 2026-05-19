"""
Fix two SyntaxError: Unexpected string bugs in admin.js.
Both stem from ','' (closing string literal immediately followed by another
string literal with no operator between them).

Line 940 (renderDiarySlots)  – in HTML string generation
Line 984 (toggleDiarySlot)   – in setAttribute call

Usage: python fix_admin_syntax.py <abs_path_to_admin.js>
"""
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

errors = []

# ── FIX 1: renderDiarySlots onclick (line ~940) ─────────────────────────────
OLD1 = """            '<button data-action-btn onclick="toggleDiarySlot(' + s.id + ','' + s.status + '')" ' +"""
NEW1 = """            '<button data-action-btn onclick="toggleDiarySlot(' + s.id + ",'" + s.status + "')" ' +"""

count1 = src.count(OLD1)
if count1 != 1:
    errors.append('FIX 1 anchor found ' + str(count1) + ' times (expected 1)')
else:
    src = src.replace(OLD1, NEW1, 1)
    print('FIX 1 OK: renderDiarySlots onclick quote fixed')

# ── FIX 2: toggleDiarySlot setAttribute (line ~984) ─────────────────────────
OLD2 = """      'toggleDiarySlot(' + slotId + ','' + r.newStatus + '')');"""
NEW2 = """      "toggleDiarySlot(" + slotId + ",'" + r.newStatus + "')");"""

count2 = src.count(OLD2)
if count2 != 1:
    errors.append('FIX 2 anchor found ' + str(count2) + ' times (expected 1)')
else:
    src = src.replace(OLD2, NEW2, 1)
    print('FIX 2 OK: toggleDiarySlot setAttribute quote fixed')

if errors:
    for e in errors:
        print('ERROR: ' + e, file=sys.stderr)
    sys.exit(1)

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)
print('admin.js written — SyntaxErrors resolved')
