# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> buildCard — no inline onclick in bookings tab >> Approve button on Pending card calls changeStatus API
- Location: tests\e2e\admin-render.spec.js:336:3

# Error details

```
Error: changeStatus(Approved) not called

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e7]: מ
          - generic [ref=e8]:
            - generic [ref=e9]: לוח הבקרה
            - generic [ref=e10]: מיטל שבע ברעם
        - generic [ref=e11]:
          - button "רענן" [ref=e12] [cursor=pointer]:
            - img [ref=e13]
          - button "SMS" [ref=e15] [cursor=pointer]:
            - generic [ref=e16]: SMS
          - button "יציאה" [ref=e19] [cursor=pointer]:
            - img [ref=e20]
    - main [ref=e22]:
      - generic [ref=e23]:
        - generic [ref=e24]:
          - generic [ref=e25]: "1"
          - generic [ref=e26]: ממתינות
        - generic [ref=e27]:
          - generic [ref=e28]: "0"
          - generic [ref=e29]: היום
        - generic [ref=e30]:
          - generic [ref=e31]: "2"
          - generic [ref=e32]: סה"כ
      - generic [ref=e33]:
        - generic [ref=e34]: קפוץ לתאריך
        - textbox [ref=e35]
        - button "נקה" [ref=e36] [cursor=pointer]
      - generic [ref=e37]:
        - button "הכל" [ref=e38] [cursor=pointer]
        - button "ממתינים" [ref=e39] [cursor=pointer]
        - button "מאושרים" [ref=e40] [cursor=pointer]
        - button "היסטוריה" [ref=e41] [cursor=pointer]
      - generic [ref=e43]:
        - generic [ref=e44]:
          - generic:
            - generic: דחה
          - generic:
            - generic: אשר
          - generic [ref=e46]:
            - generic [ref=e47]:
              - generic [ref=e48]:
                - generic [ref=e49]: לקוחה ממתינה
                - generic [ref=e50]: 050-111-1111
              - generic [ref=e51]:
                - generic [ref=e52]: ממתין
                - button "שלח SMS ידני" [ref=e53] [cursor=pointer]:
                  - img [ref=e54]
            - generic [ref=e56]: לק ג'ל קלאסי
            - generic [ref=e57]: 📅 2099/12/01 · 🕐 10:00
            - generic [ref=e58]:
              - button "✅ אשר" [ref=e59] [cursor=pointer]
              - button "❌ דחה" [ref=e60] [cursor=pointer]
        - generic [ref=e61]:
          - generic:
            - generic: בטל
          - generic [ref=e63]:
            - generic [ref=e64]:
              - generic [ref=e65]:
                - generic [ref=e66]: לקוחה מאושרת
                - generic [ref=e67]: 050-222-2222
              - generic [ref=e68]:
                - generic [ref=e69]: מאושר
                - button "שלח SMS ידני" [ref=e70] [cursor=pointer]:
                  - img [ref=e71]
            - generic [ref=e73]: לק ג'ל רגליים
            - generic [ref=e74]: 📅 2099/12/02 · 🕐 12:00
            - button "🚫 בטל" [ref=e76] [cursor=pointer]
    - navigation [ref=e77]:
      - generic [ref=e78]:
        - button "יומן" [ref=e79] [cursor=pointer]:
          - img [ref=e80]
          - generic [ref=e82]: יומן
        - button "הזמנות" [active] [ref=e83] [cursor=pointer]:
          - img [ref=e84]
          - generic [ref=e86]: הזמנות
        - button "דופק עסקי" [ref=e87] [cursor=pointer]:
          - img [ref=e88]
          - generic [ref=e90]: דופק עסקי
        - button "זמנים" [ref=e91] [cursor=pointer]:
          - img [ref=e92]
          - generic [ref=e94]: זמנים
        - button "יומן" [ref=e95] [cursor=pointer]:
          - img [ref=e96]
          - generic [ref=e98]: יומן
        - button "לקוחות" [ref=e99] [cursor=pointer]:
          - img [ref=e100]
          - generic [ref=e102]: לקוחות
  - generic [ref=e105]: אושר! ⚠️ יש לבדוק שהיומן עודכן
```

# Test source

```ts
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
> 359 |     expect(statusChanges.some(s => s.target === 'Approved'), 'changeStatus(Approved) not called').toBe(true)
      |                                                                                                   ^ Error: changeStatus(Approved) not called
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
  375 |     await expect(page.locator('[data-qa="log-entry"]').first()).toBeVisible({ timeout: 5_000 })
  376 | 
  377 |     const onclickCount = await page.locator('#js-sms-log [onclick]').count()
  378 |     expect(onclickCount).toBe(0)
  379 |     expect(jsErrors).toHaveLength(0)
  380 |   })
  381 | })
  382 | 
```