# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.js >> Performance — slot pre-fetch on page load >> getSlots is called exactly once on load; step 2 uses cached data
- Location: tests\e2e\booking.spec.js:305:3

# Error details

```
TimeoutError: page.waitForResponse: Timeout 5000ms exceeded while waiting for event "response"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - generic "תמונת פרופיל מיטל שבע ברעם" [ref=e4]:
        - generic [ref=e6]: מ
        - img "מיטל שבע ברעם" [ref=e7]
      - heading "מיטל שבע ברעם" [level=1] [ref=e8]
      - paragraph [ref=e9]: לק ג'ל בוטק
  - main [ref=e10]:
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e15]: "1"
        - generic [ref=e16]: בחירת שירות
      - generic [ref=e18]:
        - generic [ref=e20]: "2"
        - generic [ref=e21]: תאריך ושעה
      - generic [ref=e23]:
        - generic [ref=e25]: "3"
        - generic [ref=e26]: פרטים אישיים
      - generic [ref=e28]:
        - generic [ref=e30]: "4"
        - generic [ref=e31]: אימות SMS
    - generic [ref=e32]:
      - heading "בחרי שירות" [level=2] [ref=e33]
      - paragraph [ref=e34]: כל השירותים כוללים ייעוץ ועיצוב לפי בחירה
      - generic [ref=e35]:
        - button "לק ג'ל קלאסי ציפוי ג'ל מושלם — צבע מלא, פרנץ' או ombre לפי בחירה" [ref=e36] [cursor=pointer]:
          - generic [ref=e37]:
            - generic [ref=e38]: ✨
            - generic [ref=e39]:
              - generic [ref=e40]: לק ג'ל קלאסי
              - paragraph [ref=e41]: ציפוי ג'ל מושלם — צבע מלא, פרנץ' או ombre לפי בחירה
        - button "לק ג'ל + רגליים טיפול ג'ל מלא לידיים ולרגליים" [ref=e42] [cursor=pointer]:
          - generic [ref=e43]:
            - generic [ref=e44]: 🌸
            - generic [ref=e45]:
              - generic [ref=e46]: לק ג'ל + רגליים
              - paragraph [ref=e47]: טיפול ג'ל מלא לידיים ולרגליים
  - contentinfo [ref=e48]:
    - navigation "קישורי מידע משפטי" [ref=e49]:
      - button "מדיניות פרטיות" [ref=e50] [cursor=pointer]
      - button "הצהרת נגישות" [ref=e51] [cursor=pointer]
    - paragraph [ref=e52]: © 2025 מיטל שבע ברעם
  - button "המשך" [disabled] [ref=e55]
```

# Test source

