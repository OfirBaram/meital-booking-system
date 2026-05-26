# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-ux-polish.spec.js >> tab-entering animation class >> tab-entering is added to the bookings tab when switching to it
- Location: tests\e2e\admin-ux-polish.spec.js:85:3

# Error details

```
Error: expect(locator).toHaveClass(expected) failed

Locator: locator('#tab-bookings')
Expected pattern: /tab-entering/
Received string:  "max-w-2xl mx-auto px-4 pt-5"
Timeout: 300ms

Call log:
  - Expect "toHaveClass" with timeout 300ms
  - waiting for locator('#tab-bookings')
    4 × locator resolved to <main id="tab-bookings" class="max-w-2xl mx-auto px-4 pt-5">…</main>
      - unexpected value "max-w-2xl mx-auto px-4 pt-5"

```

```yaml
- main:
  - text: 0 ממתינות 1 היום 1 סה"כ קפוץ לתאריך
  - textbox
  - button "נקה"
  - button "הכל"
  - button "ממתינים"
  - button "מאושרים"
  - button "היסטוריה"
  - text: דנה 050-123-4567 מאושר
  - button "שלח SMS ידני"
  - text: לק ג'ל קלאסי 📅 2026/05/25 · 🕐 10:00
  - button "🚫 בטל"
```

# Test source

