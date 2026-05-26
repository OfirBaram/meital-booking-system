# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa_guardrails.spec.js >> data-qa structural smoke — every functional element is reachable >> step 2: calendar cells, month nav, and slot buttons
- Location: tests\e2e\qa_guardrails.spec.js:323:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('[data-qa="cal-day"].avail').first()

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
        - img [ref=e15]
        - generic [ref=e17]: בחירת שירות
      - generic [ref=e19]:
        - generic [ref=e21]: "2"
        - generic [ref=e22]: תאריך ושעה
      - generic [ref=e24]:
        - generic [ref=e26]: "3"
        - generic [ref=e27]: פרטים אישיים
      - generic [ref=e29]:
        - generic [ref=e31]: "4"
        - generic [ref=e32]: אימות SMS
    - generic [ref=e33]:
      - heading "תאריך ושעה" [level=2] [ref=e34]
      - paragraph [ref=e35]: ✨ לק ג'ל קלאסי
      - generic [ref=e36]:
        - generic [ref=e37]:
          - button "חודש קודם" [ref=e38] [cursor=pointer]:
            - img [ref=e39]
          - heading "מאי 2026" [level=3] [ref=e41]
          - button "חודש הבא" [ref=e42] [cursor=pointer]:
            - img [ref=e43]
        - generic [ref=e45]:
          - generic [ref=e46]: א'
          - generic [ref=e47]: ב'
          - generic [ref=e48]: ג'
          - generic [ref=e49]: ד'
          - generic [ref=e50]: ה'
          - generic [ref=e51]: ו'
          - generic [ref=e52]: ש'
        - generic [ref=e53]:
          - button "2026-05-01":
            - generic: "1"
          - button "2026-05-02":
            - generic: "2"
          - button "2026-05-03":
            - generic: "3"
          - button "2026-05-04":
            - generic: "4"
          - button "2026-05-05":
            - generic: "5"
          - button "2026-05-06":
            - generic: "6"
          - button "2026-05-07":
            - generic: "7"
          - button "2026-05-08":
            - generic: "8"
          - button "2026-05-09":
            - generic: "9"
          - button "2026-05-10":
            - generic: "10"
          - button "2026-05-11":
            - generic: "11"
          - button "2026-05-12":
            - generic: "12"
          - button "2026-05-13":
            - generic: "13"
          - button "2026-05-14":
            - generic: "14"
          - button "2026-05-15":
            - generic: "15"
          - button "2026-05-16":
            - generic: "16"
          - button "2026-05-17":
            - generic: "17"
          - button "2026-05-18":
            - generic: "18"
          - button "2026-05-19":
            - generic: "19"
          - button "2026-05-20":
            - generic: "20"
          - button "2026-05-21":
            - generic: "21"
          - button "2026-05-22":
            - generic: "22"
          - button "2026-05-23":
            - generic: "23"
          - button "2026-05-24":
            - generic: "24"
          - button "2026-05-25":
            - generic: "25"
          - button "2026-05-26":
            - generic: "26"
          - button "2026-05-27":
            - generic: "27"
          - button "2026-05-28":
            - generic: "28"
          - button "2026-05-29":
            - generic: "29"
          - button "2026-05-30":
            - generic: "30"
          - button "2026-05-31":
            - generic: "31"
        - paragraph [ref=e59]: אין תורים פנויים לחודש זה, נסי חודש אחר
  - contentinfo [ref=e60]:
    - navigation "קישורי מידע משפטי" [ref=e61]:
      - button "מדיניות פרטיות" [ref=e62] [cursor=pointer]
      - button "הצהרת נגישות" [ref=e63] [cursor=pointer]
    - paragraph [ref=e64]: © 2025 מיטל שבע ברעם
  - generic [ref=e66]:
    - button "חזרה" [ref=e67] [cursor=pointer]
    - button "המשך" [disabled] [ref=e68]
