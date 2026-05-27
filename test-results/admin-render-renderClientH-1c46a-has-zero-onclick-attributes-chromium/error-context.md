# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> renderClientHistory — no inline onclick in DOM >> client history has zero onclick= attributes
- Location: tests\e2e\admin-render.spec.js:277:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#js-clients-list [data-action="select-client"]').first()

```

# Page snapshot

```yaml
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
    - heading "לקוחות" [level=2] [ref=e23]
    - generic [ref=e25]:
      - searchbox "חפש לפי שם או טלפון..." [ref=e26]
      - button "חפש" [ref=e27] [cursor=pointer]
    - generic [ref=e29]: שגיאה בטעינה
  - navigation [ref=e30]:
    - generic [ref=e31]:
      - button "יומן" [ref=e32] [cursor=pointer]:
        - img [ref=e33]
        - generic [ref=e35]: יומן
      - button "הזמנות" [ref=e36] [cursor=pointer]:
        - img [ref=e37]
        - generic [ref=e39]: הזמנות
      - button "דופק עסקי" [ref=e40] [cursor=pointer]:
        - img [ref=e41]
        - generic [ref=e43]: דופק עסקי
      - button "זמנים" [ref=e44] [cursor=pointer]:
        - img [ref=e45]
        - generic [ref=e47]: זמנים
      - button "יומן" [ref=e48] [cursor=pointer]:
        - img [ref=e49]
        - generic [ref=e51]: יומן
      - button "לקוחות" [active] [ref=e52] [cursor=pointer]:
        - img [ref=e53]
        - generic [ref=e55]: לקוחות
```

# Test source

```ts
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
> 282 |     await page.locator('#js-clients-list [data-action="select-client"]').first().click()
      |                                                                                  ^ Error: locator.click: Test timeout of 30000ms exceeded.
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
  375 |     await expect(page.locator('[data-qa="log-entry"]').first()).toBeVisible({ timeout: 5_000 })
  376 | 
  377 |     const onclickCount = await page.locator('#js-sms-log [onclick]').count()
  378 |     expect(onclickCount).toBe(0)
  379 |     expect(jsErrors).toHaveLength(0)
  380 |   })
  381 | })
  382 | 
```