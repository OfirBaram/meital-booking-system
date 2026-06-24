# meital-booking-system

Production booking system for **Meital Sheva Baram Boutique Gel Studio**
([meytalnails.co.il](https://meytalnails.co.il)).
Serverless, mobile-first, Hebrew RTL — built on Vanilla JS, Supabase, and
Google Apps Script.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS · Tailwind CSS · GitHub Pages |
| Database & Auth | Supabase (PostgreSQL + Row-Level Security) |
| API | 19 Supabase Deno Edge Functions |
| Calendar | Google Apps Script → Google Calendar API |
| SMS / OTP | Twilio (paid pay-as-you-go) |
| Testing | Playwright (E2E) · Vitest (unit) |

### Services

| ID | Name | Duration |
|---|---|---|
| `gel_hands` | ג'ל ידיים | 60 min |
| `regular_feet` | לק רגליים | 30 min |
| `gel_combo` | ג'ל ידיים + לק רגליים | 90 min |

---

## Developer Setup

### Prerequisites

- Node.js (for Playwright / Vitest)
- Python 3.12 at `C:\Users\DELL\AppData\Local\Programs\Python\Python312\python.exe`
- Bash shell (Git Bash on Windows)
- `gh` CLI authenticated (`gh auth login`)
- Supabase CLI (`npm i -g supabase`)

### Install dependencies

```bash
npm install
npx playwright install chromium
```

### WARNING — U+200F Characters in Project Path

The repository folder path contains **two invisible U+200F (RIGHT-TO-LEFT MARK)**
characters before `OfirBaram`. This causes several tools to silently resolve to
the wrong directory:

| Tool | Status |
|---|---|
| `git` via Bash | Works — use Bash only |
| `git` via PowerShell | **Broken** — always fails with "not a git repository" |
| Claude Code Edit/Write built-ins | **Broken** — silently mis-resolve path |
| Python via Bash | Works |
| Node/npm/npx | Works |

**Rule: edit all JS and HTML files only via the Python patch utility:**

```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch frontend/booking.js \
  --old "exact old string" \
  --new "replacement string"
```

Never use `sed -i` for multi-line JS patches (breaks template literals).
Never use PowerShell for file writes (random EPERM errors).

---

## Development Workflow

```
sync → branch → plan → validate → state-update
```

1. **Sync** — pull main, confirm clean state
2. **Branch** — `git checkout -b feat/your-feature`
3. **Plan** — agree on approach before writing code
4. **Validate** — run tests, pass the Deployment Gate
5. **State-update** — update `CLAUDE.md` changelog if behaviour changed

No direct commits to `main`. Every change on its own feature branch → PR.

---

## Deployment Gate (mandatory before every frontend push)

A SyntaxError in `admin.js` once caused a full white screen in production while
all GAS tests passed green. Backend tests do not invoke the browser JS parser.

**Rule: zero JS console errors before any frontend commit:**

```bash
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```

Must pass: no console errors, login panel visible immediately, tab switching
works without exceptions.

---

## Backend: GAS Build Model

```
backend/gas-backend.js   ← source of truth (edit this)
backend/Main.js          ← generated copy (clasp pushes this to GAS)
```

Before every `clasp push`, sync `Main.js` from `gas-backend.js`.
After push, run `clasp deploy` — **push ≠ deploy** (they are separate steps).

GAS handles Google Calendar only. All SMS and booking logic runs in
Supabase Edge Functions.

---

## Deploying Supabase Edge Functions

```bash
bash scripts/deploy-functions.sh
```

19 functions. After any change under `supabase/functions/`, always redeploy —
the running function in production is a separate artifact from the source file.

---

## Running Tests

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright, headless)
npx playwright test

# E2E with browser visible
npx playwright test --headed

# Single spec
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```

---

## GAS Internal Tests

For backend-only validation (phone normalisation, OTP generation) without
Twilio or Sheets:

1. Open [script.google.com](https://script.google.com) → Meital Booking project
2. Select function `runInternalTests` in the toolbar dropdown
3. Click Run → check Execution log

Expected: `18 passed, 0 failed`

---

## Chatbot (AI Assistant)

Lives in `supabase/functions/chat-handler/`.
Business config is in `config/studio.json` and
`supabase/functions/_shared/bot-config.ts`.

To update hours, services, or contact info:

1. Edit `config/studio.json`
2. Update the `── STUDIO CONTEXT ──` section in `bot-config.ts → SYSTEM_PROMPT`
3. `bash scripts/deploy-functions.sh`

Do not remove the `SECURITY BOUNDARY` block from `SYSTEM_PROMPT` — its
position is a security control.

---

## Branding / Colors

Two layers must stay in sync for a full rebrand:

| Layer | File | Used by |
|---|---|---|
| Build-time tokens | `frontend/styles/tokens.css` | booking wizard, admin, landing |
| Runtime injection | `SiteConfig.colors` in `frontend/landing.html` | landing page JS override |

Update both with the same values.

---

## Key Files

| Path | Purpose |
|---|---|
| `frontend/booking.js` | Booking wizard — all state in `State` object |
| `frontend/admin.js` | Admin dashboard |
| `frontend/landing.html` | Public landing page |
| `backend/gas-backend.js` | GAS source (Calendar sync, reminders) |
| `supabase/functions/` | 19 Edge Functions |
| `skills/utils/ai_tools.py` | Safe patch tool for JS/HTML edits |
| `skills/db/list_supabase_tables.py` | List live DB tables |
| `CLAUDE.md` | Full system spec and AI agent protocol |
