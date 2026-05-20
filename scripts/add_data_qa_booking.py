"""
add_data_qa_booking.py
Adds data-qa attributes to every dynamically-rendered element in booking.js,
and updates internal querySelectorAll calls to prefer data-qa selectors.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bjs = os.path.join(cwd, 'frontend', 'booking.js')

with open(bjs, 'r', encoding='utf-8') as f:
    content = f.read()

errors = []

def patch(label, old, new, count=1):
    global content
    found = content.count(old)
    if found == 0:
        errors.append(label)
        print(f'  ERR — {label}: not found')
        return
    content = content.replace(old, new, count)
    print(f'  OK  — {label} ({found} occurrence{"s" if found > 1 else ""})')

# ── renderServices: add data-qa to service card buttons ──────────────────────
patch('service-card data-qa',
    '    data-id="${s.id}"\n    >',
    '    data-id="${s.id}" data-qa="card-service-${s.id}"\n    >')

# ── renderCalendar: add data-qa to each day cell ─────────────────────────────
patch('cal-day data-qa',
    '      <div class="${cls}" data-date="${key}" role="button" tabindex="${disabled ? -1 : 0}"\n'
    '           aria-label="${key}" aria-pressed="${sel}">',
    '      <div class="${cls}" data-date="${key}" data-qa="cal-day" role="button" tabindex="${disabled ? -1 : 0}"\n'
    '           aria-label="${key}" aria-pressed="${sel}">')

# ── renderSlots: add data-qa to each time slot ───────────────────────────────
patch('time-slot data-qa',
    '    <div class="time-slot ${State.time === t ? \'selected\' : \'\'}" data-time="${t}">',
    '    <div class="time-slot ${State.time === t ? \'selected\' : \'\'}" data-time="${t}" data-qa="slot-btn">',)

# ── renderOTPInputs: add data-qa per digit ───────────────────────────────────
patch('otp-input data-qa',
    '      data-idx="${i}"\n'
    '      aria-label="ספרה ${i + 1}"',
    '      data-idx="${i}" data-qa="otp-digit"\n'
    '      aria-label="ספרה ${i + 1}"')

# ── renderConfirmation rows: add data-qa to each summary row ─────────────────
patch('confirm-row data-qa',
    '    <div class="flex items-center justify-between">\n'
    '      <span class="text-text-muted text-xs font-medium">${r.label}</span>\n'
    '      <span class="text-text-main text-sm font-semibold">${r.value}</span>\n'
    '    </div>',
    '    <div class="flex items-center justify-between" data-qa="confirm-row">\n'
    '      <span class="text-text-muted text-xs font-medium">${r.label}</span>\n'
    '      <span class="text-text-main text-sm font-semibold">${r.value}</span>\n'
    '    </div>')

# ── renderProgress: add data-qa to step indicator circles ────────────────────
# Done step
patch('step-indicator done',
    'html += \'<div class="flex flex-col items-center shrink-0">\';',
    'html += `<div class="flex flex-col items-center shrink-0" data-qa="step-indicator-${n}">`;\n'
    '    // (original open tag replaced above)')

# Fix: the above replacement is wrong syntax for concatenated strings — use direct approach
# Revert and do a simpler injection on the container div
with open(bjs, 'r', encoding='utf-8') as f:
    content = f.read()
errors_copy = list(errors)

# Re-apply all previous patches cleanly
content2 = content  # work on fresh read

def p2(label, old, new, cnt=1):
    global content2
    found = content2.count(old)
    if found == 0:
        errors.append(label + ' [pass2]')
        print(f'  ERR — {label}')
        return
    content2 = content2.replace(old, new, cnt)
    print(f'  OK  — {label}')

print()
print('Pass 2 (clean state):')

p2('service-card data-qa',
    '    data-id="${s.id}"\n    >',
    '    data-id="${s.id}" data-qa="card-service-${s.id}"\n    >')

p2('cal-day data-qa',
    '      <div class="${cls}" data-date="${key}" role="button" tabindex="${disabled ? -1 : 0}"\n'
    '           aria-label="${key}" aria-pressed="${sel}">',
    '      <div class="${cls}" data-date="${key}" data-qa="cal-day" role="button" tabindex="${disabled ? -1 : 0}"\n'
    '           aria-label="${key}" aria-pressed="${sel}">')

p2('time-slot data-qa',
    '    <div class="time-slot ${State.time === t ? \'selected\' : \'\'}" data-time="${t}">',
    '    <div class="time-slot ${State.time === t ? \'selected\' : \'\'}" data-time="${t}" data-qa="slot-btn">')

p2('otp-input data-qa',
    '      data-idx="${i}"\n'
    '      aria-label="ספרה ${i + 1}"',
    '      data-idx="${i}" data-qa="otp-digit"\n'
    '      aria-label="ספרה ${i + 1}"')

p2('confirm-row data-qa',
    '    <div class="flex items-center justify-between">\n'
    '      <span class="text-text-muted text-xs font-medium">${r.label}</span>\n'
    '      <span class="text-text-main text-sm font-semibold">${r.value}</span>\n'
    '    </div>',
    '    <div class="flex items-center justify-between" data-qa="confirm-row">\n'
    '      <span class="text-text-muted text-xs font-medium">${r.label}</span>\n'
    '      <span class="text-text-main text-sm font-semibold">${r.value}</span>\n'
    '    </div>')

# Step indicator: inject data-qa on the outer container div
p2('step-indicator container',
    "html += '<div class=\"flex flex-col items-center shrink-0\">';",
    "html += `<div class=\"flex flex-col items-center shrink-0\" data-qa=\"step-indicator-${n}\">`;")

# ── Internal querySelector updates: prefer data-qa over class selectors ───────

# getOTP and clearOTPInputs use '.otp-input' → '[data-qa="otp-digit"]'
p2('getOTP uses data-qa selector',
    "return Array.from(document.querySelectorAll('.otp-input')).map(i => i.value).join('');",
    "return Array.from(document.querySelectorAll('[data-qa=\"otp-digit\"]')).map(i => i.value).join('');")

p2('clearOTPInputs uses data-qa selector (1)',
    "document.querySelectorAll('.otp-input').forEach(i => {\n"
    "    i.value = '';\n"
    "    i.classList.remove('filled');\n"
    "    if (markError) i.classList.add('error');\n"
    "  });",
    "document.querySelectorAll('[data-qa=\"otp-digit\"]').forEach(i => {\n"
    "    i.value = '';\n"
    "    i.classList.remove('filled');\n"
    "    if (markError) i.classList.add('error');\n"
    "  });")

p2('clearOTPInputs uses data-qa selector (2)',
    "document.querySelectorAll('.otp-input').forEach(i => i.classList.remove('error'));\n"
    "    document.querySelector('.otp-input[data-idx=\"0\"]')?.focus();",
    "document.querySelectorAll('[data-qa=\"otp-digit\"]').forEach(i => i.classList.remove('error'));\n"
    "    document.querySelector('[data-qa=\"otp-digit\"][data-idx=\"0\"]')?.focus();")

# renderServices uses '.service-card' → '[data-qa^="card-service"]'
p2('renderServices uses data-qa selector',
    "document.querySelectorAll('.service-card').forEach(c =>",
    "document.querySelectorAll('[data-qa^=\"card-service\"]').forEach(c =>")

content2_final = content2

with open(bjs, 'w', encoding='utf-8') as f:
    f.write(content2_final)

print()
# Verify
with open(bjs, 'r', encoding='utf-8') as f:
    gv = f.read()

checks = [
    ('data-qa="card-service-${s.id}"',        'service-card'),
    ('data-qa="cal-day"',                      'cal-day'),
    ('data-qa="slot-btn"',                     'slot-btn'),
    ('data-qa="otp-digit"',                    'otp-digit'),
    ('data-qa="confirm-row"',                  'confirm-row'),
    ('data-qa="step-indicator-${n}"',          'step-indicator'),
    ('[data-qa="otp-digit"]',                  'querySelector otp-digit'),
    ('[data-qa^="card-service"]',              'querySelector card-service'),
]
all_ok = True
for snippet, label in checks:
    ok = snippet in gv
    print(f'  {"OK" if ok else "FAIL"} — {label}')
    if not ok:
        all_ok = False

print()
if errors and len(errors) != len(errors_copy):
    print('ERRORS:', [e for e in errors if e not in errors_copy])
    sys.exit(1)
elif all_ok:
    print('All booking.js data-qa patches verified OK')
else:
    sys.exit(1)
