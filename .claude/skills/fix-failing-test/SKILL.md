---
name: fix-failing-test
description: >-
  Apply and verify the fix for a failing Meital E2E/unit test once the root
  cause is known. Use after investigating a red test (see investigate-test-failure)
  when you need to change the spec or the app and prove it green without breaking
  the rest of the suite. Encodes the safe-edit path for this repo's U+200F path
  quirk, the deterministic-fix rules (no arbitrary sleeps, fix the locator not
  the symptom), and the verify-then-commit loop gated by the Frontend Deployment Gate.
---

# Fix a failing test (and prove it)

Use only after the cause is identified (use `investigate-test-failure` first).
This skill is about applying the fix cleanly and verifying it — not diagnosing.

## 1. Edit safely (path quirk)
The project path contains U+200F marks, so the built-in Edit/Write tools
mis-resolve JS/HTML files. Edit specs and frontend code via:
```bash
PY=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PY skills/utils/ai_tools.py patch <file> --old "<old>" --new "<new>"
```
or a Bash heredoc for whole-file rewrites. Markdown/YAML/JSON outside the RTL
path edit fine with the normal tools. Run git only through the Bash tool.

## 2. Fix the cause, not the symptom
- **Stale locator/text** → update the selector/expected text to match the real
  DOM. Don't loosen an assertion to make red go green if the app is actually wrong.
- **Timing** → use web-first assertions (`await expect(locator).toBeVisible({ timeout })`)
  or `waitForResponse`/`waitForSelector`. NEVER paper over a race with
  `waitForTimeout(n)`; it just relocates the flake.
- **Mock shape/casing** → match the real API: slot status lowercase `available`,
  booking status Capitalized `Pending`; Supabase path is kebab-case (`get-slots`).
- **Swipe-card button** → `dispatchEvent('click')`, not `.click()`.
- **App bug** → fix `frontend/*.js` (or the Supabase function); keep the test as
  the spec of correct behavior.

## 3. Verify — the loop that must end green
```bash
# the specific test, the CI way (retries + diagnostics)
CI=1 npx playwright test <file> -g "<title>" --project=chromium
# then the whole file, then the gate-critical dashboard spec
npx playwright test <file>
npx playwright test tests/e2e/admin-dashboard.spec.js
# if you touched shared/util/backend message logic:
npm run test:unit
```
If a fix touches the booking wizard or admin UI, run the relevant full file —
fixing one test commonly shifts a sibling. A red→green that breaks two others is
not a fix.

## 4. Confirm no new diagnostics noise
After a green run, `test-results/CLAUDE-FAILURES.md` says "all green ✅". If it
still lists failures, you fixed the wrong test or only one of several.

## 5. Frontend Deployment Gate (mandatory before commit/push/merge)
Per CLAUDE.md, frontend changes need a green local E2E run — especially
`admin-dashboard.spec.js` (catches white-screen SyntaxErrors backend tests miss).
Prefer `--headed` once to eyeball: no console errors on load, login panel
visible immediately, tab switches don't throw.

## 6. Commit on a feature branch
No direct commits to `main` (CLAUDE.md §5). Branch, commit with a message that
names the test and the root cause, push, open the PR — CI re-runs the suite and,
if anything is still red, prints `CLAUDE-FAILURES.md` straight into the job log.
