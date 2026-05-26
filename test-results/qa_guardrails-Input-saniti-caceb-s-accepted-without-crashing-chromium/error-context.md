# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa_guardrails.spec.js >> Input sanitization — XSS protection >> 200-character name is accepted without crashing
- Location: tests\e2e\qa_guardrails.spec.js:162:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-qa="cal-day"].avail').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('[data-qa="cal-day"].avail').first()

```

```yaml
- banner:
  - img "מיטל שבע ברעם"
  - heading "מיטל שבע ברעם" [level=1]
  - paragraph: לק ג'ל בוטק
- main:
  - img
  - text: בחירת שירות 2 תאריך ושעה 3 פרטים אישיים 4 אימות SMS
  - heading "תאריך ושעה" [level=2]
  - paragraph: ✨ לק ג'ל קלאסי
  - button "חודש קודם":
    - img
  - heading "מאי 2026" [level=3]
  - button "חודש הבא":
    - img
  - text: א' ב' ג' ד' ה' ו' ש'
  - button "2026-05-01": "1"
  - button "2026-05-02": "2"
  - button "2026-05-03": "3"
  - button "2026-05-04": "4"
  - button "2026-05-05": "5"
  - button "2026-05-06": "6"
  - button "2026-05-07": "7"
  - button "2026-05-08": "8"
  - button "2026-05-09": "9"
  - button "2026-05-10": "10"
  - button "2026-05-11": "11"
  - button "2026-05-12": "12"
  - button "2026-05-13": "13"
  - button "2026-05-14": "14"
  - button "2026-05-15": "15"
  - button "2026-05-16": "16"
  - button "2026-05-17": "17"
  - button "2026-05-18": "18"
  - button "2026-05-19": "19"
  - button "2026-05-20": "20"
  - button "2026-05-21": "21"
  - button "2026-05-22": "22"
  - button "2026-05-23": "23"
  - button "2026-05-24": "24"
  - button "2026-05-25": "25"
  - button "2026-05-26": "26"
  - button "2026-05-27": "27"
  - button "2026-05-28": "28"
  - button "2026-05-29": "29"
  - button "2026-05-30": "30"
  - button "2026-05-31": "31"
  - paragraph: אין תורים פנויים לחודש זה, נסי חודש אחר
- contentinfo:
  - navigation "קישורי מידע משפטי":
    - button "מדיניות פרטיות"
    - button "הצהרת נגישות"
  - paragraph: © 2025 מיטל שבע ברעם
