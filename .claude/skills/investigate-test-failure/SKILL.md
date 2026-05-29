---
name: investigate-test-failure
description: >-
  Diagnose a failing Playwright E2E run for the Meital booking system and decide
  whether the bug is in the app or in the test. Use when an E2E test is red —
  locally or in CI — and you need to find the root cause fast. Walks the
  diagnostic artifacts (CLAUDE-FAILURES.md, screenshots, browser console,
  network logs, trace) in the right order and applies this project's known
  failure patterns (status casing, GAS↔Supabase split, swipe-card clicks,
  white-screen SyntaxErrors) before you touch any code.
---

# Investigate an E2E test failure

Goal: go from "a test is red" to "here is the one line that caused it" without
guessing. The suite is wired to hand you everything; read it in order.

## Step 1 — Read the summary FIRST
```bash
cat test-results/CLAUDE-FAILURES.md
```
This file (written by `tests/reporters/diagnostic-reporter.js`) lists every
failing test with: error + stack, `file:line`, the **browser console**, **failed
network requests**, and the **screenshot path**. In CI it is also printed inline
in the job log under the "Print failure diagnostics" step, and uploaded in the
`playwright-test-results` artifact.

If the file is missing, the run didn't reach the reporter (e.g. webServer never
started) — check the server/install steps, not the test.

## Step 2 — Look at the screenshot
Open the `test-failed-1.png` path from the summary. It shows the actual UI at the
moment of failure. White screen? → JS crashed on load (go to console). Wrong
step visible? → a navigation/assertion assumption is off. Empty calendar/list? →
a mock returned the wrong shape or casing.

## Step 3 — Read the browser console / page errors
The `browser-console.log` and `page-errors.log` sections are decisive: a frontend
"element not found" is almost always a **downstream symptom** of a console
`SyntaxError`/`TypeError` that fired on load. Fix the JS error, not the locator.

## Step 4 — Check network failures
`network-failures.log` lists any `HTTP >=400` or failed request. A 400 on
`/functions/v1/<fn>` usually means a route mock didn't match (wrong path/casing)
or a real call leaked past the mocks.

## Step 5 — Open the trace only if 1–4 are inconclusive
```bash
npx playwright show-trace test-results/.../trace.zip
```
Time-travel DOM + network. Slower to read than the logs above — use it last.

## Project-specific root-cause checklist
Before editing, rule these in/out (each has broken tests before):
1. **Status casing** — slot status is lowercase `available`; booking status is
   Capitalized `Pending`. A mock using `Available` makes the calendar render empty
   with no error. (CLAUDE.md §4, `[[reference_status_casing]]`.)
2. **GAS ↔ Supabase split-brain** — the live path is the Supabase Edge Function,
   not GAS. A side-effect "succeeding" while nothing happens is the classic trap.
   See the `meital-debugging` skill.
3. **Swipe-card clicks** — buttons in `.swipe-card` need `dispatchEvent('click')`,
   not `.click()`; `setPointerCapture` eats synthetic clicks.
4. **White screen / SyntaxError** — admin.js/booking.js parse error → blank page.
   `admin.html` has a `window.onerror` banner; the console log will show the real error.
5. **OTP focus race** — fill OTP boxes by index (`inputs.nth(i).fill()`), never
   `keyboard.type()` (auto-advance races CDP on slow CI).

## Decide: app bug vs. test bug
- **App bug** → console error, network 500, or screenshot shows genuinely wrong
  UI. Fix the frontend/backend; the test was right.
- **Test bug** → app behaves correctly in the screenshot but the assertion/locator
  /mock is stale (e.g. selector renamed, casing wrong in mock, timing too tight).
  Fix the spec. Then use the `fix-failing-test` skill to apply and re-verify.

## Reproduce locally exactly like CI
```bash
CI=1 npx playwright test <file> --project=chromium
```
`CI=1` turns on `retries: 1` and the html+diagnostic reporters, matching the
pipeline. Node/Playwright run locally (CLAUDE.md §11) — reproduce, don't guess.