```

# Test source

```ts
  229 |     const text = await page.locator('[data-qa="status-toast"]').textContent()
  230 |     expect(text).toMatch(/[֐-׿]/)
  231 |     expect(text).not.toContain('429')
  232 |     expect(text).not.toContain('Too Many')
  233 |   })
  234 | 
  235 |   test('rate_limited error in sendOTP response body shows a Hebrew toast', async ({ page }) => {
  236 |     await setupMocks(page, {
  237 |       sendOTP: route => route.fulfill({
  238 |         status:      200,
  239 |         contentType: 'application/json',
  240 |         body:        JSON.stringify({ success: false, error: 'rate_limited', retryAfter: 28 }),
  241 |       }),
  242 |     })
  243 |     await page.goto('/')
  244 |     await goToStep3(page)
  245 |     await page.locator('[data-qa="inp-name"]').fill('נועה כהן')
  246 |     await page.locator('[data-qa="inp-phone"]').fill('0501234567')
  247 |     await page.locator('[data-qa="btn-next"]').click()
  248 | 
  249 |     await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
  250 |     await expect(page.locator('#step-4')).not.toBeVisible()
  251 |     await expect(page.locator('[data-qa="status-toast"]')).toBeVisible({ timeout: 5_000 })
  252 |     const text = await page.locator('[data-qa="status-toast"]').textContent()
  253 |     expect(text).toMatch(/[֐-׿]/)
  254 |   })
  255 | })
  256 | 
  257 | // ─── 4. State preservation — phone persisted across reload ───────────────────
  258 | 
  259 | test.describe('State preservation — localStorage returning-client', () => {
  260 |   test('phone and name are written to localStorage after a completed booking', async ({ page }) => {
  261 |     await setupMocks(page)
  262 |     await page.goto('/')
  263 |     await goToStep4(page)
  264 |     await fillOTP(page, '246810')
  265 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  266 | 
  267 |     const stored = await page.evaluate(() => localStorage.getItem('meital_client'))
  268 |     expect(stored).not.toBeNull()
  269 |     const client = JSON.parse(stored)
  270 |     expect(client.phone).toBe('0501234567')
  271 |     expect(client.name).toBe('נועה כהן')
  272 |   })
  273 | 
  274 |   test('after reload, step 3 pre-fills phone from localStorage (returning-client UX)', async ({ page }) => {
  275 |     await setupMocks(page)
  276 |     await page.goto('/')
  277 |     // Seed a previous booking (simulates a returning client)
  278 |     await page.evaluate(() => {
  279 |       localStorage.setItem('meital_client', JSON.stringify({
  280 |         name:  'נועה כהן',
  281 |         phone: '0501234567',
  282 |       }))
  283 |     })
  284 |     // Reload simulates a page refresh
  285 |     await page.reload()
  286 |     // Navigate to step 3
  287 |     await goToStep3(page)
  288 |     // Phone field must be pre-filled from localStorage
  289 |     const phone = await page.locator('[data-qa="inp-phone"]').inputValue()
  290 |     expect(phone).toBe('0501234567')
  291 |   })
  292 | 
  293 |   test('reload during OTP entry resets to step 1, not a broken step 4', async ({ page }) => {
  294 |     await setupMocks(page)
  295 |     await page.goto('/')
  296 |     await goToStep4(page)
  297 |     // Simulate a mid-OTP page refresh
  298 |     await page.reload()
  299 |     // Must land cleanly on step 1
  300 |     await expect(page.locator('#step-1')).toBeVisible({ timeout: 5_000 })
  301 |     await expect(page.locator('#step-4')).not.toBeVisible()
  302 |     // App must have re-initialised: both service cards present
  303 |     await expect(page.locator('[data-qa^="card-service"]')).toHaveCount(2)
  304 |   })
  305 | })
  306 | 
  307 | // ─── 5. data-qa structural smoke — every functional element is reachable ──────────────
  308 | //
  309 | // Verifies every required data-qa attribute is present in the rendered DOM.
  310 | // Fails immediately if an element is renamed or removed without updating data-qa.
  311 | 
  312 | test.describe('data-qa structural smoke — every functional element is reachable', () => {
  313 |   test.beforeEach(async ({ page }) => {
  314 |     await setupMocks(page)
  315 |     await page.goto('/')
  316 |   })
  317 | 
  318 |   test('step 1: service cards and navigation', async ({ page }) => {
  319 |     await expect(page.locator('[data-qa^="card-service"]')).toHaveCount(2)
  320 |     await expect(page.locator('[data-qa="btn-next"]')).toBeVisible()
  321 |   })
  322 | 
  323 |   test('step 2: calendar cells, month nav, and slot buttons', async ({ page }) => {
  324 |     await goToStep2(page)
  325 |     await expect(page.locator('[data-qa="cal-day"]').first()).toBeVisible({ timeout: 8_000 })
  326 |     await expect(page.locator('[data-qa="btn-prev-month"]')).toBeVisible()
  327 |     await expect(page.locator('[data-qa="btn-next-month"]')).toBeVisible()
  328 |     await expect(page.locator('[data-qa="btn-back"]')).toBeVisible()
> 329 |     await page.locator('[data-qa="cal-day"].avail').first().click()
      |                                                             ^ Error: locator.click: Test timeout of 30000ms exceeded.
  330 |     await expect(page.locator('[data-qa="slot-btn"]').first()).toBeVisible({ timeout: 5_000 })
  331 |   })
  332 | 
  333 |   test('step 3: inputs and navigation', async ({ page }) => {
  334 |     await goToStep3(page)
  335 |     await expect(page.locator('[data-qa="inp-name"]')).toBeVisible()
  336 |     await expect(page.locator('[data-qa="inp-phone"]')).toBeVisible()
  337 |     await expect(page.locator('[data-qa="btn-next"]')).toBeVisible()
  338 |     await expect(page.locator('[data-qa="btn-back"]')).toBeVisible()
  339 |   })
  340 | 
  341 |   test('step 4: OTP inputs and resend button', async ({ page }) => {
  342 |     await goToStep4(page)
  343 |     await expect(page.locator('[data-qa="otp-digit"]')).toHaveCount(6)
  344 |     await expect(page.locator('[data-qa="otp-inputs-wrap"]')).toBeVisible()
  345 |     await expect(page.locator('[data-qa="btn-otp-resend"]')).toBeVisible()
  346 |   })
  347 | 
  348 |   test('step 5: confirmation rows and book-again button', async ({ page }) => {
  349 |     await goToStep4(page)
  350 |     await fillOTP(page, '246810')
  351 |     await expect(page.locator('#step-5')).toBeVisible({ timeout: 8_000 })
  352 |     await expect(page.locator('[data-qa="confirm-details"]')).toBeVisible()
  353 |     await expect(page.locator('[data-qa="confirm-id"]')).toBeVisible()
  354 |     await expect(page.locator('[data-qa="confirm-row"]').first()).toBeVisible()
  355 |     await expect(page.locator('[data-qa="btn-book-again"]')).toBeVisible()
  356 |   })
  357 | 
  358 |   test('footer: privacy and accessibility modal triggers', async ({ page }) => {
  359 |     await expect(page.locator('[data-qa="btn-open-privacy"]')).toBeVisible()
  360 |     await expect(page.locator('[data-qa="btn-open-accessibility"]')).toBeVisible()
  361 |   })
  362 | })
  363 | 
```