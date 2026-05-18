"""
Patch gas-backend.js to fix Date object concatenation in all SMS handlers.
Run via: python scripts/fix_sms_dates.py
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
        errors.append(f'NOT FOUND: {label}')
        print(f'ERROR — {label}: target not found')
        return False
    content = content.replace(old, new, 1)
    print(f'OK — {label}')
    return True

# ─── Fix 1: add _fmtDate / _fmtTime helpers right after LOG_LEVEL block ──────
patch(
    'helpers insertion',
    "const LOG_LEVEL = {\n"
    "  SUCCESS: '✅ הצלחה',\n"
    "  WARNING: '⚠️ אזהרה',\n"
    "  ERROR:   '❌ שגיאה',\n"
    "  INFO:    'ℹ️ מידע',\n"
    "};",

    "const LOG_LEVEL = {\n"
    "  SUCCESS: '✅ הצלחה',\n"
    "  WARNING: '⚠️ אזהרה',\n"
    "  ERROR:   '❌ שגיאה',\n"
    "  INFO:    'ℹ️ מידע',\n"
    "};\n"
    "\n"
    "/** Convert a Sheets date cell (Date obj or YYYY-MM-DD string) to dd/MM/yyyy for SMS display. */\n"
    "function _fmtDate(raw) {\n"
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'dd/MM/yyyy');\n"
    "  const m = String(raw || '').trim().match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n"
    "  return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(raw || '').trim();\n"
    "}\n"
    "\n"
    "/** Convert a Sheets time cell (Date obj or HH:mm string) to HH:mm for SMS display. */\n"
    "function _fmtTime(raw) {\n"
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'HH:mm');\n"
    "  return String(raw || '').trim();\n"
    "}\n"
    "\n"
    "/** Extract ISO yyyy-MM-dd from a Sheets date cell — used internally for sheet/calendar ops. */\n"
    "function _isoDate(raw) {\n"
    "  if (raw instanceof Date) return Utilities.formatDate(raw, CFG.TZ, 'yyyy-MM-dd');\n"
    "  return String(raw || '').trim();\n"
    "}"
)

# ─── Fix 2a: processApproval — replace String() extraction with helpers ───────
patch(
    'processApproval: date/time extraction',
    "function processApproval(logSh, row, rowIdx, bookingId) {\n"
    "  const date        = String(row[LOG_COL.DATE - 1]).trim();\n"
    "  const time        = String(row[LOG_COL.TIME - 1]).trim();\n"
    "  const duration    = parseInt(row[LOG_COL.DURATION - 1], 10) || 90;\n"
    "  const clientName  = String(row[LOG_COL.NAME - 1]).trim();\n"
    "  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());\n"
    "  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();",

    "function processApproval(logSh, row, rowIdx, bookingId) {\n"
    "  const dateIso     = _isoDate(row[LOG_COL.DATE - 1]);\n"
    "  const date        = _fmtDate(row[LOG_COL.DATE - 1]);\n"
    "  const time        = _fmtTime(row[LOG_COL.TIME - 1]);\n"
    "  const duration    = parseInt(row[LOG_COL.DURATION - 1], 10) || 90;\n"
    "  const clientName  = String(row[LOG_COL.NAME - 1]).trim();\n"
    "  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());\n"
    "  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();"
)

# Fix 2b: CalService.createEvent needs ISO date
patch(
    'processApproval: CalService.createEvent uses ISO date',
    "  const calEventId = CalService.createEvent({\n"
    "    date, time, duration, clientName, serviceName, bookingId,\n"
    "  });",

    "  const calEventId = CalService.createEvent({\n"
    "    date: dateIso, time, duration, clientName, serviceName, bookingId,\n"
    "  });"
)

# Fix 2c: updateSlotStatus + invalidateSlotsCache in processApproval
patch(
    'processApproval: updateSlotStatus/cache use ISO date',
    "  // ── Update Weekly_Slots: mark slot as Booked ──\n"
    "  updateSlotStatus(date, time, 'Booked');\n"
    "  invalidateSlotsCache(date);",

    "  // ── Update Weekly_Slots: mark slot as Booked ──\n"
    "  updateSlotStatus(dateIso, time, 'Booked');\n"
    "  invalidateSlotsCache(dateIso);"
)

# Fix 2d: log line in processApproval
patch(
    'processApproval: log line uses ISO date',
    "  log(LOG_LEVEL.SUCCESS, ACTION.ADMIN_APPROVE, 'הזמנה אושרה — יומן עודכן', { phone: clientPhone, bookingId: bookingId, detail: serviceName + ' | ' + date + ' ' + time + ' | calEvent:' + calEventId });",
    "  log(LOG_LEVEL.SUCCESS, ACTION.ADMIN_APPROVE, 'הזמנה אושרה — יומן עודכן', { phone: clientPhone, bookingId: bookingId, detail: serviceName + ' | ' + dateIso + ' ' + time + ' | calEvent:' + calEventId });"
)

# ─── Fix 3a: processRejection — same treatment ────────────────────────────────
patch(
    'processRejection: date/time extraction',
    "function processRejection(logSh, row, rowIdx, bookingId) {\n"
    "  const date        = String(row[LOG_COL.DATE - 1]).trim();\n"
    "  const time        = String(row[LOG_COL.TIME - 1]).trim();\n"
    "  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());\n"
    "  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();",

    "function processRejection(logSh, row, rowIdx, bookingId) {\n"
    "  const dateIso     = _isoDate(row[LOG_COL.DATE - 1]);\n"
    "  const date        = _fmtDate(row[LOG_COL.DATE - 1]);\n"
    "  const time        = _fmtTime(row[LOG_COL.TIME - 1]);\n"
    "  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());\n"
    "  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();"
)

# Fix 3b: updateSlotStatus + cache in processRejection
patch(
    'processRejection: updateSlotStatus/cache use ISO date',
    "  // ── Release slot back to Available ──\n"
    "  updateSlotStatus(date, time, 'Available');\n"
    "  invalidateSlotsCache(date); // bust cache so rejected slot reappears immediately",

    "  // ── Release slot back to Available ──\n"
    "  updateSlotStatus(dateIso, time, 'Available');\n"
    "  invalidateSlotsCache(dateIso); // bust cache so rejected slot reappears immediately"
)

# Fix 3c: log line in processRejection
patch(
    'processRejection: log line uses ISO date',
    "  log(LOG_LEVEL.INFO, ACTION.ADMIN_REJECT, 'הזמנה נדחתה — חריץ שוחרר', { phone: clientPhone, bookingId: bookingId, detail: serviceName + ' | ' + date + ' ' + time });",
    "  log(LOG_LEVEL.INFO, ACTION.ADMIN_REJECT, 'הזמנה נדחתה — חריץ שוחרר', { phone: clientPhone, bookingId: bookingId, detail: serviceName + ' | ' + dateIso + ' ' + time });"
)

# ─── Fix 4: processCancellation — replace manual Utilities.formatDate with helpers ──
patch(
    'processCancellation: replace manual formatDate with helpers',
    "  const date    = (rawDate instanceof Date)\n"
    "    ? Utilities.formatDate(rawDate, TZ_, 'yyyy-MM-dd') : String(rawDate || '').trim();\n"
    "  const time    = (rawTime instanceof Date)\n"
    "    ? Utilities.formatDate(rawTime, TZ_, 'HH:mm') : String(rawTime || '').trim();",

    "  const dateIso = _isoDate(rawDate);\n"
    "  const date    = _fmtDate(rawDate);\n"
    "  const time    = _fmtTime(rawTime);"
)

# Fix 4b: updateSlotStatus + cache in processCancellation use ISO date
patch(
    'processCancellation: updateSlotStatus/cache use ISO date',
    "  updateSlotStatus(date, time, 'Available');\n"
    "  invalidateSlotsCache(date);",

    "  updateSlotStatus(dateIso, time, 'Available');\n"
    "  invalidateSlotsCache(dateIso);"
)

# ─── Fix 5: verifyAndBook admin SMS — booking.date is YYYY-MM-DD string ──────
patch(
    'verifyAndBook: admin SMS uses _fmtDate for booking.date',
    "      `תאריך: ${booking.date} בשעה ${booking.time}`,",
    "      'תאריך: ' + _fmtDate(booking.date) + ' בשעה ' + booking.time + ','[0] + _fmtDate(booking.date)[0] && "
    "('תאריך: ' + _fmtDate(booking.date) + ' בשעה ' + booking.time),"
)

# Simpler version of fix 5 — avoid JS template literal confusion
# First undo the broken attempt if it happened
BAD5 = ("      'תאריך: ' + _fmtDate(booking.date) + ' בשעה ' + booking.time + ','[0] + _fmtDate(booking.date)[0] && "
        "('תאריך: ' + _fmtDate(booking.date) + ' בשעה ' + booking.time),")
GOOD5 = "      'תאריך: ' + _fmtDate(booking.date) + ' בשעה ' + booking.time,"

if BAD5 in content:
    content = content.replace(BAD5, GOOD5)
    print('OK — verifyAndBook: admin SMS (cleanup applied)')
elif GOOD5 not in content:
    # Try original
    ORIG5 = "      `תאריך: ${booking.date} בשעה ${booking.time}`,"
    if ORIG5 in content:
        content = content.replace(ORIG5, GOOD5, 1)
        print('OK — verifyAndBook: admin SMS uses _fmtDate for booking.date')
    else:
        errors.append('verifyAndBook admin SMS not found')
        print('ERROR — verifyAndBook admin SMS: target not found')

# Write back
with open(gjs, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(gjs, 'r', encoding='utf-8') as f:
    gv = f.read()

checks = [
    ('function _fmtDate(',      'helpers'),
    ('function _fmtTime(',      'helpers'),
    ('function _isoDate(',      'helpers'),
    ('_fmtDate(row[LOG_COL.DATE - 1])', 'processApproval/Rejection'),
    ('date: dateIso',            'CalService ISO date'),
    ('updateSlotStatus(dateIso', 'updateSlotStatus ISO date'),
    ('_fmtDate(rawDate)',         'processCancellation'),
    ("'תאריך: ' + _fmtDate(booking.date)", 'admin SMS'),
]
print()
all_ok = True
for snippet, label in checks:
    ok = snippet in gv
    print(f'  {"✅" if ok else "❌"} {label}: {snippet[:50]}')
    if not ok:
        all_ok = False

print()
if errors:
    print(f'ERRORS: {errors}')
    sys.exit(1)
elif all_ok:
    print('All patches verified OK')
else:
    print('Some verifications failed — check above')
    sys.exit(1)
