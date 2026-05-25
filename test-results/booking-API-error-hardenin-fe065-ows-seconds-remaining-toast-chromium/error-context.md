# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.js >> API error hardening — sendOTP >> GAS returns { success: false, error: rate_limited } — shows seconds-remaining toast
- Location: tests\e2e\booking.spec.js:539:3

# Error details

```
Error: page.goto: Target page, context or browser has been closed
Call log:
  - navigating to "http://localhost:4173/", waiting until "load"

```

# Test source

```ts
  447 |     // Count should be identical — no DOM rebuild
  448 |     const countAfter = await page.locator('.cal-day').count()
  449 |     expect(countAfter).toBe(countBefore)
  450 | 
  451 |     // The clicked day should now have the selected class
  452 |     await expect(page.locator('.cal-day.selected')).toHaveCount(1)
  453 |   })
  454 | })
  455 | 
  456 | // ─── API error hardening (Phase 3.1) ─────────────────────────────────────────
  457 | //
  458 | // Verifies that HTTP errors and GAS business-logic failures surface as
  459 | // friendly Hebrew toast messages — never raw stack traces or JS exceptions.
  460 | 
  461 | /**
  462 |  * Like setupMocks but lets the caller inject per-action overrides.
  463 |  * overrides: { sendOTP?: fn(route), verifyAndBook?: fn(route) }
  464 |  */
  465 | async function setupMocksWithOverrides(page, overrides = {}) {
  466 |   await page.route('**/config.js', route =>
  467 |     route.fulfill({
  468 |       status:      200,
  469 |       contentType: 'application/javascript',
  470 |       body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", SUPABASE_URL: "${TEST_SB_URL}", SUPABASE_ANON_KEY: "test-anon-key", VERSION: "2.0.0", IS_MOCK_MODE: false };\nexport default APP_CONFIG;\n`,
  471 |     })
  472 |   )
  473 | 
  474 |   await page.route(GAS_GLOB, async (route, request) => {
  475 |     if (request.method() === 'GET') {
  476 |       const url   = new URL(request.url())
  477 |       const year  = parseInt(url.searchParams.get('year'),  10)
  478 |       const month = parseInt(url.searchParams.get('month'), 10)
  479 |       return route.fulfill({
  480 |         status:      200,
  481 |         contentType: 'application/json',
  482 |         body:        JSON.stringify(makeMockSlots(year, month)),
  483 |       })
  484 |     }
  485 |     return route.continue()
  486 |   })
  487 | 
  488 |   await page.route(SB_FUNC_GLOB, async (route, request) => {
  489 |     // Strip query params before comparing — get-slots has ?year=&month=
  490 |     const path = new URL(request.url()).pathname.split('/').pop()
  491 | 
  492 |     if (path === 'get-slots') {
  493 |       const u     = new URL(request.url())
  494 |       const year  = parseInt(u.searchParams.get('year'),  10)
  495 |       const month = parseInt(u.searchParams.get('month'), 10)
  496 |       return route.fulfill({
  497 |         status:      200,
  498 |         contentType: 'application/json',
  499 |         body:        JSON.stringify(makeMockSlots(year, month)),
  500 |       })
  501 |     }
  502 | 
  503 |     if (path === 'send-otp' && overrides.sendOTP) return overrides.sendOTP(route)
  504 |     if (path === 'verify-and-book' && overrides.verifyAndBook) return overrides.verifyAndBook(route)
  505 | 
  506 |     if (path === 'send-otp')
  507 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  508 |     if (path === 'verify-and-book')
  509 |       return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  510 | 
  511 |     return route.fulfill({ status: 400, body: '{}' })
  512 |   })
  513 | }
  514 | 
  515 | test.describe('API error hardening — sendOTP', () => {
  516 |   test('HTTP 500 on sendOTP shows a Hebrew connection-error toast and keeps step 3 visible', async ({ page }) => {
  517 |     await setupMocksWithOverrides(page, {
  518 |       sendOTP: route => route.fulfill({ status: 500, body: 'Internal Server Error' }),
  519 |     })
  520 |     await page.goto('/')
  521 |     await goToStep3(page)
  522 | 
  523 |     await page.locator('#inp-name').fill('נועה כהן')
  524 |     await page.locator('#inp-phone').fill('0501234567')
  525 |     await page.locator('#btn-next').click()
  526 | 
  527 |     // Must stay on step 3 — not advance to step 4
  528 |     await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
  529 |     await expect(page.locator('#step-4')).not.toBeVisible()
  530 | 
  531 |     // Toast must contain Hebrew text (not a raw JS error)
  532 |     await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
  533 |     const toastText = await page.locator('#js-toast').textContent()
  534 |     expect(toastText).toMatch(/[\u0590-\u05FF]/) // at least one Hebrew character
  535 |     expect(toastText).not.toContain('HTTP 500')
  536 |     expect(toastText).not.toContain('Error')
  537 |   })
  538 | 
  539 |   test('GAS returns { success: false, error: rate_limited } — shows seconds-remaining toast', async ({ page }) => {
  540 |     await setupMocksWithOverrides(page, {
  541 |       sendOTP: route => route.fulfill({
  542 |         status:      200,
  543 |         contentType: 'application/json',
  544 |         body:        JSON.stringify({ success: false, error: 'rate_limited', retryAfter: 28 }),
  545 |       }),
  546 |     })
> 547 |     await page.goto('/')
      |                ^ Error: page.goto: Target page, context or browser has been closed
  548 |     await goToStep3(page)
  549 | 
  550 |     await page.locator('#inp-name').fill('נועה כהן')
  551 |     await page.locator('#inp-phone').fill('0501234567')
  552 |     await page.locator('#btn-next').click()
  553 | 
  554 |     await expect(page.locator('#step-3')).toBeVisible({ timeout: 5_000 })
  555 |     await expect(page.locator('#js-toast')).toContainText('28', { timeout: 5_000 })
  556 |     await expect(page.locator('#js-toast')).toContainText('שניות')
  557 |   })
  558 | })
  559 | 
  560 | test.describe('API error hardening — verifyAndBook', () => {
  561 |   test('HTTP 500 on verifyAndBook shows a Hebrew toast and keeps step 4 visible', async ({ page }) => {
  562 |     await setupMocksWithOverrides(page, {
  563 |       verifyAndBook: route => route.fulfill({ status: 500, body: 'Internal Server Error' }),
  564 |     })
  565 |     await page.goto('/')
  566 |     await goToStep4(page)
  567 | 
  568 |     await typeOTP(page, '123456')
  569 | 
  570 |     // Must stay on step 4 — not advance to step 5
  571 |     await expect(page.locator('#step-4')).toBeVisible({ timeout: 5_000 })
  572 |     await expect(page.locator('#step-5')).not.toBeVisible()
  573 | 
  574 |     await expect(page.locator('#js-toast')).toBeVisible({ timeout: 5_000 })
  575 |     const toastText = await page.locator('#js-toast').textContent()
  576 |     expect(toastText).toMatch(/[\u0590-\u05FF]/)
  577 |     expect(toastText).not.toContain('HTTP 500')
  578 |     expect(toastText).not.toContain('Error')
  579 |   })
  580 | 
  581 |   test('slot_not_available error shows Hebrew slot-taken toast and sends user back to step 2', async ({ page }) => {
  582 |     await setupMocksWithOverrides(page, {
  583 |       verifyAndBook: route => route.fulfill({
  584 |         status:      200,
  585 |         contentType: 'application/json',
  586 |         body:        JSON.stringify({ success: false, error: 'slot_not_available' }),
  587 |       }),
  588 |     })
  589 |     await page.goto('/')
  590 |     await goToStep4(page)
  591 | 
  592 |     await typeOTP(page, '123456')
  593 | 
  594 |     // Toast warns that the slot is gone
  595 |     await expect(page.locator('#js-toast')).toContainText('לא זמין', { timeout: 5_000 })
  596 | 
  597 |     // After 2.5 s the wizard redirects back to step 2
  598 |     await expect(page.locator('#step-2')).toBeVisible({ timeout: 6_000 })
  599 |     await expect(page.locator('#step-4')).not.toBeVisible()
  600 |   })
  601 | 
  602 |   test('invalid_otp error shows Hebrew otp-error element (not a toast)', async ({ page }) => {
  603 |     // This is the normal wrong-OTP path — uses the inline #js-otp-error element
  604 |     await setupMocksWithOverrides(page, {
  605 |       verifyAndBook: route => route.fulfill({
  606 |         status:      200,
  607 |         contentType: 'application/json',
  608 |         body:        JSON.stringify({ success: false, error: 'invalid_otp' }),
  609 |       }),
  610 |     })
  611 |     await page.goto('/')
  612 |     await goToStep4(page)
  613 | 
  614 |     await typeOTP(page, '000000')
  615 | 
  616 |     await expect(page.locator('#js-otp-error')).toBeVisible({ timeout: 5_000 })
  617 |     await expect(page.locator('#js-otp-error')).toContainText('שגוי')
  618 |     await expect(page.locator('#step-4')).toBeVisible()
  619 |   })
  620 | })
  621 | 
```