```ts
  1   | /**
  2   |  * tests/e2e/admin-ux-polish.spec.js
  3   |  * UX-polish smoke tests — verify animations are wired without JS errors,
  4   |  * and that prefers-reduced-motion disables them correctly.
  5   |  *
  6   |  * These tests focus on CLASS presence and absence (the mechanism that drives
  7   |  * CSS animations), NOT pixel-level rendering (which requires a dedicated
  8   |  * visual-regression tool).
  9   |  *
  10  |  * Coverage:
  11  |  *   1.  tab-entering class is added to the active tab on switch
  12  |  *   2.  tab-entering class is removed after animation completes
  13  |  *   3.  cards-entering class is applied to #js-cards after render
  14  |  *   4.  cal-entering class is applied to #js-cal-grid after render
  15  |  *   5.  cal-cell.today exists after login (validates todayPulse target)
  16  |  *   6.  sheet-handle-pill class exists in the DOM (drives expand animation)
  17  |  *   7.  nav-tab.text-primary::after rendered (dot indicator present)
  18  |  *   8.  prefers-reduced-motion: all animation durations collapse to ≤ 1ms
  19  |  *   9.  No JS errors during tab-switch animation cycle
  20  |  *  10.  No JS errors during calendar month navigation
  21  |  */
  22  | import { test, expect } from '@playwright/test'
  23  | 
  24  | const GAS_GLOB   = 'https://script.google.com/macros/s/**'
  25  | const SB_FUNC_GLOB = 'https://callmnxlcganwugxwiym.supabase.co/functions/v1/**'
  26  | const FAKE_TOKEN = 'test-admin-token-32chars-exactly'
  27  | const TODAY      = new Date().toISOString().slice(0, 10)
  28  | 
  29  | const MOCK_BOOKINGS = {
  30  |   success: true,
  31  |   bookings: [
  32  |     {
  33  |       id: 'polish-1', name: 'דנה', phone: '0501234567',
  34  |       service: 'gel_classic', serviceName: "לק ג'ל קלאסי",
  35  |       date: TODAY, time: '10:00', status: 'Approved',
  36  |       timestamp: TODAY + 'T10:00:00+03:00', duration: 90,
  37  |     },
  38  |   ],
  39  | }
  40  | 
  41  | async function setupMocks(page) {
  42  |   await page.route(GAS_GLOB, async (route, request) => {
  43  |     if (request.method() !== 'POST') return route.continue()
  44  |     let body = {}
  45  |     try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
  46  |     const ok = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) })
  47  |     switch (body.action) {
  48  |       case 'listBookings':    return ok(MOCK_BOOKINGS)
  49  |       case 'adminGetSlots':   return ok({ success: true, slots: [] })
  50  |       case 'adminGetClients': return ok({ success: true, clients: [] })
  51  |       case 'getSmsLog':       return ok({ success: true, logs: [] })
  52  |       case 'getSystemInfo':   return ok({ success: true, reminderLastRun: null })
  53  |       case 'getTemplate':     return ok({ success: true, template: [] })
  54  |       case 'getAutoSms':      return ok({ success: true, enabled: true })
  55  |       default:                return ok({ success: false, error: 'not_mocked' })
  56  |     }
  57  |   })
  58  |   // Stub Supabase Edge Function calls; route list-bookings to the booking fixture
  59  |   // so login() populates S.bookings and render() can show booking cards.
  60  |   await page.route(SB_FUNC_GLOB, async (route, request) => {
  61  |     const sbBody = request.url().endsWith('/list-bookings')
  62  |       ? MOCK_BOOKINGS
  63  |       : { success: true, added: 0 }
  64  |     route.fulfill({ status: 200, contentType: 'application/json',
  65  |       body: JSON.stringify(sbBody) })
  66  |   })
  67  | }
  68  | 
  69  | async function loginAndWait(page) {
  70  |   await page.locator('#js-token-input').fill(FAKE_TOKEN)
  71  |   await page.locator('#js-login-btn').click()
  72  |   await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  73  |   await expect(page.locator('#js-cal-grid button[data-date]').first()).toBeVisible({ timeout: 5_000 })
  74  | }
  75  | 
  76  | // ─── 1–2. tab-entering class lifecycle ───────────────────────────────────────
  77  | 
  78  | test.describe('tab-entering animation class', () => {
  79  |   test.beforeEach(async ({ page }) => {
  80  |     await setupMocks(page)
  81  |     await page.goto('/admin.html')
  82  |     await loginAndWait(page)
  83  |   })
  84  | 
  85  |   test('tab-entering is added to the bookings tab when switching to it', async ({ page }) => {
  86  |     await page.locator('[data-qa="nav-tab-bookings"]').click()
  87  |     // tab-entering is added synchronously by setTab() and removed after 220 ms;
  88  |     // poll for up to 300 ms to absorb any Playwright command-dispatch latency.
> 89  |     await expect(page.locator('#tab-bookings')).toHaveClass(/tab-entering/, { timeout: 300 })
      |                                                 ^ Error: expect(locator).toHaveClass(expected) failed
  90  |   })
  91  | 
  92  |   test('tab-entering is removed from bookings tab after animation settles', async ({ page }) => {
  93  |     await page.locator('[data-qa="nav-tab-bookings"]').click()
  94  |     // Wait for animation to complete (tabIn is 0.18s)
  95  |     await page.waitForTimeout(400)
  96  |     const hasClass = await page.locator('#tab-bookings').evaluate(el =>
  97  |       el.classList.contains('tab-entering'))
  98  |     expect(hasClass).toBe(false)
  99  |   })
  100 | })
  101 | 
  102 | // ─── 3. cards-entering on booking list ───────────────────────────────────────
  103 | 
  104 | test('cards-entering class is applied to #js-cards after render', async ({ page }) => {
  105 |   await setupMocks(page)
  106 |   await page.goto('/admin.html')
  107 |   await loginAndWait(page)
  108 | 
  109 |   await page.locator('[data-qa="nav-tab-bookings"]').click()
  110 |   // Grab class immediately — it's added synchronously in render()
  111 |   const hasClass = await page.locator('#js-cards').evaluate(el =>
  112 |     el.classList.contains('cards-entering'))
  113 |   expect(hasClass).toBe(true)
  114 | })
  115 | 
  116 | // ─── 4. cal-entering on calendar grid ────────────────────────────────────────
  117 | 
  118 | test('cal-entering class is applied to #js-cal-grid after renderCalendar', async ({ page }) => {
  119 |   await setupMocks(page)
  120 |   await page.goto('/admin.html')
  121 |   await loginAndWait(page)
  122 | 
  123 |   // Cal-entering should have been applied on initial render (login triggers renderVisibleCalendar)
  124 |   // Navigate prev/next to re-trigger it
  125 |   await page.locator('#js-cal-prev').click()
  126 |   const hasClass = await page.locator('#js-cal-grid').evaluate(el =>
  127 |     el.classList.contains('cal-entering'))
  128 |   expect(hasClass).toBe(true)
  129 | })
  130 | 
  131 | // ─── 5. today cell exists ─────────────────────────────────────────────────────
  132 | 
  133 | test('cal-cell.today element exists on the calendar grid', async ({ page }) => {
  134 |   await setupMocks(page)
  135 |   await page.goto('/admin.html')
  136 |   await loginAndWait(page)
  137 | 
  138 |   await expect(page.locator('#js-cal-grid .cal-cell.today')).toBeVisible()
  139 | })
  140 | 
  141 | // ─── 6. sheet-handle-pill ─────────────────────────────────────────────────────
  142 | 
  143 | test('sheet-handle-pill element exists in the bottom sheet', async ({ page }) => {
  144 |   await setupMocks(page)
  145 |   await page.goto('/admin.html')
  146 |   await loginAndWait(page)
  147 | 
  148 |   // The sheet handle is always present in DOM (even when sheet is hidden)
  149 |   const pill = page.locator('#js-sheet-handle .sheet-handle-pill')
  150 |   const count = await pill.count()
  151 |   expect(count).toBeGreaterThan(0)
  152 | })
  153 | 
  154 | // ─── 7. Active nav tab dot (computed style) ──────────────────────────────────
  155 | 
  156 | test('active nav tab has ::after pseudo-element with non-zero dimensions', async ({ page }) => {
  157 |   await setupMocks(page)
  158 |   await page.goto('/admin.html')
  159 |   await loginAndWait(page)
  160 | 
  161 |   // Verify the ::after rule fires on the active tab by checking computed style
  162 |   const afterHeight = await page.locator('.nav-tab.text-primary').first().evaluate(el => {
  163 |     const after = window.getComputedStyle(el, '::after')
  164 |     return after.getPropertyValue('content')
  165 |   })
  166 |   // content: '' means the pseudo-element rule is active
  167 |   expect(afterHeight).not.toBe('none')
  168 | })
  169 | 
  170 | // ─── 8. prefers-reduced-motion collapses animation durations ─────────────────
  171 | 
  172 | test('prefers-reduced-motion: reduce sets animation-duration to ≤ 1ms on cal-cell', async ({ page }) => {
  173 |   await page.emulateMedia({ reducedMotion: 'reduce' })
  174 |   await setupMocks(page)
  175 |   await page.goto('/admin.html')
  176 |   await loginAndWait(page)
  177 | 
  178 |   const durationMs = await page.locator('.cal-cell').first().evaluate(el => {
  179 |     const dur = window.getComputedStyle(el).animationDuration
  180 |     // e.g. "0.01ms" → 0.01
  181 |     return parseFloat(dur)
  182 |   })
  183 |   expect(durationMs).toBeLessThanOrEqual(1)
  184 | })
  185 | 
  186 | test('prefers-reduced-motion: reduce — tab switching still works correctly', async ({ page }) => {
  187 |   const jsErrors = []
  188 |   page.on('pageerror', err => jsErrors.push(err.message))
  189 | 
```