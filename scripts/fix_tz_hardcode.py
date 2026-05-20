"""
fix_tz_hardcode.py
Replaces every timezone reference that could be null/undefined with the
hardcoded string 'Asia/Jerusalem' in gas-backend.js.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
gjs = os.path.join(cwd, 'backend', 'gas-backend.js')

with open(gjs, 'r', encoding='utf-8') as f:
    content = f.read()

errors = []

def patch(label, old, new):
    global content
    if old not in content:
        errors.append(label)
        print(f'ERROR — {label}: not found')
        return False
    n = content.count(old)
    content = content.replace(old, new)
    print(f'OK ({n}x) — {label}')
    return True

# ─── Fix 1: _fmtDate — CFG.TZ → 'Asia/Jerusalem' ────────────────────────────
patch(
    '_fmtDate: CFG.TZ → hardcoded',
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'dd/MM/yyyy');",
    "  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'dd/MM/yyyy');"
)

# ─── Fix 2: _fmtTime — CFG.TZ → 'Asia/Jerusalem' ────────────────────────────
patch(
    '_fmtTime: CFG.TZ → hardcoded',
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'HH:mm');",
    "  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'HH:mm');"
)

# ─── Fix 3: _isoDate — CFG.TZ → 'Asia/Jerusalem' ────────────────────────────
patch(
    '_isoDate: CFG.TZ → hardcoded',
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'yyyy-MM-dd');",
    "  if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Jerusalem', 'yyyy-MM-dd');"
)

# ─── Fix 4: syncCalendarToSlots — Session.getScriptTimeZone() ────────────────
patch(
    'syncCalendarToSlots: Session.getScriptTimeZone() → hardcoded',
    "  var tz     = Session.getScriptTimeZone() || 'Asia/Jerusalem';",
    "  var tz     = 'Asia/Jerusalem';"
)

# ─── Fix 5: nowISO() — CFG.TIMEZONE → hardcoded ─────────────────────────────
patch(
    'nowISO: CFG.TIMEZONE → hardcoded',
    "  const tz   = CFG.TIMEZONE;\n  const now  = new Date();\n  const fmt  = Utilities.formatDate(now, tz,",
    "  const now  = new Date();\n  const fmt  = Utilities.formatDate(now, 'Asia/Jerusalem',"
)

# ─── Verify no remaining CFG.TZ references ───────────────────────────────────
remaining = [i+1 for i,l in enumerate(content.splitlines()) if 'CFG.TZ' in l and '//' not in l.lstrip()[:5]]
if remaining:
    print(f'WARNING: CFG.TZ still present at lines: {remaining}')
    errors.append('CFG.TZ remaining')

remaining_session = [i+1 for i,l in enumerate(content.splitlines()) if 'Session.getScriptTimeZone' in l]
if remaining_session:
    print(f'WARNING: Session.getScriptTimeZone still present at lines: {remaining_session}')
    errors.append('Session.getScriptTimeZone remaining')

remaining_cfg_tz = [i+1 for i,l in enumerate(content.splitlines()) if 'CFG.TIMEZONE' in l]
if remaining_cfg_tz:
    print(f'WARNING: CFG.TIMEZONE still present at lines: {remaining_cfg_tz}')

with open(gjs, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(gjs, 'r', encoding='utf-8') as f:
    gv = f.read()

checks = [
    ("Utilities.formatDate(raw, 'Asia/Jerusalem', 'dd/MM/yyyy')", '_fmtDate'),
    ("Utilities.formatDate(raw, 'Asia/Jerusalem', 'HH:mm')",      '_fmtTime'),
    ("Utilities.formatDate(raw, 'Asia/Jerusalem', 'yyyy-MM-dd')", '_isoDate'),
    ("var tz     = 'Asia/Jerusalem';",                            'syncCalendarToSlots'),
    ("Utilities.formatDate(now, 'Asia/Jerusalem',",               'nowISO'),
]
print()
all_ok = True
for snippet, label in checks:
    ok = snippet in gv
    print(f'  {"OK" if ok else "FAIL"} — {label}')
    if not ok:
        all_ok = False

print()
if errors:
    print(f'ERRORS: {errors}')
    sys.exit(1)
elif all_ok:
    print('All timezone fixes verified OK')
else:
    print('Some verifications failed')
    sys.exit(1)
