# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> renderDiarySlots — no inline onclick in DOM >> diary slot container has zero onclick= attributes after render
- Location: tests\e2e\admin-render.spec.js:155:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#js-diary-slots [data-action="toggle-diary-slot"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#js-diary-slots [data-action="toggle-diary-slot"]').first()

```

```yaml
- banner:
  - text: מ לוח הבקרה מיטל שבע ברעם
  - button "רענן":
    - img
  - button "SMS"
  - button "יציאה":
    - img
- main:
  - heading "ניהול יומן" [level=2]
  - text: טווח תצוגה מתאריך
  - textbox: 2026-05-24
  - text: עד תאריך
  - textbox: 2026-06-07
  - button "טען חריצים"
  - text: בחרי טווח תאריכים ולחצי "טען חריצים" הוספת חריץ בודד תאריך
  - textbox
  - text: שעה
  - textbox
  - button "+ הוסף חריץ"
  - text: יומן תקשורת SMS
  - button "רענן"
  - text: "שגיאה: HTTP 404"
- navigation:
  - button "יומן":
    - img
    - text: יומן
  - button "הזמנות":
    - img
    - text: הזמנות
  - button "דופק עסקי":
    - img
    - text: דופק עסקי
  - button "זמנים":
    - img
    - text: זמנים
  - button "יומן":
    - img
    - text: יומן
  - button "לקוחות":
    - img
    - text: לקוחות