```ts
  240 |     await expect(page.locator('#btn-next')).toBeDisabled()
  241 |   })
  242 | 
  243 |   test('a name shorter than 2 chars keeps the Next button disabled', async ({ page }) => {
  244 |     await page.locator('#inp-name').fill('נ')
  245 |     await page.locator('#inp-phone').fill('0501234567')
  246 |     await expect(page.locator('#btn-next')).toBeDisabled()
  247 |   })
  248 | })
  249 | 
  250 | test.describe('Step 4 — OTP verification', () => {
  251 |   test.beforeEach(async ({ page }) => {
  252 |     await setupMocks(page)
  253 |     await page.goto('/')
  254 |     await goToStep4(page)
  255 |   })
  256 | 
  257 |   test('renders exactly 6 OTP input boxes', async ({ page }) => {
  258 |     await expect(page.locator('.otp-input')).toHaveCount(6)
  259 |   })
  260 | 
  261 |   test('resend button is initially disabled with a countdown', async ({ page }) => {
  262 |     await expect(page.locator('#js-resend')).toBeDisabled()
  263 |     await expect(page.locator('#js-resend-timer')).toContainText('s')
  264 |   })
  265 | 
  266 |   test('correct OTP auto-submits and shows confirmation screen', async ({ page }) => {
  267 |     await typeOTP(page, '123456')
  268 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  269 |   })
  270 | 
  271 |   test('wrong OTP (000000) shows an error message', async ({ page }) => {
  272 |     await typeOTP(page, '000000')
  273 |     await expect(page.locator('#js-otp-error')).toBeVisible({ timeout: 8_000 })
  274 |     await expect(page.locator('#js-otp-error')).toContainText('שגוי')
  275 |   })
  276 | })
  277 | 
  278 | test.describe('Step 5 — Confirmation', () => {
  279 |   test.beforeEach(async ({ page }) => {
  280 |     await setupMocks(page)
  281 |     await page.goto('/')
  282 |     await goToStep4(page)
  283 |     await typeOTP(page, '246810')
  284 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  285 |   })
  286 | 
  287 |   test('shows booking details and a UUID booking ID', async ({ page }) => {
  288 |     await expect(page.locator('#js-confirm-details')).not.toBeEmpty()
  289 | 
  290 |     const idText = await page.locator('#js-confirm-id').textContent()
  291 |     expect(idText).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  292 |   })
  293 | 
  294 |   test('"Book another" resets the wizard back to step 1', async ({ page }) => {
  295 |     await page.locator('#js-book-again').click()
  296 |     await expect(page.locator('#step-1')).toBeVisible()
  297 |     await expect(page.locator('.service-card.selected')).toHaveCount(0)
  298 |   })
  299 | })
  300 | 
  301 | 
  302 | // ─── Performance — instant calendar (pre-fetch) ───────────────────────────────
  303 | 
  304 | test.describe('Performance — slot pre-fetch on page load', () => {
  305 |   test('getSlots is called exactly once on load; step 2 uses cached data', async ({ page }) => {
  306 |     let getSlotsCalls = 0
  307 | 
  308 |     await page.route('**/config.js', route =>
  309 |       route.fulfill({
  310 |         status:      200,
  311 |         contentType: 'application/javascript',
  312 |         body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", VERSION: "2.0.0", IS_MOCK_MODE: false };
  313 | export default APP_CONFIG;
  314 | `,
  315 |       })
  316 |     )
  317 | 
  318 |     await page.route(GAS_GLOB, async (route, request) => {
  319 |       if (request.method() === 'GET') {
  320 |         getSlotsCalls++
  321 |         const url   = new URL(request.url())
  322 |         const year  = parseInt(url.searchParams.get('year'),  10)
  323 |         const month = parseInt(url.searchParams.get('month'), 10)
  324 |         return route.fulfill({
  325 |           status:      200,
  326 |           contentType: 'application/json',
  327 |           body:        JSON.stringify(makeMockSlots(year, month)),
  328 |         })
  329 |       }
  330 |       if (request.method() === 'POST') {
  331 |         let body = {}
  332 |         try { body = JSON.parse(request.postData()) } catch { /* ignore */ }
  333 |         if (body.action === 'sendOTP')
  334 |           return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  335 |       }
  336 |       return route.continue()
  337 |     })
  338 | 
  339 |     // Register waitForResponse BEFORE goto to avoid the race condition.
