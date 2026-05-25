# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> renderDiarySlots — no inline onclick in DOM >> clicking delete-diary-slot shows confirm dialog
- Location: tests\e2e\admin-render.spec.js:212:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#js-diary-slots [data-action="delete-diary-slot"]:not([disabled])').first()

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
  163 |       .toBeVisible({ timeout: 5_000 })
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
> 221 |       .toBeVisible({ timeout: 5_000 })
      |        ^ Error: expect(locator).toBeVisible() failed
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
  264 |     await expect(page.locator('#js-clients-list')).toBeHidden()
  265 |     expect(jsErrors).toHaveLength(0)
  266 |   })
  267 | })
  268 | 
  269 | // ─── 4. renderClientHistory — no onclick= in DOM ─────────────────────────────
  270 | 
  271 | test.describe('renderClientHistory — no inline onclick in DOM', () => {
  272 |   test.beforeEach(async ({ page }) => {
  273 |     await setupMocks(page)
  274 |     await page.goto('/admin.html')
  275 |   })
  276 | 
  277 |   test('client history has zero onclick= attributes', async ({ page }) => {
  278 |     const jsErrors = []
  279 |     page.on('pageerror', err => jsErrors.push(err.message))
  280 | 
  281 |     await loginAndGoTo(page, 'clients')
  282 |     await page.locator('#js-clients-list [data-action="select-client"]').first().click()
  283 |     await expect(page.locator('[data-appt-row]').first()).toBeVisible({ timeout: 5_000 })
  284 | 
  285 |     const onclickCount = await page.locator('#js-client-history [onclick]').count()
  286 |     expect(onclickCount).toBe(0)
  287 |     expect(jsErrors).toHaveLength(0)
  288 |   })
  289 | 
  290 |   test('Approve button calls API and updates badge without JS error', async ({ page }) => {
  291 |     const jsErrors = []
  292 |     page.on('pageerror', err => jsErrors.push(err.message))
  293 |     const decisions = []
  294 | 
  295 |     await setupMocks(page, {
  296 |       adminAction: (route, body) => {
  297 |         decisions.push(body.decision)
  298 |         return route.fulfill({
  299 |           status: 200, contentType: 'application/json',
  300 |           body: JSON.stringify({ success: true }),
  301 |         })
  302 |       },
  303 |     })
  304 |     await page.goto('/admin.html')
  305 |     await loginAndGoTo(page, 'clients')
  306 |     await page.locator('#js-clients-list [data-action="select-client"]').first().click()
  307 |     await expect(page.locator('[data-action="history-decide"]').first()).toBeVisible({ timeout: 5_000 })
  308 | 
  309 |     const approveBtn = page.locator('[data-action="history-decide"][data-decision="Approved"]')
  310 |     await approveBtn.first().click()
  311 |     await page.waitForTimeout(500)
  312 | 
  313 |     expect(decisions).toContain('Approved')
  314 |     expect(jsErrors).toHaveLength(0)
  315 |   })
  316 | })
  317 | 
  318 | // ─── 5. buildCard — no onclick= in bookings tab ──────────────────────────────
  319 | 
  320 | test.describe('buildCard — no inline onclick in bookings tab', () => {
  321 |   test('booking cards have zero onclick= attributes', async ({ page }) => {
```