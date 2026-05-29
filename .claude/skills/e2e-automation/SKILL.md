---
name: e2e-automation
description: >-
  Write, run, and debug the Playwright E2E suite for the Meital booking system
  (frontend booking wizard + admin dashboard). Use when adding a new E2E test,
  running the suite locally, understanding the route-mock contract, or wiring a
  new spec into the shared diagnostics. Encodes the mock contract (GAS +
  Supabase Edge Functions), the screenshot/trace/console-capture setup, the
  no-direct-commit Frontend Deployment Gate, and the project's path quirks so a
  new test is deterministic and a failing one is self-explaining.
---

# E2E Automation — Meital booking system

The suite lives in `tests/e2e/*.spec.js` and runs against a static server of
`frontend/` on `http://localhost:4173`. Config: `playwright.config.js`.

## Run it (locally — Node/Playwright DO run on this machine)
```bash
npm run test:e2e                                  # whole suite
npx playwright test tests/e2e/booking.spec.js     # one file
npx playwright test -g "OTP"                       # by title
CI=1 npx playwright test <file>                    # reproduce CI (retries=1, html+diagnostic reporters)
npx playwright test <file> --headed                # watch it run (Deployment Gate check)
```
The `webServer` block auto-starts `npx serve frontend -p 4173`; you do not start a server yourself.

## The import line is NOT `@playwright/test`
Every browser spec imports from the shared base:
```js
import { test, expect } from '../support/test-base.js'
```
`tests/support/test-base.js` extends `test` to capture the **browser console**,
**uncaught page errors**, and **failed network requests**, and attaches them to
any failing test. Never import `@playwright/test` directly in a browser spec —
you lose the diagnostics. (The only exception is `claude-md-size.e2e.spec.js`,
a pure-CLI test that never opens a browser.)

## The mock contract (no real network)
Frontend calls go to two backends; both are intercepted with `page.route()`:
- **Supabase Edge Functions** (the live path): `${SUPABASE_URL}/functions/v1/<fn>`
  — `get-slots`, `send-otp`, `verify-and-book`, `change-status`, `admin-action`.
- **GAS** (legacy, calendar only): `https://script.google.com/macros/s/**`.

A spec injects test config by routing `**/config.js` and returning an
`APP_CONFIG` with a mock `SUPABASE_URL`/`API_URL` and `IS_MOCK_MODE: false`, so
real HTTP calls flow through the route mocks. Copy the `setupMocks(page)` helper
from `tests/e2e/booking.spec.js` — call it BEFORE `page.goto('/')`.

### Status casing — the silent UI-breaker (see CLAUDE.md §4)
- **Slot** status is **lowercase**: `available`. Use lowercase in slot mocks.
- **Booking** status is **Capitalized**: `Pending` / `Approved` / `Rejected` / `Cancelled`.
Mixing them breaks the calendar/admin UI without throwing.

## Gestures: dispatchEvent, not .click()
Buttons inside `.swipe-card` must be triggered with `dispatchEvent('click')` —
`setPointerCapture` hijacks synthetic Playwright clicks. (CLAUDE.md gate rule.)

## What you get on failure (don't add ad-hoc screenshots)
`playwright.config.js` already sets `screenshot: 'only-on-failure'`,
`trace: 'retain-on-failure'`, `video: 'retain-on-failure'`. On any failure you
get, under `test-results/`: `test-failed-1.png`, `trace.zip`, `video.webm`, plus
the shared base's `browser-console.log` / `page-errors.log` / `network-failures.log`.
The `diagnostic-reporter` writes `test-results/CLAUDE-FAILURES.md` summarizing it
all. To debug a red run, read that file first (see the `investigate-test-failure` skill).

## Frontend Deployment Gate (CLAUDE.md — mandatory)
No commit/push/merge of frontend without a green local run, especially
`tests/e2e/admin-dashboard.spec.js` (catches JS SyntaxErrors that turn into a
white screen in prod — backend tests never run the browser parser). Watch for:
no console errors on load, login panel visible immediately, tab switches don't throw.

## Editing files here
The project path contains U+200F marks → the built-in Edit/Write tools
mis-resolve JS/HTML paths ("File has not been read yet"). Create/edit specs via
Bash heredocs or the Python patch tooling (`skills/utils/ai_tools.py`,
CLAUDE.md §11–§12). Run git only through the Bash tool.