> 340 |     const prefetchDone = page.waitForResponse(
      |                               ^ TimeoutError: page.waitForResponse: Timeout 5000ms exceeded while waiting for event "response"
  341 |       res => res.url().includes('getSlots') && res.status() === 200,
  342 |       { timeout: 5_000 }
  343 |     )
  344 |     await page.goto('/')
  345 |     // Wait for the ES module to initialize (service cards rendered = init() ran).
  346 |     await page.waitForSelector('.service-card')
  347 |     await prefetchDone
  348 |     const callsAfterLoad = getSlotsCalls
  349 |     expect(callsAfterLoad).toBe(1)
  350 | 
  351 |     // Navigate to step 2
  352 |     await page.locator('.service-card').first().click()
  353 |     await page.locator('#btn-next').click()
  354 |     await expect(page.locator('#step-2')).toBeVisible()
  355 | 
  356 |     // Calendar should appear without an additional getSlots call
  357 |     await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 3_000 })
  358 |     expect(getSlotsCalls).toBe(1)
  359 | 
  360 |     // No skeleton cells should remain after render
  361 |     await expect(page.locator('.cal-day.animate-pulse')).toHaveCount(0)
  362 |   })
  363 | })
  364 | 
  365 | // ─── Security — OTP send rate limiting ────────────────────────────────────────
  366 | 
  367 | test.describe('Security — OTP send rate limiting', () => {
  368 |   test.beforeEach(async ({ page }) => {
  369 |     await setupMocks(page)
  370 |     await page.goto('/')
  371 |   })
  372 | 
  373 |   test('OTP send is blocked for 30 s after first successful send', async ({ page }) => {
  374 |     await goToStep4(page) // fills form, sends OTP, lands on step 4
  375 | 
  376 |     // Go back to step 3
  377 |     await page.locator('#btn-back').click()
  378 |     await expect(page.locator('#step-3')).toBeVisible()
  379 | 
  380 |     // Try to re-send immediately — cooldown toast should appear
  381 |     await page.locator('#btn-next').click()
  382 |     await expect(page.locator('#js-toast')).toContainText('שניות', { timeout: 3_000 })
  383 | 
  384 |     // Still on step 3 — NOT advanced to step 4
  385 |     await expect(page.locator('#step-3')).toBeVisible()
  386 |     await expect(page.locator('#step-4')).not.toBeVisible()
  387 |   })
  388 | 
  389 |   test('resetApp clears the OTP cooldown', async ({ page }) => {
  390 |     await goToStep4(page)
  391 |     await typeOTP(page, '123456')
  392 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  393 | 
  394 |     // Reset wizard
  395 |     await page.locator('#js-book-again').click()
  396 |     await expect(page.locator('#step-1')).toBeVisible()
  397 | 
  398 |     // Go through steps again — OTP send should NOT be rate-limited
  399 |     await page.locator('.service-card').first().click()
  400 |     await page.locator('#btn-next').click()
  401 |     await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 8_000 })
  402 |     await page.locator('.cal-day.avail').first().click()
  403 |     await page.locator('.time-slot').first().click()
  404 |     await page.locator('#btn-next').click()
  405 |     await expect(page.locator('#step-3')).toBeVisible()
  406 |     await page.locator('#inp-name').fill('נועה כהן')
  407 |     await page.locator('#inp-phone').fill('0501234567')
  408 |     await page.locator('#btn-next').click()
  409 |     // Should advance to step 4 without showing cooldown toast
  410 |     await expect(page.locator('#step-4')).toBeVisible({ timeout: 8_000 })
  411 |     await expect(page.locator('#js-toast')).not.toBeVisible()
  412 |   })
  413 | })
  414 | // ─── Performance — instant calendar on cache hit ──────────────────────────────
  415 | 
  416 | test.describe('Performance — instant calendar render on cache hit', () => {
  417 |   test('calendar has no skeleton cells when data is pre-fetched before step 2', async ({ page }) => {
  418 |     await setupMocks(page)
  419 |     await page.goto('/')
  420 | 
  421 |     // Wait for pre-fetch to complete (mocked getSlots is instant)
  422 |     await page.waitForTimeout(500)
  423 | 
  424 |     // Navigate to step 2
  425 |     await page.locator('.service-card').first().click()
  426 |     await page.locator('#btn-next').click()
  427 |     await expect(page.locator('#step-2')).toBeVisible()
  428 | 
  429 |     // With cached data, skeleton cells should never appear
  430 |     await expect(page.locator('.cal-day.animate-pulse')).toHaveCount(0)
  431 | 
  432 |     // Available days are rendered immediately (tight timeout — no async load)
  433 |     await expect(page.locator('.cal-day.avail').first()).toBeVisible({ timeout: 500 })
  434 |   })
  435 | 
  436 |   test('clicking a date does not rebuild the calendar DOM (selection patch only)', async ({ page }) => {
  437 |     await setupMocks(page)
  438 |     await page.goto('/')
  439 |     await goToStep2(page)
  440 | 
```