# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-dashboard.spec.js >> Admin dashboard — client management >> clients tab renders client cards from real data
- Location: tests\e2e\admin-dashboard.spec.js:269:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('#js-clients-list > div')
Expected: 2
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for locator('#js-clients-list > div')
    12 × locator resolved to 1 element
       - unexpected value "1"

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
  183 |     const jsErrors = []
  184 |     page.on('pageerror', err => jsErrors.push(err.message))
  185 | 
  186 |     for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
  187 |       await page.locator('[data-qa="nav-tab-' + tab + '"]').click()
  188 |       // Brief settle — let any async init run
  189 |       await page.waitForTimeout(300)
  190 |     }
  191 | 
  192 |     expect(jsErrors, 'JS errors while switching tabs: ' + jsErrors.join(' | ')).toHaveLength(0)
  193 |   })
  194 | 
  195 |   test('diary tab shows date range picker controls', async ({ page }) => {
  196 |     await page.locator('[data-qa="nav-tab-diary"]').click()
  197 |     await expect(page.locator('#js-diary-from')).toBeVisible({ timeout: 3_000 })
  198 |     await expect(page.locator('#js-diary-to')).toBeVisible()
  199 |     await expect(page.locator('#js-diary-load')).toBeVisible()
  200 |   })
  201 | 
  202 |   test('clients tab shows search input', async ({ page }) => {
  203 |     await page.locator('[data-qa="nav-tab-clients"]').click()
  204 |     await expect(page.locator('#js-client-search')).toBeVisible({ timeout: 3_000 })
  205 |     await expect(page.locator('#js-client-search-btn')).toBeVisible()
  206 |   })
  207 | })
  208 | 
  209 | // ─── 4. Graceful degradation — window.onerror banner ─────────────────────────
  210 | 
  211 | test.describe('Admin dashboard — graceful degradation', () => {
  212 |   test('deliberate JS error shows crash banner instead of white screen', async ({ page }) => {
  213 |     await setupAdminMocks(page)
  214 |     await page.goto('/admin.html')
  215 |     await page.waitForLoadState('domcontentloaded')
  216 | 
  217 |     // Inject a deliberate runtime error after page load
  218 |     await page.evaluate(() => {
  219 |       window.onerror('Test deliberate crash', 'admin.js', 99, 1, new Error('deliberate'))
  220 |     })
  221 | 
  222 |     // Crash banner must appear with the error message
  223 |     const banner = page.locator('#js-crash-banner')
  224 |     await expect(banner).toBeVisible({ timeout: 3_000 })
  225 |     const text = await banner.textContent()
  226 |     expect(text).toContain('שגיאה בטעינת הדשבורד')
  227 | 
  228 |     // The page body must NOT be a completely empty white screen
  229 |     const bodyText = await page.locator('body').textContent()
  230 |     expect(bodyText.trim().length).toBeGreaterThan(10)
  231 |   })
  232 | })
  233 | 
  234 | // ─── 5. Client management — card render, history, error handling ─────────────
  235 | //
  236 | // Motivation: the clients tab was previously exercised only with an EMPTY
  237 | // clients array, so buildClientCard / loadClientHistory / renderClientHistory —
  238 | // the exact render path that carried the line-1076 SyntaxError — had zero
  239 | // behavioural coverage.  These tests load real client data and walk the path.
  240 | 
  241 | /** Two real clients so the clients tab renders actual cards. */
  242 | const MOCK_CLIENTS_FULL = {
  243 |   success: true,
  244 |   clients: [
  245 |     { id: 'c-1', phone: '0501234567', full_name: 'דנה כהן',
  246 |       created_at: '2099-01-15T10:00:00+02:00' },
  247 |     { id: 'c-2', phone: '0529876543', full_name: 'רונית לוי',
  248 |       created_at: '2099-03-20T10:00:00+03:00' },
  249 |   ],
  250 | }
  251 | 
  252 | /** Client history with one Approved + one Pending appointment. */
  253 | const MOCK_CLIENT_HISTORY = {
  254 |   success: true,
  255 |   client:  { phone: '0501234567', full_name: 'דנה כהן' },
  256 |   appointments: [
  257 |     { id: 'a-1', date: '2099-12-01', time: '10:00', status: 'Approved',
  258 |       treatment_name: "לק ג'ל קלאסי" },
  259 |     { id: 'a-2', date: '2099-12-15', time: '14:00', status: 'Pending',
  260 |       admin_token: 'tok-pending-abc', treatment_name: "לק ג'ל רגליים" },
  261 |   ],
  262 | }
  263 | 
  264 | /** Fulfil a route with a JSON body. */
  265 | const jsonRoute = (data) => (route) =>
  266 |   route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  267 | 
  268 | test.describe('Admin dashboard — client management', () => {
  269 |   test('clients tab renders client cards from real data', async ({ page }) => {
  270 |     const jsErrors = []
  271 |     page.on('pageerror', err => jsErrors.push(err.message))
  272 | 
  273 |     await setupAdminMocks(page, {
  274 |       adminGetClients: jsonRoute(MOCK_CLIENTS_FULL),
  275 |     })
  276 |     await page.goto('/admin.html')
  277 |     await doLogin(page)
  278 | 
  279 |     await page.locator('[data-qa="nav-tab-clients"]').click()
  280 | 
  281 |     // #js-clients-list is guaranteed by admin.html; each client → one child div
  282 |     const cards = page.locator('#js-clients-list > div')
> 283 |     await expect(cards).toHaveCount(2, { timeout: 5_000 })
      |                         ^ Error: expect(locator).toHaveCount(expected) failed
  284 |     await expect(page.locator('#js-clients-list')).toContainText('דנה כהן')
  285 |     await expect(page.locator('#js-clients-list')).toContainText('רונית לוי')
  286 | 
  287 |     expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  288 |   })
  289 | 
  290 |   test('clicking a client card opens the history panel with appointments', async ({ page }) => {
  291 |     const jsErrors = []
  292 |     page.on('pageerror', err => jsErrors.push(err.message))
  293 | 
  294 |     await setupAdminMocks(page, {
  295 |       adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
  296 |       adminGetClientHistory: jsonRoute(MOCK_CLIENT_HISTORY),
  297 |     })
  298 |     await page.goto('/admin.html')
  299 |     await doLogin(page)
  300 | 
  301 |     await page.locator('[data-qa="nav-tab-clients"]').click()
  302 |     await page.locator('#js-clients-list > div').first().click()
  303 | 
  304 |     // History panel replaces the list
  305 |     await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
  306 |     await expect(page.locator('#js-clients-list')).toBeHidden()
  307 | 
  308 |     // Header populated + both appointment rows rendered
  309 |     await expect(page.locator('#js-history-name')).toHaveText('דנה כהן')
  310 |     await expect(page.locator('[data-appt-row]')).toHaveCount(2)
  311 | 
  312 |     expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  313 |   })
  314 | 
  315 |   test('client history error (client_not_found) shows a message, not a crash', async ({ page }) => {
  316 |     const jsErrors = []
  317 |     page.on('pageerror', err => jsErrors.push(err.message))
  318 | 
  319 |     await setupAdminMocks(page, {
  320 |       adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
  321 |       adminGetClientHistory: jsonRoute({ success: false, error: 'client_not_found' }),
  322 |     })
  323 |     await page.goto('/admin.html')
  324 |     await doLogin(page)
  325 | 
  326 |     await page.locator('[data-qa="nav-tab-clients"]').click()
  327 |     await page.locator('#js-clients-list > div').first().click()
  328 | 
  329 |     // Panel still switches; the list area shows a friendly error, not a blank screen
  330 |     await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
  331 |     await expect(page.locator('#js-history-list')).toContainText('שגיאה')
  332 | 
  333 |     // A handled error must NOT trip the crash banner or surface as a pageerror
  334 |     await expect(page.locator('#js-crash-banner')).toBeHidden()
  335 |     expect(jsErrors, 'JS errors: ' + jsErrors.join(' | ')).toHaveLength(0)
  336 |   })
  337 | 
  338 |   test('regression — client flow does not break login or the 5 nav tabs', async ({ page }) => {
  339 |     const jsErrors = []
  340 |     page.on('pageerror', err => jsErrors.push(err.message))
  341 | 
  342 |     await setupAdminMocks(page, {
  343 |       adminGetClients:       jsonRoute(MOCK_CLIENTS_FULL),
  344 |       adminGetClientHistory: jsonRoute(MOCK_CLIENT_HISTORY),
  345 |     })
  346 |     await page.goto('/admin.html')
  347 | 
  348 |     // Login still works
  349 |     await doLogin(page)
  350 |     await expect(page.locator('#js-dash')).toBeVisible()
  351 | 
  352 |     // Walk the client-management feature end to end
  353 |     await page.locator('[data-qa="nav-tab-clients"]').click()
  354 |     await page.locator('#js-clients-list > div').first().click()
  355 |     await expect(page.locator('#js-client-history')).toBeVisible({ timeout: 5_000 })
  356 | 
  357 |     // All 5 nav tabs are still present and switchable afterwards
  358 |     for (const tab of ['bookings', 'pulse', 'slots', 'diary', 'clients']) {
  359 |       const navTab = page.locator('[data-qa="nav-tab-' + tab + '"]')
  360 |       await expect(navTab, 'nav tab "' + tab + '" missing after client flow').toBeVisible()
  361 |       await navTab.click()
  362 |       await page.waitForTimeout(300)
  363 |     }
  364 | 
  365 |     expect(jsErrors, 'JS errors during regression: ' + jsErrors.join(' | ')).toHaveLength(0)
  366 |   })
  367 | })
  368 | 
```