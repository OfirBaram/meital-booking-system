# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> renderSmsLog — no inline onclick >> SMS log entries have zero onclick= attributes
- Location: tests\e2e\admin-render.spec.js:367:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-qa="log-entry"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-qa="log-entry"]').first()

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
  - textbox: 2026-05-25
  - text: עד תאריך
  - textbox: 2026-06-08
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
  322 |     const jsErrors = []
  323 |     page.on('pageerror', err => jsErrors.push(err.message))
  324 | 
  325 |     await setupMocks(page)
  326 |     await page.goto('/admin.html')
  327 |     await loginAndGoTo(page, 'bookings')
  328 | 
  329 |     await expect(page.locator('[data-booking]').first()).toBeVisible({ timeout: 5_000 })
  330 | 
  331 |     const onclickCount = await page.locator('#js-cards [onclick]').count()
  332 |     expect(onclickCount).toBe(0)
  333 |     expect(jsErrors).toHaveLength(0)
  334 |   })
  335 | 
  336 |   test('Approve button on Pending card calls changeStatus API', async ({ page }) => {
  337 |     const jsErrors = []
  338 |     page.on('pageerror', err => jsErrors.push(err.message))
  339 |     const statusChanges = []
  340 | 
  341 |     await setupMocks(page, {
  342 |       changeStatus: (route, body) => {
  343 |         statusChanges.push({ id: body.bookingId, target: body.targetStatus })
  344 |         return route.fulfill({
  345 |           status: 200, contentType: 'application/json',
  346 |           body: JSON.stringify({ success: true }),
  347 |         })
  348 |       },
  349 |     })
  350 |     await page.goto('/admin.html')
  351 |     await loginAndGoTo(page, 'bookings')
  352 | 
  353 |     // Approve via dispatchEvent to bypass the swipe card's setPointerCapture handler.
  354 |     // toastUndo defers the changeStatus call by 5 s (TTL); wait long enough for it to fire.
  355 |     await expect(page.locator('[data-action="Approved"]').first()).toBeVisible({ timeout: 5_000 })
  356 |     await page.locator('[data-action="Approved"]').first().dispatchEvent('click')
  357 |     await page.waitForTimeout(6_000)
  358 | 
  359 |     expect(statusChanges.some(s => s.target === 'Approved'), 'changeStatus(Approved) not called').toBe(true)
  360 |     expect(jsErrors).toHaveLength(0)
  361 |   })
  362 | })
  363 | 
  364 | // ─── 6. renderSmsLog — no onclick= in diary tab ──────────────────────────────
  365 | 
  366 | test.describe('renderSmsLog — no inline onclick', () => {
  367 |   test('SMS log entries have zero onclick= attributes', async ({ page }) => {
  368 |     const jsErrors = []
  369 |     page.on('pageerror', err => jsErrors.push(err.message))
  370 | 
  371 |     await setupMocks(page)
  372 |     await page.goto('/admin.html')
  373 |     await loginAndGoTo(page, 'diary')
  374 | 
> 375 |     await expect(page.locator('[data-qa="log-entry"]').first()).toBeVisible({ timeout: 5_000 })
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  376 | 
  377 |     const onclickCount = await page.locator('#js-sms-log [onclick]').count()
  378 |     expect(onclickCount).toBe(0)
  379 |     expect(jsErrors).toHaveLength(0)
  380 |   })
  381 | })
  382 | 
```