- button "חזרה"
- button "המשך" [disabled]
```

# Test source

```ts
  1   | /**
  2   |  * tests/e2e/qa_guardrails.spec.js
  3   |  * QA Guardrail Tests — Test Stability Layer (Phase 5.1)
  4   |  *
  5   |  * Covers three risk classes:
  6   |  *  1. Input sanitization  — XSS payloads in name/phone are neutralised
  7   |  *  2. Error boundaries    — 503 Server Offline and 429 Rate Limit handled gracefully
  8   |  *  3. State preservation  — phone persisted to localStorage; clean recovery after reload
  9   |  *  4. data-qa coverage    — structural smoke test: every required element is reachable
  10  |  *
  11  |  * Rule: ALL selectors MUST use [data-qa="..."] — never CSS class or ID selectors.
  12  |  */
  13  | import { test, expect } from '@playwright/test'
  14  | 
  15  | // ─── Mock infrastructure ──────────────────────────────────────────────────────
  16  | 
  17  | const GAS_GLOB     = 'https://script.google.com/macros/s/**'
  18  | const TEST_GAS_URL = 'https://script.google.com/macros/s/TEST_MOCK_ID/exec'
  19  | 
  20  | const SB_FUNC_GLOB = 'https://supabase.test.mock/functions/v1/**'
  21  | const TEST_SB_URL  = 'https://supabase.test.mock'
  22  | 
  23  | function makeMockSlots(year, month) {
  24  |   const slots = {}
  25  |   const floor  = new Date(); floor.setHours(0, 0, 0, 0)
  26  |   const days   = new Date(year, month, 0).getDate()
  27  |   const BASE   = ['09:00', '10:30', '12:00', '13:30']
  28  |   for (let d = 1; d <= days; d++) {
  29  |     const date = new Date(year, month - 1, d)
  30  |     if (date < floor || date.getDay() === 5 || date.getDay() === 6) continue
  31  |     const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  32  |     slots[key] = BASE
  33  |   }
  34  |   return { success: true, slots }
  35  | }
  36  | 
  37  | async function setupMocks(page, overrides = {}) {
  38  |   await page.route('**/config.js', route =>
  39  |     route.fulfill({
  40  |       status:      200,
  41  |       contentType: 'application/javascript',
  42  |       body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
  43  |     })
  44  |   )
  45  | 
  46  |   await page.route(GAS_GLOB, async (route, request) => {
  47  |     if (request.method() === 'GET') {
  48  |       const url   = new URL(request.url())
  49  |       const year  = parseInt(url.searchParams.get('year'),  10)
  50  |       const month = parseInt(url.searchParams.get('month'), 10)
  51  |       return route.fulfill({
  52  |         status:      200,
  53  |         contentType: 'application/json',
  54  |         body:        JSON.stringify(makeMockSlots(year, month)),
  55  |       })
  56  |     }
  57  |     return route.continue()
  58  |   })
  59  | 
  60  |   await page.route(SB_FUNC_GLOB, async (route, request) => {
  61  |     const path = request.url().split('/').pop()
  62  | 
  63  |     if (path === 'send-otp' && overrides.sendOTP) return overrides.sendOTP(route)
  64  |     if (path === 'verify-and-book' && overrides.verifyAndBook) return overrides.verifyAndBook(route)
  65  | 
  66  |     if (path === 'send-otp')
  67  |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  68  |     if (path === 'verify-and-book')
  69  |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, bookingId: 'test-uuid', status: 'Pending' }) })
  70  | 
  71  |     return route.fulfill({ status: 400, body: '{}' })
  72  |   })
  73  | }
  74  | 
  75  | // ─── Step helpers (data-qa selectors throughout) ─────────────────────────────
  76  | 
  77  | async function goToStep2(page) {
  78  |   await page.locator('[data-qa^="card-service"]').first().click()
  79  |   await page.locator('[data-qa="btn-next"]').click()
  80  |   await expect(page.locator('#step-2')).toBeVisible({ timeout: 8_000 })
  81  | }
  82  | 
  83  | async function goToStep3(page) {
  84  |   await goToStep2(page)
> 85  |   await expect(page.locator('[data-qa="cal-day"].avail').first()).toBeVisible({ timeout: 8_000 })
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
  86  |   await page.locator('[data-qa="cal-day"].avail').first().click()
  87  |   await expect(page.locator('[data-qa="slot-btn"]').first()).toBeVisible({ timeout: 5_000 })
  88  |   await page.locator('[data-qa="slot-btn"]').first().click()
  89  |   await page.locator('[data-qa="btn-next"]').click()
  90  |   await expect(page.locator('#step-3')).toBeVisible({ timeout: 8_000 })
  91  | }
  92  | 
  93  | async function goToStep4(page) {
  94  |   await goToStep3(page)
  95  |   await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
  96  |   await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  97  |   await page.locator('[data-qa="btn-next"]').click()
  98  |   await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  99  |   await expect(page.locator('[data-qa="otp-digit"]')).toHaveCount(6)
  100 | }
  101 | 
  102 | async function fillOTP(page, code) {
  103 |   // booking.js renderOTPInputs() schedules setTimeout(focus(0), 300) which races
  104 |   // with sequential .nth(i).fill() in Chromium; dispatching the input events from
  105 |   // page context is synchronous and immune to the focus race.
  106 |   await page.evaluate((digits) => {
  107 |     const inputs = document.querySelectorAll('[data-qa="otp-digit"]')
  108 |     for (let i = 0; i < digits.length; i++) {
  109 |       const inp = inputs[i]
  110 |       if (!inp) return
  111 |       inp.value = digits[i]
  112 |       inp.dispatchEvent(new Event('input', { bubbles: true }))
  113 |     }
  114 |   }, code)
  115 | }
  116 | 
  117 | // ─── 1. Input sanitization ────────────────────────────────────────────────────
  118 | 
  119 | test.describe('Input sanitization — XSS protection', () => {
  120 |   test.beforeEach(async ({ page }) => {
  121 |     await setupMocks(page)
  122 |     await page.goto('/')
  123 |   })
  124 | 
  125 |   test('onerror-based XSS payload in name does not execute in confirmation', async ({ page }) => {
  126 |     await page.evaluate(() => { window.__xss = false })
  127 |     await goToStep3(page)
  128 |     // length >= 2 so isValidName() passes; contains onerror XSS attempt
  129 |     await page.locator('[data-qa="inp-name"]').fill('<img src=x onerror="window.__xss=true">A')
  130 |     await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  131 |     await page.locator('[data-qa="btn-next"]').click()
  132 |     await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  133 |     await fillOTP(page, '123456')
  134 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  135 |     const xssExecuted = await page.evaluate(() => window.__xss)
  136 |     expect(xssExecuted).toBe(false)
  137 |   })
  138 | 
  139 |   test('HTML tags in name appear as escaped text in confirmation, not as DOM elements', async ({ page }) => {
  140 |     await goToStep3(page)
  141 |     await page.locator('[data-qa="inp-name"]').fill('<b>bold</b>')
  142 |     await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  143 |     await page.locator('[data-qa="btn-next"]').click()
  144 |     await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  145 |     await fillOTP(page, '123456')
  146 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  147 |     // No actual <b> element should be injected inside confirm-row
  148 |     await expect(page.locator('[data-qa="confirm-row"] b')).toHaveCount(0)
  149 |     // The literal tag characters must appear as text, not rendered HTML
  150 |     const summaryText = await page.locator('[data-qa="confirm-details"]').textContent()
  151 |     expect(summaryText).toContain('<b>bold</b>')
  152 |   })
  153 | 
  154 |   test('XSS payload in phone field keeps Next button disabled (invalid format)', async ({ page }) => {
  155 |     await goToStep3(page)
  156 |     await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
  157 |     await page.locator('[data-qa="inp-phone"]').fill('<script>alert(1)</script>')
  158 |     // Not a valid 05X number → btn-next must remain disabled
  159 |     await expect(page.locator('[data-qa="btn-next"]')).toBeDisabled()
  160 |   })
  161 | 
  162 |   test('200-character name is accepted without crashing', async ({ page }) => {
  163 |     const longName = 'א'.repeat(200)
  164 |     await goToStep3(page)
  165 |     await page.locator('[data-qa="inp-name"]').fill(longName)
  166 |     await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  167 |     await page.locator('[data-qa="btn-next"]').click()
  168 |     await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  169 |   })
  170 | })
  171 | 
  172 | // ─── 2. Error boundaries — 503 Server Offline ────────────────────────────────
  173 | 
  174 | test.describe('Error boundaries — server offline (503)', () => {
  175 |   test('503 on sendOTP shows a Hebrew toast and keeps the user on step 3', async ({ page }) => {
  176 |     await setupMocks(page, {
  177 |       sendOTP: route => route.fulfill({ status: 503, body: 'Service Unavailable' }),
  178 |     })
  179 |     await page.goto('/')
  180 |     await goToStep3(page)
  181 |     await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
  182 |     await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  183 |     await page.locator('[data-qa="btn-next"]').click()
  184 | 
  185 |     await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
```