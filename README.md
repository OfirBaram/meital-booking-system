# meital-booking-system
A high-end, serverless booking system for Meital Sheva Baram Boutique Gel Studio. Built with Vanilla JS, Tailwind CSS, and Google Apps Script, featuring SMS OTP verification and automated Google Calendar synchronization.

---

## Running the Internal Test Suite

The backend ships with a self-contained test function, `runInternalTests()`, that validates phone normalisation and OTP generation **without** calling Twilio, touching the Sheet, or requiring a deployed web app.

### Steps

1. Open [script.google.com](https://script.google.com) and select the **Meital Booking** project.
2. In the editor toolbar, open the function picker (the dropdown that shows the function name) and choose **`runInternalTests`**.
3. Click **▶ Run**.
4. Click **Execution log** (bottom panel) to see results.

### Expected output

```
══════════════ runInternalTests START ══════════════

[ normalizePhone — valid Israeli mobile ]
✅ PASS — 054 ten digits | got: "+972541234567"
✅ PASS — 050 ten digits | got: "+972501234567"
✅ PASS — dashes 050-123-4567 | got: "+972501234567"
✅ PASS — spaces "050 123 4567" | got: "+972501234567"
...

[ normalizePhone — invalid inputs ]
✅ PASS — landline 02 | got: "null"
✅ PASS — empty string | got: "null"
...

[ generateOTP ]
✅ PASS — length is 6 | got: "6"
✅ PASS — digits only | got: "yes"
...

══════════════ RESULTS: 18 passed, 0 failed ══════════════
🎉 All tests passed!
```

If any line shows `❌ FAIL`, the log prints both the expected and actual values so the bug is immediately visible.

### What is tested

| Test group | Cases |
|---|---|
| `normalizePhone` — valid Israeli mobile | `054XXXXXXXX`, `050XXXXXXXX`, `052XXXXXXXX`, dashes, spaces, mixed |
| `normalizePhone` — E.164 / 972 prefix | `+972...` and bare `972...` (12 digits) |
| `normalizePhone` — invalid inputs | landlines (`02`, `03`), too short, empty string, `null`, letters |
| `generateOTP` | length = 6, digits only, range 100 000–999 999 |
| `handleSendOTP` phone path | same four formats as above, no Twilio call made |

### Diagnosing OTP failures

If `sendOTP` returns `{ success: false, error: "...", debugInfo: {...} }`, check:

| `debugInfo.stage` | Meaning | Fix |
|---|---|---|
| `"network"` | GAS could not reach `api.twilio.com` | Check Twilio URL / GAS external URL permissions |
| `"twilio"` | Twilio replied with a non-2xx status | See `debugInfo.twilioCode` and `debugInfo.twilioMessage` |
| *(absent)* | Invalid phone before Twilio was reached | See `error` field — expected `05XXXXXXXX` format |

Common Twilio error codes:

| Code | Meaning |
|---|---|
| `21211` | Invalid `To` number format |
| `21614` | `To` number is not a mobile number |
| `21608` | `To` number is not verified (trial account) |
| `20003` | Authentication error — check `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` |
---

## Deployment — GitHub Pages

The live booking page is served from the `deploy/github-pages` branch via GitHub Pages.

### URL structure

```
https://ofirbaram.github.io/meital-booking-system/frontend/
```

*(Root `/` redirects automatically to `/frontend/`.)*

### How to enable GitHub Pages

1. Go to **Repository Settings → Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Choose branch **`deploy/github-pages`**, folder **`/ (root)`**.
4. Click **Save** — GitHub will publish within ~1 minute.

### What is deployed

| File | Role |
|------|------|
| `index.html` (root) | Meta-refresh redirect → `/frontend/` |
| `frontend/index.html` | Full booking wizard UI |
| `frontend/booking.js` | All booking logic, state, API integration |
| `frontend/favicon.svg` | Dust-rose monogram favicon |
| `.nojekyll` | Disables Jekyll processing (required for Tailwind CDN to load) |

### Updating the live site

```bash
git checkout deploy/github-pages
# make changes
git push origin deploy/github-pages
```

GitHub Pages redeploys automatically on every push to this branch.

### Backend

The frontend connects to a Google Apps Script web app via `CONFIG.API_BASE` in `booking.js`.  
See `backend/gas-backend.js` and the [Deployment Checklist](CLAUDE.md#7-deployment-checklist) in `CLAUDE.md` for backend setup.
﻿

---

## Updating the Bot (AI Assistant)

The chatbot lives in `supabase/functions/chat-handler/`. All business knowledge
and configuration is separated from the request-handling logic.

### Changing Business Info (hours, services, contact)

1. Open `config/studio.json` at the repo root.
2. Edit the relevant fields (hours, services, contact details).
3. Open `supabase/functions/_shared/bot-config.ts` and update the
   `SYSTEM_PROMPT` constant to match (it is a plain text template — find the
   `── STUDIO CONTEXT ──` section).
4. Redeploy the function:
   ```bash
   bash scripts/deploy-functions.sh
   ```

### Changing the Bot's Tone or Rules

Open `supabase/functions/_shared/bot-config.ts` and edit the `SYSTEM_PROMPT`
constant directly.  
**Do not move or remove the `SECURITY BOUNDARY` block** — its position at the
top of the prompt is a security control.

### Enabling Debug Logging

Set the `CHAT_DEBUG` environment variable to `true` in Supabase Edge Function
secrets.  The bot will then log conversation state and tool I/O to the
server-side console (never exposed to users).

```bash
supabase secrets set CHAT_DEBUG=true
```

---

## Adding a New Bot Skill (Tool)

Tools extend the chatbot with live-data capabilities (e.g. look up a client's
booking, check a service's price). The architecture uses a **registry pattern**:
add your tool once and the agentic loop picks it up automatically.

**Steps:**

1. Open `supabase/functions/_shared/bot-config.ts`.
2. Define your tool:
   ```typescript
   interface MyInput extends Record<string, unknown> { someParam: string }
   interface MyOutput { result: string }

   const myTool: BotTool<MyInput, MyOutput> = {
     definition: {
       name: 'my_tool',
       description: 'What this tool does — be specific for the model.',
       input_schema: {
         type: 'object' as const,
         properties: { someParam: { type: 'string', description: '...' } },
         required: ['someParam'],
       },
     },
     async execute(input, { supabase }) {
       // Use supabase client or any Deno-compatible API here
       return { result: `processed ${input.someParam}` }
     },
   }
   ```
3. Register it:
   ```typescript
   export const TOOL_REGISTRY = new Map<string, BotTool>([
     ['check_availability', checkAvailabilityTool],
     ['my_tool',            myTool],           // ← add here
   ])
   ```
4. Mention the tool in `SYSTEM_PROMPT` so the model knows when to use it.
5. Redeploy: `bash scripts/deploy-functions.sh`

---

## Changing the Branding / Colors

The design system has two layers, both must be updated for a full rebrand:

### Layer 1 — `frontend/styles/tokens.css` (build-time)
This is the canonical CSS custom-property file used by the booking wizard
(`index.html`), admin dashboard (`admin.html`), and landing page.
Edit the `--color-*` and `--surface-*` variables here.

### Layer 2 — `SiteConfig.colors` in `frontend/landing.html` (runtime)
The landing page injects overrides at page-load via JavaScript. Find the
`const SiteConfig` block near the bottom of `landing.html` and update the
`colors: { ... }` object.  The short variable names (`--primary`, `--bg`, etc.)
are now aliases to `tokens.css` — changing Layer 1 updates the static fallback;
changing Layer 2 updates the runtime injection.

**To rebrand fully:** update both Layer 1 (`tokens.css`) and Layer 2
(`SiteConfig.colors`) with the same values.