```

# Test source

```ts
  63  |       treatment_name: "לק ג'ל רגליים", admin_token: 'tok-pending-abc' },
  64  |   ],
  65  | }
  66  | 
  67  | const MOCK_SMS_LOG = {
  68  |   success: true,
  69  |   entries: [
  70  |     { to: '+972501234567', ts: '2099-12-01', status: 'SENT',  context: 'OTP',   snippet: 'קוד: 123456' },
  71  |     { to: '+972509876543', ts: '2099-12-01', status: 'MOCK',  context: 'Admin', snippet: 'mock' },
  72  |   ],
  73  | }
  74  | 
  75  | const MOCK_INV_SLOTS = {
  76  |   success: true,
  77  |   slots: [
  78  |     { date: '2099-12-01', time: '10:00', status: 'Available', recentlyCancelled: false },
  79  |     { date: '2099-12-01', time: '12:00', status: 'Blocked',   recentlyCancelled: false },
  80  |   ],
  81  | }
  82  | 
  83  | async function setupMocks(page, overrides = {}) {
  84  |   await page.route(GAS_GLOB, async (route, request) => {
  85  |     if (request.method() !== 'POST') return route.continue()
  86  |     let body = {}
  87  |     try { body = JSON.parse(request.postData()) } catch { /* */ }
  88  |     if (overrides[body.action]) return overrides[body.action](route, body)
  89  |     const respond = (data) =>
  90  |       route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  91  |     switch (body.action) {
  92  |       case 'listBookings':        return respond(MOCK_BOOKINGS_FULL)
  93  |       case 'adminGetSlots':       return respond(MOCK_DIARY_SLOTS)
  94  |       case 'adminGetClients':     return respond(MOCK_CLIENTS)
  95  |       case 'adminGetClientHistory': return respond(MOCK_CLIENT_HISTORY)
  96  |       case 'getSmsLog':           return respond(MOCK_SMS_LOG)
  97  |       case 'getSlotInventory':    return respond(MOCK_INV_SLOTS)
  98  |       case 'getSystemInfo':       return respond({ success: true, reminderLastRun: null })
  99  |       case 'getTemplate':         return respond({ success: true, template: [] })
  100 |       case 'getAutoSms':          return respond({ success: true, enabled: true })
  101 |       default:                    return respond({ success: true })
  102 |     }
  103 |   })
  104 |   // Stub Supabase Edge Function calls; route list-bookings to the full fixture
  105 |   // so login() gets real booking data and render() populates #js-cards.
  106 |   await page.route(SB_FUNC_GLOB, async (route, request) => {
  107 |     const sbBody = request.url().endsWith('/list-bookings')
  108 |       ? MOCK_BOOKINGS_FULL
  109 |       : { success: true, added: 0 }
  110 |     route.fulfill({ status: 200, contentType: 'application/json',
  111 |       body: JSON.stringify(sbBody) })
  112 |   })
  113 | }
  114 | 
  115 | async function loginAndGoTo(page, tab) {
  116 |   await page.locator('#js-token-input').fill(FAKE_TOKEN)
  117 |   await page.locator('#js-login-btn').click()
  118 |   await expect(page.locator('#js-dash')).toBeVisible({ timeout: 8_000 })
  119 |   if (tab) {
  120 |     await page.locator(`[data-qa="nav-tab-${tab}"]`).click()
  121 |     await page.waitForTimeout(400)
  122 |   }
  123 | }
  124 | 
  125 | // ─── 1. No JS errors on initial render of any tab ────────────────────────────
  126 | 
  127 | test.describe('Zero pageerror on each tab render', () => {
  128 |   test.beforeEach(async ({ page }) => {
  129 |     const jsErrors = []
  130 |     page.on('pageerror', err => jsErrors.push(err.message))
  131 |     await setupMocks(page)
  132 |     await page.goto('/admin.html')
  133 |     // networkidle flakes when SB local Docker holds long-polls open; wait on the login panel instead.
  134 |     await expect(page.locator('#js-login')).toBeVisible({ timeout: 10_000 })
  135 |     page['_jsErrors'] = jsErrors
  136 |   })
  137 | 
  138 |   for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
  139 |     test(`tab "${tab}" renders without JS errors`, async ({ page }) => {
  140 |       await loginAndGoTo(page, tab)
  141 |       const errs = page['_jsErrors']
  142 |       expect(errs, `JS errors on tab "${tab}": ` + errs.join(' | ')).toHaveLength(0)
  143 |     })
  144 |   }
  145 | })
  146 | 
  147 | // ─── 2. renderDiarySlots — no onclick= in DOM ────────────────────────────────
  148 | 
  149 | test.describe('renderDiarySlots — no inline onclick in DOM', () => {
  150 |   test.beforeEach(async ({ page }) => {
  151 |     await setupMocks(page)
  152 |     await page.goto('/admin.html')
  153 |   })
  154 | 
  155 |   test('diary slot container has zero onclick= attributes after render', async ({ page }) => {
  156 |     const jsErrors = []
  157 |     page.on('pageerror', err => jsErrors.push(err.message))
  158 | 
  159 |     await loginAndGoTo(page, 'diary')
  160 | 
  161 |     // Wait for slots to load
  162 |     await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]').first())
> 163 |       .toBeVisible({ timeout: 5_000 })
      |        ^ Error: expect(locator).toBeVisible() failed
  164 | 
  165 |     // No onclick in the rendered container
  166 |     const onclickCount = await page.locator('#js-diary-slots [onclick]').count()
  167 |     expect(onclickCount, 'onclick= attributes found in diary slots').toBe(0)
  168 | 
  169 |     expect(jsErrors).toHaveLength(0)
  170 |   })
  171 | 
  172 |   test('all four slot rows render with correct statuses', async ({ page }) => {
  173 |     await loginAndGoTo(page, 'diary')
  174 |     await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]').first())
  175 |       .toBeVisible({ timeout: 5_000 })
  176 | 
  177 |     // Booked and Pending slots render but their buttons are disabled
  178 |     const toggleBtns = page.locator('#js-diary-slots [data-action="toggle-diary-slot"]')
  179 |     await expect(toggleBtns).toHaveCount(4)
  180 | 
  181 |     const disabledBtns = page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:disabled')
  182 |     await expect(disabledBtns).toHaveCount(2) // booked + pending
  183 |   })
  184 | 
  185 |   test('clicking a toggle-diary-slot button calls the API without JS error', async ({ page }) => {
  186 |     const jsErrors = []
  187 |     page.on('pageerror', err => jsErrors.push(err.message))
  188 |     const apiCalls = []
  189 | 
  190 |     await setupMocks(page, {
  191 |       adminToggleSlot: (route, body) => {
  192 |         apiCalls.push(body.slotId)
  193 |         return route.fulfill({
  194 |           status: 200, contentType: 'application/json',
  195 |           body: JSON.stringify({ success: true, newStatus: 'locked' }),
  196 |         })
  197 |       },
  198 |     })
  199 |     await page.goto('/admin.html')
  200 |     await loginAndGoTo(page, 'diary')
  201 | 
  202 |     await expect(page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:not([disabled])').first())
  203 |       .toBeVisible({ timeout: 5_000 })
  204 | 
  205 |     await page.locator('#js-diary-slots [data-action="toggle-diary-slot"]:not([disabled])').first().click()
  206 |     await page.waitForTimeout(500)
  207 | 
  208 |     expect(apiCalls.length, 'adminToggleSlot not called').toBeGreaterThan(0)
  209 |     expect(jsErrors, 'JS errors after toggle click: ' + jsErrors.join(' | ')).toHaveLength(0)
  210 |   })
  211 | 
  212 |   test('clicking delete-diary-slot shows confirm dialog', async ({ page }) => {
  213 |     const jsErrors = []
  214 |     page.on('pageerror', err => jsErrors.push(err.message))
  215 | 
  216 |     await setupMocks(page)
  217 |     await page.goto('/admin.html')
  218 |     await loginAndGoTo(page, 'diary')
  219 | 
  220 |     await expect(page.locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first())
  221 |       .toBeVisible({ timeout: 5_000 })
  222 | 
  223 |     // Dismiss the confirm dialog immediately (prevents actual deletion)
  224 |     page.once('dialog', dialog => dialog.dismiss())
  225 |     await page.locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first().click()
  226 |     await page.waitForTimeout(300)
  227 | 
  228 |     expect(jsErrors).toHaveLength(0)
  229 |   })
  230 | })
  231 | 
  232 | // ─── 3. renderClientList — no onclick= in DOM ────────────────────────────────
  233 | 
  234 | test.describe('renderClientList — no inline onclick in DOM', () => {
  235 |   test.beforeEach(async ({ page }) => {
  236 |     await setupMocks(page)
  237 |     await page.goto('/admin.html')
  238 |   })
  239 | 
  240 |   test('client list has zero onclick= attributes', async ({ page }) => {
  241 |     const jsErrors = []
  242 |     page.on('pageerror', err => jsErrors.push(err.message))
  243 | 
  244 |     await loginAndGoTo(page, 'clients')
  245 |     await expect(page.locator('#js-clients-list [data-action="select-client"]').first())
  246 |       .toBeVisible({ timeout: 5_000 })
  247 | 
  248 |     const onclickCount = await page.locator('#js-clients-list [onclick]').count()
  249 |     expect(onclickCount).toBe(0)
  250 |     expect(jsErrors).toHaveLength(0)
  251 |   })
  252 | 
  253 |   test('clicking a client card opens the history panel', async ({ page }) => {
  254 |     const jsErrors = []
  255 |     page.on('pageerror', err => jsErrors.push(err.message))
  256 | 
  257 |     await loginAndGoTo(page, 'clients')
  258 |     await expect(page.locator('#js-clients-list [data-action="select-client"]').first())
  259 |       .toBeVisible({ timeout: 5_000 })
  260 | 
  261 |     await page.locator('#js-clients-list [data-action="select-client"]').first().click()
  262 | 
  263 |     await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
```