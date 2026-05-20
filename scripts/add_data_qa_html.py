"""
add_data_qa_html.py
Adds data-qa attributes to every functional element in index.html and test.html.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []

def patch(path, label, old, new):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        errors.append(f'{os.path.basename(path)} — NOT FOUND: {label}')
        print(f'  ERR — {label}')
        return
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'  OK  — {label}')

# ══════════════════════════════════════════════════════════════════
#  index.html
# ══════════════════════════════════════════════════════════════════
idx = os.path.join(cwd, 'frontend', 'index.html')
print('── index.html ──────────────────────────────────')

patch(idx, 'btn-prev-month',
    '<button id="js-prev-month" aria-label="חודש קודם"',
    '<button id="js-prev-month" data-qa="btn-prev-month" aria-label="חודש קודם"')

patch(idx, 'btn-next-month',
    '<button id="js-next-month" aria-label="חודש הבא"',
    '<button id="js-next-month" data-qa="btn-next-month" aria-label="חודש הבא"')

patch(idx, 'inp-name',
    '<input id="inp-name" type="text"',
    '<input id="inp-name" data-qa="inp-name" type="text"')

patch(idx, 'inp-phone',
    '<input id="inp-phone" type="tel"',
    '<input id="inp-phone" data-qa="inp-phone" type="tel"')

patch(idx, 'btn-not-me',
    '<button id="js-not-me" class="text-xs text-text-muted underline shrink-0">לא אני</button>',
    '<button id="js-not-me" data-qa="btn-not-me" class="text-xs text-text-muted underline shrink-0">לא אני</button>')

patch(idx, 'banner-returning (data-qa)',
    '<div id="js-returning-banner"',
    '<div id="js-returning-banner" data-qa="banner-returning"')

patch(idx, 'status-otp-error',
    '<div id="js-otp-error"',
    '<div id="js-otp-error" data-qa="status-otp-error"')

patch(idx, 'otp-inputs-wrap',
    '<div dir="ltr" id="js-otp-inputs"',
    '<div dir="ltr" id="js-otp-inputs" data-qa="otp-inputs-wrap"')

patch(idx, 'btn-otp-resend',
    '<button id="js-resend" disabled',
    '<button id="js-resend" data-qa="btn-otp-resend" disabled')

patch(idx, 'confirm-details',
    '<div id="js-confirm-details"',
    '<div id="js-confirm-details" data-qa="confirm-details"')

patch(idx, 'confirm-id',
    '<div id="js-confirm-id"',
    '<div id="js-confirm-id" data-qa="confirm-id"')

patch(idx, 'btn-book-again',
    '<button id="js-book-again"',
    '<button id="js-book-again" data-qa="btn-book-again"')

patch(idx, 'btn-open-privacy',
    '<button id="js-open-privacy" type="button"',
    '<button id="js-open-privacy" data-qa="btn-open-privacy" type="button"')

patch(idx, 'btn-open-accessibility',
    '<button id="js-open-accessibility" type="button"',
    '<button id="js-open-accessibility" data-qa="btn-open-accessibility" type="button"')

patch(idx, 'btn-modal-close',
    '<button id="js-modal-close" type="button" aria-label="סגירה"',
    '<button id="js-modal-close" data-qa="btn-modal-close" type="button" aria-label="סגירה"')

patch(idx, 'btn-back',
    '<button id="btn-back"',
    '<button id="btn-back" data-qa="btn-back"')

patch(idx, 'btn-next',
    '<button id="btn-next" disabled',
    '<button id="btn-next" data-qa="btn-next" disabled')

patch(idx, 'status-toast',
    '<div id="js-toast"',
    '<div id="js-toast" data-qa="status-toast"')

# ══════════════════════════════════════════════════════════════════
#  test.html
# ══════════════════════════════════════════════════════════════════
tst = os.path.join(cwd, 'frontend', 'test.html')
print()
print('── test.html ───────────────────────────────────')

patch(tst, 'inp-admin-token',
    '<input id="js-token" type="password"',
    '<input id="js-token" data-qa="inp-admin-token" type="password"')

patch(tst, 'btn-save-token',
    '<button onclick="saveToken()"',
    '<button data-qa="btn-save-token" onclick="saveToken()"')

patch(tst, 'status-token',
    '<p id="js-token-status"',
    '<p id="js-token-status" data-qa="status-token"')

patch(tst, 'btn-health-check',
    '<button onclick="runHealthCheck()"',
    '<button data-qa="btn-health-check" onclick="runHealthCheck()"')

patch(tst, 'status-health-result',
    '<pre id="js-health-result"',
    '<pre id="js-health-result" data-qa="status-health-result"')

patch(tst, 'inp-mock-name',
    '<input id="f-name"',
    '<input id="f-name" data-qa="inp-mock-name"')

patch(tst, 'inp-mock-phone',
    '<input id="f-phone"',
    '<input id="f-phone" data-qa="inp-mock-phone"')

patch(tst, 'sel-mock-service',
    '<select id="f-service"',
    '<select id="f-service" data-qa="sel-mock-service"')

patch(tst, 'inp-mock-date',
    '<input id="f-date" type="date"',
    '<input id="f-date" data-qa="inp-mock-date" type="date"')

patch(tst, 'inp-mock-time',
    '<input id="f-time"',
    '<input id="f-time" data-qa="inp-mock-time"')

patch(tst, 'btn-inject',
    '<button onclick="injectBooking()" id="js-inject-btn"',
    '<button onclick="injectBooking()" id="js-inject-btn" data-qa="btn-inject"')

patch(tst, 'status-inject-result',
    '<pre id="js-inject-result"',
    '<pre id="js-inject-result" data-qa="status-inject-result"')

patch(tst, 'btn-run-e2e',
    '<button onclick="runE2E()" id="js-e2e-btn"',
    '<button onclick="runE2E()" id="js-e2e-btn" data-qa="btn-run-e2e"')

patch(tst, 'status-e2e-steps',
    '<div id="js-e2e-steps"',
    '<div id="js-e2e-steps" data-qa="status-e2e-steps"')

patch(tst, 'status-e2e-verdict',
    '<div id="js-e2e-verdict"',
    '<div id="js-e2e-verdict" data-qa="status-e2e-verdict"')

patch(tst, 'btn-refresh-bookings',
    '<button onclick="loadBookings()"',
    '<button data-qa="btn-refresh-bookings" onclick="loadBookings()"')

patch(tst, 'status-bookings-list',
    '<div id="js-bookings-list"',
    '<div id="js-bookings-list" data-qa="status-bookings-list"')

patch(tst, 'btn-run-unit-tests',
    '<button onclick="runUnitTests()"',
    '<button data-qa="btn-run-unit-tests" onclick="runUnitTests()"')

patch(tst, 'status-test-results',
    '<div id="js-test-results"',
    '<div id="js-test-results" data-qa="status-test-results"')

patch(tst, 'status-test-summary',
    '<div id="js-test-summary"',
    '<div id="js-test-summary" data-qa="status-test-summary"')

print()
if errors:
    print('ERRORS:')
    for e in errors: print(' ', e)
    sys.exit(1)
else:
    print('All data-qa patches applied to HTML files.')
