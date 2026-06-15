# System Master Documentation — Exhaustive Edition
## Meital Boutique Booking · מיטל שבע ברעם | לק ג'ל בוטק

| Field | Value |
|---|---|
| Document Version | 3.0.0 — Exhaustive Rewrite |
| Last Updated | 2026-05-20 |
| Runtime Status | **Production Active** |
| `IS_TEST_MODE` | `false` — all Twilio and Calendar calls are real |
| `IS_SUPABASE_ENABLED` | `true` — V2 data layer active |
| `IS_MOCK_MODE` (frontend) | `false` — live GAS API calls |
| Author | Ofir Baram — Architect & Developer |
| Audience | Ofir (current), any future developer inheriting this codebase |

> **Purpose of this document:** A future developer — or Ofir in six months — must be able to understand every technical decision, every state transition, every data payload, every security mechanism, and every UX micro-interaction in this system **without reading the source code**. If the code and this document conflict, the code is authoritative; update this document to match.

---

## Table of Contents

1. [Executive Summary & Strategic Vision](#1-executive-summary--strategic-vision)
2. [System Architecture & Infrastructure](#2-system-architecture--infrastructure)
3. [Booking Wizard — Complete UX & State Machine](#3-booking-wizard--complete-ux--state-machine)
4. [Security, Concurrency & Guardrails](#4-security-concurrency--guardrails)
5. [Complete API Reference & Payloads](#5-complete-api-reference--payloads)
6. [Data Schema — All Six Sheets](#6-data-schema--all-six-sheets)
7. [External Service Integrations](#7-external-service-integrations)
8. [Admin Dashboard — Complete Reference](#8-admin-dashboard--complete-reference)
9. [Quality Assurance & Testing Architecture](#9-quality-assurance--testing-architecture)
10. [Deployment, Operations & Rollback](#10-deployment-operations--rollback)
11. [Project Evolution & Decisions Log](#11-project-evolution--decisions-log)
12. [Appendices](#12-appendices)

---

## 1. Executive Summary & Strategic Vision

### 1.1 Business Context

Meital's Boutique Nail Studio is a solo-operated, appointment-only nail art business in Israel. The operator (Meital) personally handles every client appointment and manages her schedule on a personal Android Galaxy device.

**Before this system**, bookings happened via WhatsApp or phone calls. This created:
- Scheduling conflicts from manual calendar management
- No-shows with no advance notice
- Time spent chasing confirmation
- No client record history

**After this system**:
- Clients self-serve via a Hebrew mobile-first booking wizard
- Meital approves or rejects each booking with a single SMS link tap
- Google Calendar is kept automatically in sync
- 24h reminder SMS sends automatically every morning
- Full booking history, SMS logs, and health monitoring are visible in the admin dashboard

### 1.2 Core Design Constraints

| Constraint | Implication |
|---|---|
| Zero hosting cost | Google Apps Script + Google Sheets as the entire backend |
| Mobile-first for Meital | Admin dashboard must work on a 375px Android screen |
| No DevOps knowledge from operator | All maintenance happens via the admin dashboard UI |
| Israeli phone numbers | Twilio + E.164 normalization required; +972 prefix throughout |
| Hebrew RTL | `dir="rtl"` on root; Heebo font; all copy in Hebrew |
| GDPR-adjacent privacy | Only name + phone collected; documented in Privacy Policy modal |

### 1.3 Services Catalogue

Exactly two services exist. Duration is hidden from the client-facing booking UI (no mention of "90 minutes" or "2 hours" visible to the client).

| ID | Hebrew Name | English | Duration | Icon |
|---|---|---|---|---|
| `gel_hands`    | לק ג'ל לציפורניים                   | Gel Nail Polish              | 60 min | 💅 |
| `regular_feet` | לק רגיל לציפורניים ברגליים           | Regular Feet Nail Polish     | 30 min | 🦶 |
| `gel_combo`    | לק ג'ל לציפורניים + לק רגיל לרגליים | Gel Hands + Regular Feet     | 90 min | ✨ |

### 1.4 System-Level Critical Risks

> **RISK 1 — Twilio Trial Limit (ACTIVE)**  
> Trial account: 50 SMS/day hard cap. System self-limits at 45/day (5-unit buffer). Each full booking lifecycle consumes 4 SMS: OTP + Admin Notify + Client Confirm/Reject + 24h Reminder. Effective capacity: ~11 bookings/day before quota exhaustion.  
> **Resolution:** Upgrade to paid Twilio before volume increases beyond this.

> **RISK 2 — Single Google Spreadsheet as Database**  
> Corruption or accidental deletion of the spreadsheet would destroy all data. No automatic external backup exists.  
> **Mitigation:** `createBackup` admin action snapshots the live data on demand. Run before any bulk maintenance.

> **RISK 3 — GAS 6-Minute Execution Cap**  
> Any GAS function that runs longer than 6 minutes is forcibly terminated. The daily `syncCalendarToSlots` trigger logs a WARNING if it exceeds 5 minutes. At current booking volumes this is not a risk; it becomes one if the spreadsheet grows beyond ~5,000 rows.

> **RISK 4 — No Node/NPM in Local Dev Environment**  
> `npx`, `npm`, `node` are not in PATH on the developer machine. All automated tests (Vitest, Playwright) run in GitHub Actions CI only. Local test runs are impossible without first installing Node.

---

## 2. System Architecture & Infrastructure

### 2.1 Architectural Overview

```
╔════════════════════════════════════════════════════════════════╗
║  CLIENT LAYER (Static Files — any static host)                 ║
║                                                                 ║
║  index.html  ←→  booking.js  ←→  config.js                    ║
║  admin.html  ←→  admin.js    ←→  admin-render.js               ║
╚═════════════════════════════┬══════════════════════════════════╝
                              │
                              │  HTTP POST, Content-Type: text/plain
                              │  Body: JSON { action, token?, ...payload }
                              │  (GET also accepted for getSlots + admin links)
                              ▼
╔════════════════════════════════════════════════════════════════╗
║  GOOGLE APPS SCRIPT (gas-backend.js)                           ║
║  Runtime: V8 engine · Execute as: Me · Anyone can access      ║
║                                                                 ║
║  doPost(e) → switch(body.action) → handler                     ║
║  doGet(e)  → admin approve/reject HTML + getSlots JSON         ║
║                                                                 ║
║  ┌──────────────────────────────────────────────┐              ║
║  │ IS_SUPABASE_ENABLED = true                   │              ║
║  │ Slot/booking ops route to V2 Supabase handlers│              ║
║  │ Fallback: V1 Google Sheets handlers           │              ║
║  └──────────────────────────────────────────────┘              ║
╚══════╤═══════════════╤═══════════════╤════════════════════════╝
       │               │               │
       ▼               ▼               ▼
  Google Sheets    Supabase PG    Google Calendar
  (V1 database)   (V2 database)  (event management)
       │               │               │
       └───────────────┴───────────────┘
                       │
                       ▼
                 Twilio REST API
                 (OTP, notify, remind)
```

### 2.2 Tech Stack — Rationale for Every Choice

| Component | Technology | Why This, Not That |
|---|---|---|
| Frontend markup | Vanilla HTML5 + Tailwind CSS (CDN) | No build step; instant deploy; zero dependency risk. Tailwind via CDN means no `package.json`. |
| Frontend logic | Vanilla ES modules, `'use strict'` | No framework overhead. No version upgrades. Any JS developer can read it without framework knowledge. |
| State management | Single `State` object + `localStorage` | No Redux, no signals, no reactivity layer. State is one plain JS object; debugging is a `console.log(State)`. |
| Backend runtime | Google Apps Script (GAS) | Free. Integrated with Google Workspace. No server to manage, patch, or scale. `CalendarApp` and `SpreadsheetApp` are native — no auth ceremony. |
| Primary database | Google Sheets | Meital can view and manually correct data with zero technical knowledge. Schema is visible as column headers. |
| Secondary database | Supabase (PostgreSQL) | Relational queries (client history, filtered slot lookups) that Sheets cannot handle efficiently. REST API over HTTPS. |
| Calendar | Google Calendar (CalendarApp) | Meital already uses it; sync is native to GAS; no separate OAuth. |
| SMS | Twilio REST API | Reliable delivery to +972 Israeli numbers; detailed SID receipts for debugging. |
| Caching | GAS `CacheService` (script-scoped) | Built-in to GAS; 10-min TTL for slot data. Avoids Spreadsheet I/O on every page load. |
| Distributed locking | GAS `LockService.getScriptLock()` | Built-in to GAS; prevents double-bookings under concurrent HTTP requests. |

### 2.3 Deployment Model

```
Source of Truth (git repo)
├── backend/gas-backend.js   ← THE canonical backend source
├── Code.js                  ← Generated copy; clasp pushes this to GAS
└── frontend/*               ← Static files deployed to hosting

Rule: After EVERY change to gas-backend.js → run clasp push.
      Code.js and gas-backend.js must always be identical.
```

### 2.4 Environment Flags

All three flags must be set correctly before traffic hits the system.

| Flag | Location | Value | Effect When True | Effect When False |
|---|---|---|---|---|
| `IS_TEST_MODE` | `gas-backend.js` line ~30 | **`false`** | Twilio/Calendar calls are MOCKED — no real SMS, no real events | Real Twilio SMS sent; real Calendar events created |
| `IS_SUPABASE_ENABLED` | `gas-backend.js` line ~30 | **`true`** | `getSlots`, `sendOTP`, `verifyAndBook`, `adminAction` route to V2 Supabase handlers | All actions use V1 Google Sheets handlers |
| `IS_MOCK_MODE` | `frontend/config.js` | **`false`** | Frontend uses mock data; no API calls made | Live API calls to GAS Web App URL |

### 2.5 API Communication Protocol — Full Specification

**Endpoint:** The single GAS Web App URL stored in `config.js` as `APP_CONFIG.API_URL`.

```
Current URL: https://script.google.com/macros/s/AKfycbw32cmN1CPb6q91eSOyU3GaP-lm9FAHMrYSc9goyOKFpxeROJMl6oFg2Q_WpxMiFzsfUw/exec
```

**Why `Content-Type: text/plain` and not `application/json`:**  
GAS Web Apps respond with CORS headers only for "simple" cross-origin requests. The CORS specification classifies `Content-Type: application/json` as a non-simple request, triggering a preflight `OPTIONS` request. GAS does not respond to `OPTIONS` with the correct CORS headers, so the browser blocks the request and reports a CORS error. `text/plain` is classified as a "simple" CORS content type — no preflight is required, and the real `POST` goes through directly. This is a GAS platform limitation, not a bug in the application.

**Request envelope:**
```json
{
  "action": "<action-name>",
  "token": "<ADMIN_TOKEN>",   // present on all admin-only calls
  "<other fields>": "..."     // action-specific payload
}
```

**Response envelope:**
```json
{ "success": true,  "...": "..." }
{ "success": false, "error": "<error-code>", "code"?: 403 }
```

**Timeout:** Frontend sets a 30-second `AbortController` timeout on every API call via `fetchWithTimeout()`. On abort: `Error('הבקשה ארכה יותר מדי. נסי שוב.')`.

**GET requests:** Used by `apiGetSlots` (CORS-safe, cacheable by browser) and by admin SMS links. Both are handled in `doGet(e)`.

---

## 3. Booking Wizard — Complete UX & State Machine

### 3.1 The `State` Object — Canonical Definition

```js
const State = {
  step:              1,         // Active wizard step (1–5). Never 0.
  service:           null,      // Reference to selected SERVICES[n] object, or null
  date:              null,      // 'YYYY-MM-DD' string, or null
  time:              null,      // 'HH:MM' string (24h), or null
  name:              '',        // Trimmed string; populated from input on step 3→4
  phone:             '',        // Digits only (10 chars, e.g. '0541234567')
  bookingId:         null,      // UUID v4 string, generated at step 3→4 transition
  calMonth:          null,      // First-of-month Date object for calendar display
  slots:             {},        // Accumulated map: 'YYYY-MM-DD' → ['HH:MM', ...]
  loading:           false,     // True during any API call; disables nav button
  prefetchedMonths:  new Set(), // Set of 'YYYY-M' keys already fetched from API
  otpCooldownUntil:  0,         // Date.now() ms timestamp; OTP blocked until this
};
```

**Key invariants:**
- `State.phone` always stores raw 10 digits (e.g. `'0541234567'`). It is normalized to E.164 only inside `apiSendOTP` and `apiVerifyAndBook` when building the API payload.
- `State.slots` is **never reset** by `resetApp()`. Cached slot data persists across multiple bookings in the same session for zero-latency re-entry.
- `State.prefetchedMonths` is **never reset** by `resetApp()`. Same reason.
- `State.bookingId` is generated fresh at every step 3→4 transition — even if the user goes back and retries.

### 3.2 State Transitions — Step by Step

#### Transition: Initialization (`DOMContentLoaded`)

```
State (initial):  step=1, all fields null/empty/zero

Actions:
1. renderProgress()           — draws 4-step stepper
2. renderServices()           — renders 2 service cards
3. renderDayHeaders()         — renders Hebrew weekday row (א–ש)
4. setupModalListeners()      — wires legal modal (Esc, backdrop, X, focus trap)
5. prefetchSlots() [async]    — fire-and-forget: fetches current month's slots
                                On success: State.slots += res.slots
                                            State.prefetchedMonths.add(`${year}-${month}`)
6. init() wires:
   - btn-next click → handleNext()
   - btn-back click → handleBack()
   - inp-name input  → updateNav()
   - inp-phone input → updateNav()
   - js-resend click → handleResend()
   - js-reset click  → resetApp()
   - Calendar prev/next buttons → loadMonthSlots(year, month)
   - Calendar day click → selects date, calls renderSlots(dateKey), updateNav()
   - Time slot click  → sets State.time, updateNav()
7. Auto-restore session:
   If localStorage has meital_admin_token + valid timestamp:
     → No action on booking page (admin restoration is admin.js only)
```

#### Step 1 → Step 2 (Service Selection to Date & Time)

**Trigger:** User clicks a service card → `btn-next` becomes enabled → user taps "המשך"

**`handleNext()` step 1 branch:**
```
State.calMonth = new Date(now.getFullYear(), now.getMonth(), 1)

showStep(2):
  - Hides step-1, shows step-2
  - Triggers stepFadeIn CSS animation (0.15s ease-out)
  - window.scrollTo({ top: 0, behavior: 'instant' })
  - State.step = 2
  - renderProgress() — step 1 shows SVG checkmark; step 2 is active gradient circle

Updates step-2 summary label:
  js-step2-service-label.textContent = `${State.service.icon} ${State.service.name}`

Slot loading (cache-aware):
  year  = calMonth.getFullYear()
  month = calMonth.getMonth() + 1
  key   = `${year}-${month}`

  IF State.prefetchedMonths.has(key):
    → renderCalendar() synchronously — zero latency, no skeleton, no API call
  ELSE:
    → loadMonthSlots(year, month):
        1. renderCalendarSkeleton() — 35 animate-pulse divs
        2. _setCalendarLoading(true) — shows spinner below calendar
        3. apiGetSlots(year, month) via GET request, 30s timeout
        4. On success: State.slots merged; State.prefetchedMonths.add(key)
        5. On failure: toast("שגיאת חיבור. בדקי את החיבור לאינטרנט ונסי שוב.", 'error')
        6. _setCalendarLoading(false)
        7. renderCalendar()
```

**`renderCalendar()` — full logic:**

The function checks `_calMonthKey` (module-level string, format `"YYYY-M"`) to decide between a full DOM rebuild vs. a lightweight patch:

```
CASE A — same month as last render (_calMonthKey === `${year}-${month}`):
  Patch mode:
  1. Find all .cal-day.selected → remove .selected, set aria-pressed="false"
  2. Restore any .dot-avail inside previously-selected cell to default color
  3. If State.date: find [data-date="{State.date}"] → add .selected, aria-pressed="true"
                    set .dot-avail style.background = 'white'
  No DOM creation. O(n) where n = selected cells (usually 0 or 1).

CASE B — month changed (different _calMonthKey):
  Full rebuild:
  _calMonthKey = `${year}-${month}`
  Compute firstDow (0=Sun) and daysInMon for this month.
  For each day d = 1..daysInMon:
    key  = YYYY-MM-DD
    past = date < today midnight
    fri  = getDay() === 5
    sat  = getDay() === 6
    has  = State.slots[key].length > 0
    sel  = State.date === key
    isToday = date.getTime() === today0().getTime()
    disabled = past || fri || sat || !has

    CSS classes applied:
      'cal-day'       always
      'disabled'      if disabled (no click, tabindex=-1)
      'avail'         if !disabled
      'selected'      if sel
      'today-ring'    if isToday && !sel

    Dot indicator logic:
      IF has && !disabled && !sel  → <span class="dot-avail"></span>  (primary color)
      IF sel                       → <span class="dot-avail" style="background:white"></span>

  After loop: update js-month-label text, set innerHTML, toggle #js-cal-empty
```

**Month navigation:**
- Prev/Next buttons call `loadMonthSlots(year, month)` after adjusting `State.calMonth`
- The same cache-aware logic applies — previously visited months render instantly

#### Step 2 → Step 3 (Date + Time to Personal Details)

**Trigger:** Both `State.date` and `State.time` are set → `btn-next` enabled → user taps "המשך"

```
State after this transition:
  step = 3
  service, date, time: already set (unchanged)

handleNext() step 2 branch:
1. showStep(3)
2. Update summary label:
   js-step3-summary.textContent =
     `${State.service.icon} ${State.service.name} · ${formatDateHe(State.date)} · ${State.time}`

3. Returning-client auto-fill:
   saved = LS.get('client')  // { name, phone } from localStorage meital_client
   IF saved && saved.name && saved.phone:
     Show #js-returning-banner:
       Text: "שלום ${saved.name}! הפרטים שלך נשמרו."
       (contains #js-returning-name span and "לא אני" button)
     inp-name.value  = saved.name
     inp-phone.value = saved.phone
     State.name  = saved.name
     State.phone = saved.phone
     updateNav() → enables btn-next immediately (returning client skips typing)
   ELSE:
     Hide #js-returning-banner
     Both inputs are empty; btn-next remains disabled

"לא אני" button handler:
  Clears inp-name, inp-phone, State.name, State.phone
  LS.del('client')
  Hides banner
  updateNav()  → disables btn-next
```

**`formatDateHe(dateStr)` — Hebrew date formatting:**
```js
// Creates Date at noon to avoid midnight DST ambiguity
const d = new Date(dateStr + 'T12:00:00');
return `יום ${HE_DAYS_FULL[d.getDay()]}, ${d.getDate()} ב${HE_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
// Example: "יום שני, 23 ביוני 2026"
```

**Validation state — when is `btn-next` enabled on step 3:**
```
isValidName(name):  name.trim().length >= 2
isValidPhone(phone): /^05[0-9]{8}$/.test(phone.replace(/\D/g, ''))

Both must be true. Evaluated on every 'input' event on both fields.
```

#### Step 3 → Step 4 (Personal Details to OTP Verification)

**Trigger:** User taps "שלחי קוד SMS" with valid name + phone

```
handleNext() step 3 branch:

1. COOLDOWN CHECK (frontend rate-limit):
   cooldownLeft = State.otpCooldownUntil - Date.now()
   IF cooldownLeft > 0:
     toast(`ניתן לשלוח קוד שוב בעוד ${Math.ceil(cooldownLeft / 1000)} שניות.`, 'error')
     RETURN — do not call API

2. Capture final values:
   State.name  = inp-name.value.trim()
   State.phone = inp-phone.value.replace(/\D/g, '')   // digits only, 10 chars

3. Generate booking ID:
   State.bookingId = uuid4()
   // crypto.randomUUID() if available, else RFC 4122 v4 fallback

4. Save to localStorage (enables returning-client UX on next visit):
   LS.set('client', { name: State.name, phone: State.phone })

5. setLoading(true):
   Replaces btn-next innerHTML with SVG spinner
   btn-next.disabled = true

6. apiSendOTP(State.phone):
   POST { action: 'sendOTP', phone: '05XXXXXXXX' }
   30-second timeout via AbortController

   SUCCESS RESPONSES:
   { success: true }
     → State.otpCooldownUntil = Date.now() + 30_000
     → showStep(4)
     → js-otp-phone.textContent = `קוד אימות נשלח למספר ${formatPhone(State.phone)}`
     → renderOTPInputs()  — creates 6 boxes, focuses box 0 after 300ms
     → startResendTimer() — 60s countdown; disables resend button

   { success: false, error: 'rate_limited', retryAfterSecs: 30 }
     → toast(`ניתן לשלוח קוד שוב בעוד 30 שניות.`, 'error')
     → stay on step 3

   { success: false, error: 'sms_quota_exceeded' }
     → toast('שגיאה בשליחת SMS. בדקי את המספר ונסי שוב.', 'error')

   NETWORK/HTTP ERROR (catch block):
     → toast('שגיאת חיבור. בדקי את החיבור לאינטרנט ונסי שוב.', 'error')

7. setLoading(false) in finally block (restores btn-next via updateNav())
```

**OTP 6-box micro-interactions (`renderOTPInputs`):**

Six `<input>` elements with these behaviors:

| Event | Behavior |
|---|---|
| `input` | Strip non-digits, keep last 1 digit. Add `.filled` class. Remove `.error`. Focus next box if digit entered. If digit in box 6: call `autoSubmitOTP()`. |
| `keydown Backspace` | If current box is empty AND idx > 0: focus previous box, clear it, remove `.filled`. |
| `keydown ArrowLeft` | Focus next box (RTL: left = next in natural reading order for Hebrew). |
| `keydown ArrowRight` | Focus previous box. |
| `paste` | `e.preventDefault()`. Strip non-digits from clipboard, fill boxes left to right. If 6 digits pasted: call `autoSubmitOTP()`. Else focus first unfilled box. |

**`autoSubmitOTP()`:**
```js
async function autoSubmitOTP() {
  updateNav();          // ensure btn-next reflects completed state
  await delay(200);     // 200ms micro-pause so user sees the last digit appear
  const otp = getOTP();
  if (otp.length === CONFIG.OTP_LENGTH) await submitOTP(otp);
}
```

**Resend timer (`startResendTimer`):**
```
secs = 60 (CONFIG.OTP_RESEND_SECS)
js-resend button: disabled = true
js-resend-timer span: "(60s)" → "(59s)" → ... → "(0s)" → cleared

Every second: secs--; update timer text
At secs === 0: clearInterval; btn.disabled = false; timer.textContent = ''
```

**Resend button handler:**
```
Clears resend timer.
Calls handleNext() which re-enters step 3 branch.
The cooldown check runs: if 30s haven't elapsed since last OTP, shows toast.
If elapsed: sends new OTP, resets cooldown, restarts 60s display timer.
```

#### Step 4 → Step 5 (OTP Verification to Confirmation) or Error Paths

**`submitOTP(otp)` — called by autoSubmitOTP() and btn-next click on step 4:**

```
1. setLoading(true)

2. apiVerifyAndBook(otp):
   POST {
     action: 'verifyAndBook',
     otp: '123456',
     booking: {
       id:          State.bookingId,        // UUID v4
       name:        State.name,             // trimmed string
       phone:       State.phone,            // '05XXXXXXXX' (10 digits)
       service:     State.service.id,       // 'gel_classic' | 'gel_feet'
       serviceName: State.service.name,     // Hebrew display name
       date:        State.date,             // 'YYYY-MM-DD'
       time:        State.time,             // 'HH:MM'
       timestamp:   ts.tagged,             // 'YYYY-MM-DDTHH:MM:00+03:00'
       timezone:    'Asia/Jerusalem',
       duration:    State.service.duration, // 90 | 120
       status:      'Pending',
     }
   }

SUCCESS RESPONSE → { success: true, bookingId, status: 'Pending' }:
  → showStep(5)
  → renderConfirmation()

ERROR → { success: false, error: 'slot_not_available' } or 'slot_locked':
  toast('התור שבחרת כבר לא זמין. בחרי תאריך ושעה חדשים.', 'error')
  State.date = null
  State.time = null
  State.prefetchedMonths = new Set()  // force fresh slot data on return
  setTimeout(() => showStep(2), 2500) // 2.5s delay so user reads toast

ERROR → { success: false, error: 'invalid_otp' }:
  js-otp-error.textContent = 'הקוד שגוי. בדקי ונסי שוב.'
  js-otp-error.classList.remove('hidden')
  clearOTPInputs(markError=true)
    → all inputs: value='', remove .filled, add .error (red border)
    → setTimeout 400ms: remove .error from all inputs, focus input[0]
  setTimeout 3500ms: js-otp-error.classList.add('hidden')

NETWORK ERROR (catch):
  toast('שגיאת חיבור. נסי שוב בעוד מספר שניות.', 'error')

3. setLoading(false) in finally
```

#### Step 5 — Confirmation Screen

**`renderConfirmation()`:**

Builds 5 display rows using `sanitize()` on all user-supplied values:
```
{ label: 'שירות', value: sanitize(`${State.service.icon} ${State.service.name}`) }
{ label: 'תאריך', value: sanitize(formatDateHe(State.date)) }
{ label: 'שעה',   value: sanitize(State.time) }
{ label: 'לקוחה', value: sanitize(State.name) }
{ label: 'טלפון', value: sanitize(formatPhone(State.phone)) }
```

Booking ID displayed in monospace below:
```html
<p class="text-[10px] text-text-muted text-center font-light">מזהה הזמנה</p>
<p class="text-[10px] font-mono text-text-muted/60 text-center mt-0.5 tracking-wider">
  {State.bookingId}
</p>
```

The nav bar is hidden on step 5 (`js-nav.classList.add('hidden')`). Only the "הזמן תור נוסף" reset button is visible.

**`resetApp()`:**
```js
function resetApp() {
  State.step    = 1;
  State.service = null;
  State.date    = null;
  State.time    = null;
  State.name    = '';
  State.phone   = '';
  State.bookingId = null;
  State.calMonth  = null;
  State.loading   = false;
  State.otpCooldownUntil = 0;
  // NOT reset: State.slots, State.prefetchedMonths (cache preserved)

  _calMonthKey = '';  // force calendar rebuild on next render
  showStep(1);
  document.getElementById('inp-name').value  = '';
  document.getElementById('inp-phone').value = '';
  document.querySelectorAll('[data-qa^="card-service"]')
    .forEach(c => c.classList.remove('selected'));
}
```

### 3.3 Progress Bar Rendering

Four steps are shown in the stepper (step 5 hides the progress bar entirely).

| State | Visual | CSS |
|---|---|---|
| Completed (`n < step`) | Gradient circle + SVG checkmark + primary label | `bg-primary` circle, white `✓` |
| Current (`n === step`) | Gradient circle + step number + bold label | `bg-gradient-to-br from-[#C4A0B0] to-[#A67C8E]`, `ring-[3px] ring-cream` |
| Future (`n > step`) | Ghost circle + muted number + faded label | `border border-secondary/70 bg-white`, text opacity 40% |
| Connector line | Between each step | `bg-primary/50` if done; `bg-secondary/50` if not done. Transition: `duration-500`. |

### 3.4 Nav Button States

`updateNav()` is called after every state change. Logic:

| Step | `btn-back` | `btn-next` enabled? | `btn-next` text |
|---|---|---|---|
| 1 | hidden | `State.service !== null` | "המשך" |
| 2 | visible | `State.date && State.time` | "המשך" |
| 3 | visible | `isValidName(name) && isValidPhone(phone)` | "שלחי קוד SMS" |
| 4 | visible | `getOTP().length === 6` | "אמתי" |
| 5 | hidden | hidden | — |

### 3.5 Toast System

```js
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  const bg = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-white border-secondary/40 text-text-main';
  el.className = `pointer-events-auto ${bg} border rounded-xl px-4 py-3
                  text-sm font-medium text-center shadow-md mb-2 transition-all`;
  el.textContent = msg;
  wrap.appendChild(el);       // appended to #js-toast (top-center fixed)
  setTimeout(() => el.remove(), 3500);  // auto-remove after 3.5s
}
```

Multiple toasts stack vertically. Each is independent — they don't cancel each other.

### 3.6 Animation System

| Element | Animation | Spec |
|---|---|---|
| Step panels (`[id^="step-"]`) | `stepFadeIn` | `@keyframes stepFadeIn` applied via CSS; duration `.15s ease-out`. Triggered on `showStep(n)` by forcing reflow: `el.style.animation='none'; void el.offsetHeight; el.style.animation=''`. |
| Spinner (btn-next loading) | CSS `spinner` class | Rotating SVG circle. Used in btn-next and all admin action buttons. |
| Calendar skeleton | Tailwind `animate-pulse` | 35 `<div>` elements with `bg-secondary/30 rounded-lg`. |
| Connector line | Tailwind `transition-all duration-500` | Smooth color transition on step advance. |
| Progress step circles | Tailwind `transition-all` | Scale/color changes on step advance. |

### 3.7 LocalStorage Schema (Frontend)

All keys are prefixed with `meital_` (CONFIG.LS_PREFIX).

| Full Key | Type | Contents | Lifetime |
|---|---|---|---|
| `meital_client` | JSON object | `{ name: string, phone: string }` | Until "לא אני" is clicked or `LS.del('client')` is called |
| `meital_admin_token` | String | Raw ADMIN_TOKEN string from login | Until logout, or 24h session expiry |
| `meital_admin_ts` | String | `Date.now()` as string at login | Cleared on logout; compared in `sessionValid()` |

**LS wrapper (`booking.js`):**
```js
const LS = {
  get(k)    { try { const v = localStorage.getItem('meital_' + k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem('meital_' + k, JSON.stringify(v)); } catch { /* quota */ } },
  del(k)    { try { localStorage.removeItem('meital_' + k); } catch {} },
};
```

---

## 4. Security, Concurrency & Guardrails

### 4.1 XSS Prevention — Two Layers

**Layer 1 — Frontend `sanitize()` (booking.js):**
```js
const _ESC = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
function sanitize(str) {
  return String(str).replace(/[<>&"']/g, c => _ESC[c]).slice(0, 200);
}
```
Applied to ALL user-supplied values before any `innerHTML` write in `renderConfirmation()`. The five fields protected: service name, formatted date, time, client name, formatted phone.

**Layer 2 — Admin Dashboard `esc()` (admin-render.js):**
```js
export function esc(s) {
  return String(s || '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
```
Applied to every booking field before `innerHTML` injection in `buildCard()` and all other render functions.

**Why two separate functions:** `sanitize()` is in `booking.js` (public wizard) and also truncates to 200 chars as a defense-in-depth measure. `esc()` is in `admin-render.js` (admin UI) and is a pure HTML-escaping utility without truncation.

### 4.2 Race Condition Guard — LockService Step-by-Step

The scenario being prevented: two clients simultaneously open the booking wizard, both see slot `2026-06-15 10:30` as `Available`, both complete the OTP at the same millisecond.

```
Client A                          Client B
──────────────────────────────────────────────────────────
OTP validated ✓                   OTP validated ✓
LockService.waitLock(10000)       LockService.waitLock(10000)
  → Lock acquired ✓                 → Waits (lock held by A)
                                      (waits up to 10 seconds)
findSlotRow('2026-06-15','10:30')
Status = 'Available' ✓
Set Pending_Lock (atomic flush)
Write Bookings_Log row
Send admin SMS
lock.releaseLock()                  → Lock acquired ✓
                                    findSlotRow('2026-06-15','10:30')
                                    Status = 'Pending_Lock' ≠ 'Available'
                                    RETURN { success:false, error:'slot_not_available' }
                                    lock.releaseLock()

RESULT: Only Client A's booking succeeds. Client B receives the
'slot_not_available' error and is redirected to step 2 after 2.5s.
```

**If both clients arrive simultaneously and the lock times out (> 10 seconds of contention):**
```
Client B: LockService throws → caught by try/catch
RETURN { success: false, error: 'slot_locked' }
Frontend: same handler as 'slot_not_available' → redirect to step 2
```

**LockService scope:** `LockService.getScriptLock()` is a **script-wide** lock. Only one execution of any GAS function can hold it at a time across all concurrent requests to the same GAS deployment.

**`SpreadsheetApp.flush()` after every write:** GAS batches Sheets writes for performance. Without `flush()`, the Pending_Lock write might not be committed before the lock is released, creating a window where another request could read stale `Available` status. `flush()` forces immediate write to Google's servers.

### 4.3 HMAC-SHA256 Admin Token — Full Cryptographic Specification

**Purpose:** The admin SMS links contain `?token=<hex>`. This token cryptographically binds the URL to a specific `bookingId`. Forging a link for a different booking ID requires knowledge of `HMAC_SECRET` — a 32+ character random string stored only in GAS Script Properties.

**Signing (GAS — `signAdminToken`):**
```js
function signAdminToken(bookingId) {
  const secret = CFG.HMAC_SECRET;  // from PropertiesService
  const bytes  = Utilities.computeHmacSha256Signature(bookingId, secret);
  // bytes is a signed byte array in GAS — mask to unsigned with (b & 0xff)
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  // Result: 64-character lowercase hex string
}
```

**Verification (GAS — `handleAdminAction`):**
```js
const expected = signAdminToken(bookingId);  // recompute from bookingId
timingSafeEqual(expected, token)             // compare
```

**`timingSafeEqual` — prevents timing attacks:**
```js
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;  // early exit on length mismatch (safe: length is public)
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);  // XOR: diff stays 0 only if all chars match
  }
  return diff === 0;
}
```

**Why timing-safe comparison matters:** A naive `a === b` in JavaScript returns `false` as soon as the first mismatched character is found. An attacker measuring response times could learn how many characters of a forged token were correct (timing oracle). The XOR loop always iterates through all characters, making execution time independent of where the mismatch occurs.

**Token properties (verified by `runBackendTests`):**
- Deterministic: same `bookingId` + same `HMAC_SECRET` → same 64-hex token
- Different `bookingId` → different token
- Length: always 64 hex characters (SHA-256 = 32 bytes = 64 hex chars)
- Format: lowercase hex `/^[0-9a-f]{64}$/`

**Admin URL structure:**
```
${CFG.WEB_APP_URL}?action=APPROVE&id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}
```
Both `id` and `token` are URI-encoded to handle UUIDs with hyphens safely.

**Idempotency guard:** Even with a valid token, `handleAdminAction` checks `currentStatus === 'Pending'`. If the booking was already Approved or Rejected, it returns `{ success: false, error: 'already_processed', currentStatus }`. This prevents double-approvals if Meital taps the link twice.

### 4.4 OTP Lifecycle — Complete Specification

**Generation (GAS — `generateOTP`):**
```js
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
  // Range: 100000–999999 (always 6 digits)
  // Math.random() in GAS V8: uses system entropy
}
```

**Storage (GAS `CacheService`):**
```
Key:   'otp_' + normalizedPhone   (e.g. 'otp_+972541234567')
Value: '123456'                   (string)
TTL:   300 seconds (5 minutes)    — CacheService auto-expires
```

**Rate-limit key (separate CacheService entry):**
```
Key:   'otp_ratelimit_' + normalizedPhone
Value: '1'
TTL:   30 seconds
```

**OTP lifecycle states:**

```
[CREATED]
  generateOTP() → 6-digit string
  CacheService.put('otp_' + phone, otp, 300)
  Twilio SMS sent to client

[PENDING VERIFICATION]
  CacheService holds OTP for up to 5 minutes
  Client enters 6 digits in the UI

[VERIFIED — single use]
  handleVerifyAndBook reads cache:
    stored = CacheService.get('otp_' + phone)
    IF stored === otp:
      CacheService.remove('otp_' + phone)  ← IMMEDIATE DELETE
      Proceed with booking
    ELSE:
      Return { success: false, error: 'invalid_otp' }

[EXPIRED]
  After 5 minutes, CacheService auto-removes the entry
  Any verify attempt after expiry returns invalid_otp
```

**Dual-layer rate limiting:**

| Layer | Mechanism | Duration | Enforced By |
|---|---|---|---|
| Frontend | `State.otpCooldownUntil = Date.now() + 30_000` | 30 seconds | `handleNext()` step 3 checks `cooldownLeft > 0` before calling API |
| Backend | `CacheService.put('otp_ratelimit_' + phone, '1', 30)` | 30 seconds | `handleSendOTP` checks cache before generating OTP |

Both layers are independent. The frontend layer is a UX convenience (shows countdown to user). The backend layer is the security gate (cannot be bypassed by a direct API call).

**Backend rate-limit response:**
```json
{ "success": false, "error": "rate_limited", "retryAfterSecs": 30 }
```

Frontend handler:
```js
} else if (res.error === 'rate_limited') {
  const secs = res.retryAfterSecs || 30;
  toast(`ניתן לשלוח קוד שוב בעוד ${secs} שניות.`, 'error');
}
```

### 4.5 Admin Dashboard Authentication

**Session flow:**
```
1. Login:
   user enters ADMIN_TOKEN in password input
   POST { action: 'listBookings', token: <entered token> }
   IF data.success:
     localStorage.setItem('meital_admin_token', token)
     localStorage.setItem('meital_admin_ts', Date.now().toString())
     showDash()

2. Session validation on every load:
   function sessionValid() {
     const ts = parseInt(localStorage.getItem('meital_admin_ts') || '0', 10);
     return ts > 0 && (Date.now() - ts) < SESSION_TTL;  // 24h
   }
   IF token exists AND sessionValid(): skip login, call listBookings to validate

3. Every API call includes token:
   { action: '...', token: S.token, ...payload }

4. Server-side validation (validateAdmin):
   const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
   if (!body.token || body.token.trim() !== stored.trim()) return false;
   // .trim() on both sides prevents whitespace-in-property-value bugs

5. 403 response:
   Server returns { success: false, error: 'unauthorized', code: 403 }
   Frontend: if data.error === 'unauthorized' || data.code === 403 → logout()
```

**`logout()` function:**
```js
function logout() {
  S.token = '';
  localStorage.removeItem('meital_admin_token');
  localStorage.removeItem('meital_admin_ts');
  showLogin();
  document.getElementById('js-token-input').value = '';
  document.getElementById('js-login-err').classList.add('hidden');
}
```

### 4.6 Integrity Gate — Floating Booking Prevention

**Scenario prevented:** A client crafts a direct POST to `verifyAndBook` with a fabricated `date` and `time` that has no corresponding row in `Weekly_Slots`. Without this check, the system would write a booking for a non-existent slot.

**Implementation in `handleVerifyAndBook`:**
```js
// Spreadsheet ID check — guards against misconfigured deployments
if (CFG.SS_ID !== EXPECTED_SS_ID) {
  return { success: false, error: 'configuration_error' };
}

// Slot existence check (inside the LockService lock)
const slotRow = findSlotRow(booking.date, booking.time);
if (!slotRow) {
  return { success: false, error: 'slot_not_available' };
}

// Status double-check (TOCTOU guard — checks AFTER lock is acquired)
const currentStatus = String(slotRow.row[SLOT_COL.STATUS - 1]).trim();
if (currentStatus !== 'Available') {
  return { success: false, error: 'slot_not_available' };
}
```

**`findSlotRow(date, time)` — TZ-safe Sheets parsing:**

Google Sheets returns Date cells as JavaScript `Date` objects in UTC. Converting these with `Date.toString()` or `toISOString()` introduces off-by-one errors around midnight due to timezone differences. The fix:

```js
// Date cells:
const rowDate = (rawDate instanceof Date)
  ? Utilities.formatDate(rawDate, 'Asia/Jerusalem', 'yyyy-MM-dd')
  : String(rawDate).trim();

// Time cells (stored as Date objects with base date Jan 1, 1900):
// String(Date) → "Sat Dec 30 1899 10:00:00 GMT+..." — NEVER matches "HH:MM"
const rowStart = (rawStart instanceof Date)
  ? Utilities.formatDate(rawStart, 'Asia/Jerusalem', 'HH:mm')
  : String(rawStart).trim();
```

### 4.7 Validation Parity — Frontend and Backend Must Match

Both layers validate independently. The frontend validates for UX; the backend validates for security.

| Rule | Frontend | Backend |
|---|---|---|
| Name min 2 chars | `isValidName(n): n.trim().length >= 2` | `booking.name.trim().length < 2 → error: 'invalid_name'` |
| Phone Israeli mobile | `isValidPhone: /^05[0-9]{8}$/.test(digits)` | `normalizePhone(phone) → null if invalid → throw Error` |
| Service whitelist | Implicit (only 3 service cards shown) | `!ALLOWED_SERVICES.includes(booking.service) → error: 'invalid_service'` where `ALLOWED_SERVICES = ['gel_hands', 'regular_feet', 'gel_combo']` |
| OTP format | UI enforces digits, length 6, auto-submits | `stored !== String(otp) → error: 'invalid_otp'` |

### 4.8 `window.onerror` Crash Banner

`admin.html` must always have this as the **first** `<script>` in `<head>`:

```html
<script>
  window.onerror = function(msg, src, line, col, err) {
    var banner = document.getElementById('js-crash-banner');
    if (banner) {
      banner.textContent = 'שגיאה בטעינת הדאשבורד: ' + msg;
      banner.classList.remove('hidden');
    }
    return false;
  };
</script>
```

**Why this rule is mandatory:** A `SyntaxError` in `admin.js` causes the entire JS module to fail silently, leaving the page blank. The `window.onerror` handler fires for uncaught parse errors and renders a Hebrew branded error banner instead of a white screen. Without this, Meital would see a blank page with no indication of what went wrong.

---

## 5. Complete API Reference & Payloads

### 5.1 Authentication Matrix

| Category | Action | Auth Required | Token Type |
|---|---|---|---|
| Public | `getSlots` | None | — |
| Public | `sendOTP` | None | — |
| Public | `verifyAndBook` | None | — |
| Admin SMS link | `adminAction` (via GET) | HMAC token | Per-booking HMAC-SHA256 |
| Admin dashboard | All others | `ADMIN_TOKEN` | Script Property |
| Internal | `__ping__` | None | — |

### 5.2 Public API — Booking Flow

---

#### `getSlots`
**Method:** GET (from booking.js) or POST (from GAS internal)  
**Auth:** None  
**Purpose:** Returns available time slots for a calendar month

**Request (GET):**
```
GET {API_URL}?action=getSlots&year=2026&month=6
```

**Request (POST):**
```json
{ "action": "getSlots", "year": 2026, "month": 6 }
```

**Response — success:**
```json
{
  "success": true,
  "slots": {
    "2026-06-02": ["09:00", "10:30", "13:30"],
    "2026-06-03": ["10:30", "15:00"],
    "2026-06-08": ["09:00"]
  },
  "fromCache": true
}
```
`fromCache: true` is present only on cache hits (10-minute TTL). Absent on direct Sheet reads.

**Response — error:**
```json
{ "success": false, "error": "Invalid year/month. Got: year=NaN, month=13" }
```

**Caching logic:**
```
Cache key: 'slots_' + year + '_' + month   (e.g. 'slots_2026_6')
TTL: 600 seconds (10 minutes)
noCache override: GET param ?noCache=true or POST body { noCache: true } bypasses cache
Invalidation: invalidateSlotsCache(dateStr) removes the month key after any booking status change
```

---

#### `sendOTP`
**Method:** POST  
**Auth:** None  
**Purpose:** Generate and send 6-digit OTP to client's phone via Twilio

**Request:**
```json
{ "action": "sendOTP", "phone": "0541234567" }
```

**Response — success:**
```json
{ "success": true }
```

**Response — rate limited:**
```json
{ "success": false, "error": "rate_limited", "retryAfterSecs": 30 }
```

**Response — quota exceeded:**
```json
{ "success": false, "error": "sms_quota_exceeded" }
```

**Response — SMS delivery failure:**
```json
{
  "success": false,
  "error": "Twilio SMS failed: HTTP 400 | Twilio 21211: The 'To' number ... is not valid",
  "debugInfo": {
    "stage": "twilio",
    "to": "+972541234567",
    "from": "+972...",
    "httpStatus": 400,
    "twilioCode": 21211,
    "twilioMessage": "The 'To' number...",
    "moreInfo": "https://www.twilio.com/docs/errors/21211"
  }
}
```

---

#### `verifyAndBook`
**Method:** POST  
**Auth:** None  
**Purpose:** Validate OTP, atomically lock slot, write booking, notify admin

**Request (complete):**
```json
{
  "action": "verifyAndBook",
  "otp": "123456",
  "booking": {
    "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "שרה כהן",
    "phone": "0541234567",
    "service": "gel_hands",
    "serviceName": "לק ג'ל קלאסי",
    "date": "2026-06-15",
    "time": "10:30",
    "timestamp": "2026-06-15T10:30:00+03:00",
    "timezone": "Asia/Jerusalem",
    "duration": 90,
    "status": "Pending"
  }
}
```

**Response — success:**
```json
{ "success": true, "bookingId": "f47ac10b-58cc-4372-a567-0e02b2c3d479", "status": "Pending" }
```

**Response — OTP invalid:**
```json
{ "success": false, "error": "invalid_otp" }
```

**Response — slot taken or gone:**
```json
{ "success": false, "error": "slot_not_available" }
```

**Response — lock contention timeout:**
```json
{ "success": false, "error": "slot_locked" }
```

**Response — validation failure:**
```json
{ "success": false, "error": "invalid_name" }
{ "success": false, "error": "invalid_service" }
{ "success": false, "error": "configuration_error" }
```

---

### 5.3 Admin SMS Link — `adminAction` (via GET)

**Method:** GET (SMS link opened in browser)  
**Auth:** HMAC token in query params  
**Purpose:** Approve or reject a booking from Meital's phone

**URL format:**
```
{WEB_APP_URL}?action=APPROVE&id={bookingId}&token={hmacHex}
{WEB_APP_URL}?action=REJECT&id={bookingId}&token={hmacHex}
```

**Response — success:** HTML confirmation page (`buildAdminConfirmPage()`)  
**Response — invalid token:** `<h2>קישור לא תקין או פג תוקף.</h2>`  
**Response — already processed:** `<h2>הזמנה זו כבר טופלה.</h2>`  
**Response — booking not found:** `<h2>הזמנה לא נמצאה.</h2>`  
**Response — lock timeout:** `<h2>המערכת עמוסה. נסה שוב בעוד שניות ספורות.</h2>`

---

### 5.4 Admin Dashboard API — Complete Reference

All requests include `"token": "<ADMIN_TOKEN>"`. All error responses:
```json
{ "success": false, "error": "unauthorized", "code": 403 }
```

---

#### `listBookings`
```json
// Request
{ "action": "listBookings", "token": "..." }

// Response
{
  "success": true,
  "bookings": [
    {
      "id": "uuid-v4",
      "name": "שרה כהן",
      "phone": "+972541234567",
      "service": "gel_hands",
      "serviceName": "לק ג'ל קלאסי",
      "date": "2026-06-15",
      "time": "10:30",
      "duration": 90,
      "status": "Pending",
      "timestamp": "2026-06-10T14:22:00+03:00",
      "calEventId": ""
    }
  ]
}
```

---

#### `changeStatus`
```json
// Request
{ "action": "changeStatus", "token": "...", "bookingId": "uuid", "targetStatus": "Approved" }
// targetStatus: "Approved" | "Rejected" | "Cancelled"

// Response — success
{ "success": true, "newStatus": "Approved", "calEventId": "google_cal_event_id" }

// Response — invalid transition
{ "success": false, "error": "invalid_transition" }
```

---

#### `createBooking`
```json
// Request (admin creates booking directly, bypasses OTP)
{
  "action": "createBooking",
  "token": "...",
  "name": "רחל לוי",
  "phone": "0521234567",
  "service": "gel_combo",
  "date": "2026-06-20",
  "time": "14:00"
}

// Response
{ "success": true, "bookingId": "uuid-v4" }
```

---

#### `healthCheck`
```json
// Request
{ "action": "healthCheck", "token": "..." }

// Response
{
  "success": true,
  "overall": "ok",  // "ok" | "warn" | "error"
  "checks": [
    { "name": "properties",      "status": "ok",   "detail": "All 7 properties set" },
    { "name": "sheets",          "status": "ok",   "detail": "All required tabs found" },
    { "name": "calendar",        "status": "warn", "detail": "IS_TEST_MODE=true — Calendar calls mocked" },
    { "name": "testMode",        "status": "warn", "detail": "IS_TEST_MODE is true — not production" },
    { "name": "smsQuota",        "status": "ok",   "detail": "12/45 SMS used today (26%)" },
    { "name": "recentErrors",    "status": "ok",   "detail": "0 errors in last 24h" },
    { "name": "triggers",        "status": "ok",   "detail": "Both triggers installed" },
    { "name": "reminderLastRun", "status": "warn", "detail": "Not sent today yet" },
    { "name": "pendingBookings", "status": "warn", "detail": "3 bookings awaiting approval" }
  ]
}
```

Health check thresholds:
- `smsQuota`: ok < 70%, warn 70–89%, error ≥ 90% of `DAILY_SMS_LIMIT`
- `recentErrors`: ok = 0, warn = 1–5, error > 5 Execution_Log rows with "שגיאה" in last 24h

---

#### `getTemplate` / `saveTemplate`
```json
// getTemplate response
{
  "success": true,
  "template": [
    { "dayOfWeek": 0, "dayName": "ראשון", "startTimes": ["09:00", "10:30", "12:00"], "active": true },
    { "dayOfWeek": 1, "dayName": "שני",   "startTimes": ["09:00", "10:30"],          "active": true },
    { "dayOfWeek": 5, "dayName": "שישי",  "startTimes": [],                          "active": false },
    { "dayOfWeek": 6, "dayName": "שבת",   "startTimes": [],                          "active": false }
  ]
}

// saveTemplate request
{
  "action": "saveTemplate",
  "token": "...",
  "template": [/* same structure */]
}
// Response: { "success": true }
```

---

#### `generateSlots`
```json
// Request
{ "action": "generateSlots", "token": "...", "startDate": "2026-07-01", "endDate": "2026-07-31" }

// Response
{ "success": true, "added": 48, "skipped": 0 }
// added: new rows inserted; skipped: rows that already existed (idempotent)
```

---

#### `blockDates`
```json
// Request
{ "action": "blockDates", "token": "...", "startDate": "2026-07-14", "endDate": "2026-07-18" }

// Response
{ "success": true, "blocked": 15 }
// blocked: count of Available slots set to Blocked
```

---

#### `sendReminders`
```json
// Request (normal run)
{ "action": "sendReminders", "token": "..." }

// Request (force re-send, clears REMINDER_LAST_RUN first)
{ "action": "sendReminders", "token": "...", "force": true }

// Response — sent
{ "success": true, "sent": 3, "errors": 0, "skippedQuota": 0, "date": "2026-06-16" }

// Response — already ran today (no force)
{ "success": true, "skipped": true, "reason": "already_ran_today", "date": "2026-06-15" }

// Response — quota stopped batch mid-run
{ "success": true, "sent": 8, "errors": 0, "skippedQuota": 2, "date": "2026-06-16" }
```

---

#### `sendManualSMS`
```json
// Request
{ "action": "sendManualSMS", "token": "...", "phone": "+972541234567", "message": "היי שרה..." }

// Response
{ "success": true, "sid": "SM..." }
```

---

#### `getSlotInventory` / `toggleSlotStatus`
```json
// getSlotInventory response
{
  "success": true,
  "slots": [
    { "date": "2026-06-15", "time": "09:00", "status": "available" },
    { "date": "2026-06-15", "time": "10:30", "status": "booked" },
    { "date": "2026-06-15", "time": "12:00", "status": "blocked" },
    { "date": "2026-06-16", "time": "09:00", "status": "pending" }
  ]
}

// toggleSlotStatus request
{ "action": "toggleSlotStatus", "token": "...", "date": "2026-06-15", "time": "12:00" }

// Response — toggled
{ "success": true, "newStatus": "Available" }

// Response — not toggleable (Booked or Pending_Lock)
{ "success": false, "error": "cannot_toggle" }
```

---

#### `injectMock` (QA diagnostic)
```json
// status scenario
{ "action": "injectMock", "token": "...", "scenario": "status" }
// Response: { "success": true, "IS_TEST_MODE": false, "mode": "production", "message": "..." }

// quota scenario
{ "action": "injectMock", "token": "...", "scenario": "quota" }
// Response: { "success": true, "smsSentToday": 12, "smsLimit": 45, "remaining": 33 }
```

---

#### `__ping__`
```json
// Request
{ "action": "__ping__" }

// Response
{ "success": true, "pong": true, "ts": "2026-06-15T10:30:00.000Z" }
```

---

## 6. Data Schema — All Six Sheets

### 6.1 `Weekly_Slots`

Primary slot availability table. Manually populated or auto-generated from `Slot_Template`.

| Col | Header | Type | Valid Values |
|---|---|---|---|
| A | Date | Date cell / `YYYY-MM-DD` string | Any working date |
| B | Day | String | Hebrew weekday: `ראשון` / `שני` / `שלישי` / `רביעי` / `חמישי` |
| C | Start_Time | Time cell / `HH:MM` string | 24h format |
| D | End_Time | Time cell / `HH:MM` string | Start_Time + service duration |
| E | Status | String | `Available` / `Pending_Lock` / `Blocked` / `Booked` |

**Status state machine:**
```
Available  ──[booking in progress]──▶  Pending_Lock
                                           │
                     ┌─────────────────────┤
                     ▼                     ▼
                  Available            Booked
               [admin REJECT]      [admin APPROVE]
                     │
Available  ◀──[calendar event deleted + daily sync]

Available  ──[calendar event overlaps]──▶  Blocked
Blocked    ──[calendar event removed]  ──▶  Available

Pending_Lock ──[daily sync orphan cleanup]──▶  Available
  (when no matching Pending booking row exists in Bookings_Log)
```

**Critical parsing note:** GAS reads Date cells as JavaScript `Date` objects in UTC midnight. A slot on 2026-06-15 is stored as `new Date('2026-06-14T22:00:00Z')` (UTC-2 in summer Israel time). Using `date.toISOString().slice(0,10)` would return `'2026-06-14'` — wrong. Always use `Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd')`.

Similarly, Time cells return a `Date` object with base date Jan 1, 1900 and the time portion set. `String(timeDate)` returns something like `"Sat Dec 30 1899 10:30:00 GMT+0200"` — never `"10:30"`. Always use `Utilities.formatDate(t, 'Asia/Jerusalem', 'HH:mm')`.

### 6.2 `Bookings_Log`

Every booking ever created. One row per booking. Never deleted (only status changes).

| Col | Header | Type | Notes |
|---|---|---|---|
| A | UUID | String | RFC 4122 v4, e.g. `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| B | Name | String | Client full name as entered |
| C | Phone | String | E.164 format, e.g. `+972541234567` |
| D | Service | String | Service ID: `gel_hands`, `regular_feet`, or `gel_combo` |
| E | ServiceName | String | Hebrew display name |
| F | Date | Date cell | `YYYY-MM-DD` |
| G | Time | Time cell | `HH:MM` |
| H | Timestamp_ISO | String | ISO 8601 with Israel offset, e.g. `2026-06-10T14:22:00+03:00` |
| I | Duration_Min | Number | `90` or `120` |
| J | Status | String | `Pending` / `Approved` / `Rejected` / `Cancelled` |
| K | CalendarEventId | String | Google Calendar event ID. Empty until APPROVE. |
| L | AdminToken | String | 64-char lowercase hex. HMAC-SHA256 of UUID. |

### 6.3 `SMS_LOG` (auto-created on first SMS)

Immutable log of every SMS attempt. Never modified after write.

| Col | Header | Notes |
|---|---|---|
| A | Timestamp | `new Date()` at time of send |
| B | To | Recipient E.164 phone |
| C | Context | `OTP` / `AdminNotify` / `ClientApproval` / `ClientRejection` / `ClientCancellation` / `Reminder` |
| D | Status | `SENT` / `MOCK` / `ERROR` |
| E | Message | SMS body, truncated at 500 chars for cell safety |
| F | Detail | Twilio SID on `SENT`; error message on `ERROR`; empty on `MOCK` |

**`MOCK` entries:** When `IS_TEST_MODE = true`, all SMS calls write `MOCK` status entries. Real network calls are skipped. This is how the full booking flow can be tested without consuming Twilio quota.

### 6.4 `Audit_Log` (auto-created on first admin action)

Records every admin decision. Used for dispute resolution.

| Col | Header | Notes |
|---|---|---|
| A | Timestamp | Date of action |
| B | Admin | Always `dashboard` in current implementation |
| C | Action | `CreateBooking` / `Approved` / `Rejected` / `Cancelled` / `CreateBackup` |
| D | BookingId | UUID of affected booking |
| E | PrevStatus | Status before action |
| F | NewStatus | Status after action |
| G | Detail | Free text, max 300 chars |

### 6.5 `Execution_Log` (auto-created on first `log()` call)

Structured Hebrew operational log. Meital sees columns A–F; column G is hidden by default.

| Col | Header | Visibility | Content |
|---|---|---|---|
| A | זמן | Visible | `new Date()` — timestamp |
| B | פעולה | Visible | ACTION constant: `שליחת OTP` / `אימות והזמנה` / etc. |
| C | רמה | Visible | `✅ הצלחה` / `⚠️ אזהרה` / `❌ שגיאה` / `ℹ️ מידע` |
| D | טלפון | Visible | Recipient E.164 if applicable |
| E | ID הזמנה | Visible | Booking UUID if applicable |
| F | תיאור | Visible | Human-readable Hebrew summary for Meital |
| G | פרט טכני (דיבאג) | **Hidden** | Technical detail string — unhide via Sheets UI for debugging |

**Log levels and when they're used:**
| Level | Hebrew | When |
|---|---|---|
| `SUCCESS` (✅) | הצלחה | OTP sent, booking created, booking approved, calendar event created, sync completed |
| `WARNING` (⚠️) | אזהרה | Rate limit hit, OTP slot not available (not an error but worth noting), sync > 5 min |
| `ERROR` (❌) | שגיאה | SMS delivery failed, quota exceeded, Twilio API error |
| `INFO` (ℹ️) | מידע | Booking rejected, reminder batch summary |

### 6.6 `Slot_Template` (auto-created on first `getTemplate` call)

Weekly schedule template used to generate `Weekly_Slots` rows.

| Col | Header | Type | Notes |
|---|---|---|---|
| A | DayOfWeek | Number | 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat |
| B | DayName | String | Hebrew day name |
| C | StartTimes | String | Comma-separated HH:MM values, e.g. `"09:00,10:30,12:00"` |
| D | Active | Boolean | `true` / `false`. Fri (5) and Sat (6) are always `false` (locked in UI). |

---

## 7. External Service Integrations

### 7.1 Twilio SMS — Complete Integration

**Authentication:**
```
HTTP Basic Auth
  Username: TWILIO_ACCOUNT_SID
  Password: TWILIO_AUTH_TOKEN

Encoded header:
  Authorization: 'Basic ' + Utilities.base64Encode(SID + ':' + TOKEN)
```

**API endpoint:**
```
POST https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json
Content-Type: application/x-www-form-urlencoded (GAS `payload` format)
  To:   {E.164 recipient}
  From: {TWILIO_FROM_NUMBER}
  Body: {SMS text}
```

**`sendSMS()` execution flow:**
```
1. Log exact To/From values (reveals whitespace issues invisible in summary logs)
2. Save sendSMS._context (caller sets this before calling, e.g. 'OTP')
3. Build Twilio URL + options with Basic Auth header
4. UrlFetchApp.fetch(url, { muteHttpExceptions: true })
   muteHttpExceptions: true means non-2xx responses don't throw — we handle them manually
5. Check HTTP response code:
   200–299: extract SID from JSON response, call logSMS('SENT', body, sid)
   4xx/5xx: parse Twilio error JSON for code + message, call logSMS('ERROR', body, detail)
            throw Error with debugInfo for caller to surface
6. If network-level exception: logSMS('ERROR', body, 'network: ' + err.message)
                               throw Error with debugInfo.stage = 'network'
```

**SMS messages sent per booking lifecycle:**

| # | Recipient | Context | Trigger | Content |
|---|---|---|---|---|
| 1 | Client | OTP | User reaches step 3 | `קוד האימות שלך להזמנת תור: 123456\nתקף ל-5 דקות.` |
| 2 | Admin (Meital) | AdminNotify | OTP verified, booking written | Full booking details + APPROVE/REJECT links |
| 3a | Client | ClientApproval | Meital clicks APPROVE | `✅ ההזמנה שלך אושרה!\nשירות: ...\nתאריך: ...` |
| 3b | Client | ClientRejection | Meital clicks REJECT | `❌ לצערנו, הבקשה לתור ... לא אושרה.` |
| 4 | Client | Reminder | Daily 08:00 trigger | `תזכורת: מחר יש לך תור! שירות: ...` |

**Client SMS only sent if `isAutoSmsEnabled()`:**  
`getAutoSms` / `setAutoSms` actions toggle a PropertiesService flag `AUTO_SMS_ENABLED`. When disabled, client notification SMS are skipped (logged to Execution_Log). Admin notification SMS are always sent.

### 7.2 Twilio Quota Management

**Daily limit architecture:**
```
DAILY_SMS_LIMIT = 45  (constant in gas-backend.js)
Twilio trial cap = 50 SMS/day
Buffer = 5 units

Override: DAILY_SMS_LIMIT script property (if set, overrides the constant)
```

**`getDailySmsCount()` — counting logic:**
```js
function getDailySmsCount() {
  const tz    = 'Asia/Jerusalem';
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const sh    = smsLogSheet();
  const rows  = sh.getRange(2, 1, lastRow - 1, 1).getValues(); // column A only
  let count   = 0;
  for (const [cell] of rows) {
    if (cell instanceof Date) {
      const cellDay = Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
      if (cellDay === today) count++;
    }
  }
  return count;
}
```

**`checkSmsQuota(context)` — enforcement:**
```js
function checkSmsQuota(context) {
  const count = getDailySmsCount();
  if (count >= DAILY_SMS_LIMIT) {
    const msg = 'מכסת SMS יומית הגעה ל-' + count + '/' + DAILY_SMS_LIMIT;
    log(LOG_LEVEL.ERROR, context, msg);
    throw new Error(msg);  // caller catches and returns error response
  }
}
```

**Quota enforcement points:**
1. `handleSendOTP` — before generating OTP. If quota exceeded: `{ success: false, error: 'sms_quota_exceeded' }`. No OTP generated, no cache write.
2. `sendDailyReminders` — per-booking before each send. If quota reached mid-batch: stops batch cleanly. `REMINDER_LAST_RUN` is NOT written if quota blocked sends (allows retry next trigger).

**Health check thresholds (visible in admin dashboard):**
- ok: count < 31 (< 70% of 45)
- warn: 31–40 (70–89%)
- error: ≥ 41 (≥ 90%)

### 7.3 Google Calendar — Full Sync Logic

**`createCalendarEvent()` — called on APPROVE:**
```js
const cal = CalendarApp.getCalendarById(CFG.CAL_ID);
const start = new Date(year, month-1, day, hour, min, 0);  // local time (Israel)
const end   = new Date(start.getTime() + duration * 60 * 1000);

const event = cal.createEvent(
  `💅 ${serviceName} — ${clientName}`,
  start, end,
  {
    description: `הזמנה #${bookingId}\nלקוחה: ${clientName}\nשירות: ${serviceName}`,
    status: 'confirmed',
  }
);
return event.getId();  // stored in Bookings_Log col K
```

Event title format: `💅 לק ג'ל קלאסי — שרה כהן`

**`syncCalendarToSlots()` — daily 01:00 trigger — 3-pass logic:**

```
PASS 1 — Orphaned Pending_Lock cleanup:
  Read ALL Bookings_Log rows → build Set of 'YYYY-MM-DD|HH:MM' for Pending bookings
  Scan Weekly_Slots for rows with Status = Pending_Lock
  IF Pending_Lock slot has no matching Pending booking row:
    → Set Status = Available  (orphan released)
    → changedDates.add(date)
  Rationale: GAS can crash mid-booking (e.g., Twilio timeout).
  Without this, an orphaned Pending_Lock slot would be permanently unavailable.

PASS 2 — Calendar overlap sync (30-day window):
  events = CalendarApp.getCalendarById(CAL_ID).getEvents(now, now + 30 days)
  For each slot row with Status = Available or Blocked:
    Parse date + start + end using Utilities.formatDate (TZ-safe)
    slotStart = new Date(yr, mo-1, da, sh, sm)
    slotEnd   = new Date(yr, mo-1, da, endH, endM)  // or sh+2 if end missing
    
    overlaps = events.some(ev => ev.getStartTime() < slotEnd && ev.getEndTime() > slotStart)
    
    IF overlaps && status === 'Available':
      → Status = Blocked    (personal appointment blocks this slot)
    IF !overlaps && status === 'Blocked':
      → Status = Available  (appointment deleted, slot restored)
    
    changedDates.add(date) for every changed slot

POST-SYNC — Cache invalidation:
  changedDates.forEach(invalidateSlotsCache)
  → Removes CacheService entry for each affected month
  → Next getSlots request will re-read from Sheets and see updated statuses
  (Without this, clients would see stale cached slot data for up to 10 minutes)

TIMING GUARD:
  IF elapsed > 5 minutes: log WARNING
  ELSE: log SUCCESS
```

**Overlap detection formula:** `ev.getStartTime() < slotEnd && ev.getEndTime() > slotStart` — this is standard interval overlap detection. It catches partial overlaps (event starts during slot, event ends during slot, event spans entire slot).

### 7.4 Google Sheets — Performance Characteristics

| Operation | Cost | Mitigation |
|---|---|---|
| `getDataRange().getValues()` | ~200–500ms per sheet | Cache slot data for 10 minutes |
| `getRange(r, c).setValue(v)` | ~50–100ms per call | Always call `SpreadsheetApp.flush()` after writes |
| `appendRow([...])` | ~100–200ms | Acceptable for infrequent booking writes |
| Opening the spreadsheet (`openById`) | ~100ms | Cached by GAS session for the duration of the execution |

**`withRetry(fn, opts)` — exponential back-off:**
```js
function withRetry(fn, opts) {
  const maxAttempts = opts?.maxAttempts || 3;
  const baseDelayMs = opts?.baseDelayMs || 500;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return fn(); }
    catch (e) {
      lastErr = e;
      if (attempt < maxAttempts) Utilities.sleep(baseDelayMs * Math.pow(2, attempt - 1));
      // Delays: 500ms, 1000ms (total: 3 attempts over ~1.5s max)
    }
  }
  throw lastErr;
}
```

### 7.5 Supabase Integration (V2 Data Layer)

**Architecture:** When `IS_SUPABASE_ENABLED = true`, four actions route to V2 handlers:

| Action | V1 Handler (Sheets) | V2 Handler (Supabase) |
|---|---|---|
| `getSlots` | `handleGetSlots` | `handleGetSlotsV2` |
| `sendOTP` | `handleSendOTP` | `handleSendOTPV2` |
| `verifyAndBook` | `handleVerifyAndBook` | `handleVerifyAndBookV2` |
| `adminAction` | `handleAdminAction` | `handleAdminActionV2` |

Admin-only actions (`adminGetSlots`, `adminGetClients`, `adminGetClientHistory`, etc.) are V2-only.

**Migration:** Run `migrateToSupabase` admin action once to copy all Sheets data to Supabase. This is a one-time, non-destructive operation.

**Fallback:** `sendDailyReminders` tries V2 first (`sendDailyRemindersV2()`); if V2 returns `null`, falls back to `_sendDailyRemindersSheets()`. This ensures reminders are never silently skipped due to a Supabase outage.

---

## 8. Admin Dashboard — Complete Reference

### 8.1 Architecture

```
admin.html (structure + window.onerror guard)
     ↓ <script type="module">
admin.js (all state + API calls + event handlers + tab logic)
     ↓ ES module imports
admin-render.js (pure HTML generation — no DOM reads)
```

**Module boundary rule:** `admin-render.js` functions ONLY receive data as arguments and return HTML strings. They never read from the DOM, never access `S` (state), never call API. This makes them independently unit-testable with Vitest (no DOM environment needed).

**Event delegation in admin.js:** Booking cards use `data-action` and `data-id` attributes instead of inline `onclick`. After `buildCard()` generates HTML and `cards.innerHTML` is set, a single event listener on the `#js-cards` container delegates all button clicks via `querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', onAction))`.

### 8.2 Dashboard State Object (`S`)

```js
const S = {
  token:            localStorage.getItem('meital_admin_token') || '',
  bookings:         [],        // all bookings from listBookings
  filter:           'all',     // current filter pill selection
  dateJump:         '',        // date string for daily planner filter, or ''
  tab:              'bookings', // active tab
  template:         [],        // Slot_Template rows
  autoSms:          true,      // current auto-SMS toggle state
  _smsSendTarget:   null,      // { id, phone, name } for manual SMS modal
  diarySlots:       [],        // diary slot inventory
  clients:          [],        // client list from V2 API
  clientHistory:    null,      // selected client's booking history
  clientSearch:     '',        // current client search string
  _clientSearchTimer: null,    // debounce timer for client search
};
```

### 8.3 Booking Card — `buildCard(b)` Render Logic

```
Inputs: booking object b with fields: id, name, phone, service, serviceName, date, time, status, duration

Status badge: LABELS[b.status] → Hebrew label; STATUS_CLS[b.status] → Tailwind classes
  Pending:   'bg-amber-100 text-amber-700' → "ממתין"
  Approved:  'bg-green-100 text-green-700' → "מאושר"
  Rejected:  'bg-red-100 text-red-600'    → "נדחה"
  Cancelled: 'bg-gray-100 text-gray-400'  → "בוטל"

Action buttons per status:
  Pending:   [✅ אשר] (data-action=Approved) + [❌ דחה] (data-action=Rejected)
  Approved:  [🚫 בטל] (data-action=Cancelled) + [✉ SMS] (data-action=sms)
  Rejected:  [✉ SMS] only
  Cancelled: [✉ SMS] only

All buttons include data-id={esc(b.id)} and data-phone={esc(b.phone)}.
All user-supplied strings pass through esc() before insertion.
No inline onclick ever — all events delegated via data-action in admin.js.
```

### 8.4 Booking Filters — `visible()` Logic

```js
function visible() {
  let rows = S.bookings;

  // Date jump overrides all filters
  if (S.dateJump) {
    return rows.filter(b => b.date === S.dateJump);
  }

  // isStale: booking date+time is more than 48h in the past
  // isFinished: status is Rejected or Cancelled
  if (S.filter === 'history')
    return rows.filter(b => isFinished(b) || isStale(b));
  if (S.filter === 'all')
    return rows.filter(b => !isFinished(b) && !isStale(b));
  return rows.filter(b => b.status === S.filter && !isStale(b));
}
```

### 8.5 Tab Initialization — What Loads When

| Tab | Load trigger | API calls made |
|---|---|---|
| `bookings` | Default on login | `listBookings` (already in S.bookings) |
| `pulse` | `setTab('pulse')` | None — computed from `S.bookings` |
| `slots` | `setTab('slots')` | `getTemplate`, `getSystemInfo`, `getAutoSms` |
| `diary` | `setTab('diary')` + if from='' | `adminGetSlots` (V2), `getSmsLog` |
| `clients` | `setTab('clients')` + if empty | `adminGetClients` (V2) |

### 8.6 Manual SMS Modal

```
Trigger: Click [✉ SMS] button on any booking card
  → data-action="sms" handler → openSmsModal({ id, phone, name })

Modal sets:
  js-sms-recipient.textContent = '{name} ({phone formatted})'
  js-sms-text.value = 'היי {name}, רציתי לעדכן ש…'  (pre-filled template)
  S._smsSendTarget = { id, phone, name }
  Focus: js-sms-text after 50ms

On send:
  POST { action: 'sendManualSMS', token, phone: S._smsSendTarget.phone, message: text }
  Success: toast('SMS נשלח ✅', 'ok'); closeSmsModal()
  Failure: toast('שגיאה בשליחת SMS', 'err')

Close: js-sms-modal.classList.add('hidden'); S._smsSendTarget = null
```

### 8.7 Admin Approval Flow — `onAction()` Handler

```
User clicks [✅ אשר] on a Pending booking card:
  btn.dataset.action = 'Approved'
  btn.dataset.id     = '<uuid>'

onAction(e):
  id     = btn.dataset.id
  target = btn.dataset.action   // 'Approved' | 'Rejected' | 'Cancelled'

  IF target === 'sms': openSmsModal(...); return

  confirm(CONFIRM_MSG[target]):
    Approved:  'לאשר את ההזמנה?'
    Rejected:  'לדחות את ההזמנה?'
    Cancelled: 'לבטל את ההזמנה?\nהאירוע ביומן Google יימחק.'

  IF user cancels confirm dialog: return

  Disable all buttons on card; show spinner on clicked button

  POST { action: 'changeStatus', bookingId: id, targetStatus: target, token }
  Success:
    toast(OK_MSG[target], 'ok')   // 'ההזמנה אושרה ✅' etc.
    await load(true)              // silent reload — no skeleton, updates S.bookings
  Failure:
    toast('שגיאה: ' + err.message, 'err')
    Re-enable all buttons; restore button label
```

---

## 9. Quality Assurance & Testing Architecture

### 9.1 Zero-Console-Error Gate — Mandatory Rule

**Background:** A `SyntaxError: Unexpected string` caused by adjacent string literals in an `onclick` attribute generation pattern crashed the entire `admin.js` module. All backend and unit tests passed green. The only way to catch this class of error is to run the HTML file through a real browser JS parser.

**The mandatory check before any admin frontend change:**
```bash
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```

**Tests in this file and what they protect:**

| Test Name | Failure Indicates |
|---|---|
| `admin.html loads without any JS console errors` | SyntaxError or ReferenceError in admin.js or admin-render.js |
| `login panel is visible immediately — no white screen` | Module load failure; page renders nothing |
| `switching to each tab does not throw a JS exception` | Runtime error in any tab's initialization code |

**Safe HTML generation rule — adjacent string literal bug:**
```js
// ❌ WRONG — SyntaxError: Unexpected string
// The '' next to 'onclick' is read as two adjacent string literals
'<button onclick="fn(' + id + ','' + val + '')">' 

// ✅ CORRECT — escape single quotes with \'
'<button onclick="fn(' + id + ',\'' + val + '\')">'
```

### 9.2 Test Suite Map

| Test File | Type | Framework | Runs In | Coverage Focus |
|---|---|---|---|---|
| `tests/unit/utils.test.js` | Unit | Vitest | CI (GitHub Actions) | Booking utility functions |
| `tests/unit/admin-render.test.js` | Unit | Vitest | CI | Admin render pure functions |
| `tests/e2e/booking.spec.js` | E2E | Playwright | CI | 5-step booking wizard |
| `tests/e2e/legal.spec.js` | E2E | Playwright | CI | Legal modal |
| `tests/e2e/admin-dashboard.spec.js` | E2E | Playwright | CI | Admin dashboard load + tabs |
| `tests/e2e/admin-render.spec.js` | E2E | Playwright | CI | Admin render in browser |
| `tests/e2e/qa_guardrails.spec.js` | E2E | Playwright | CI | QA-specific guardrails |
| `tests/backend_unit_tests.js` | Backend unit | GAS runner | GAS editor | Pure GAS functions |

### 9.3 Playwright E2E Test Architecture (`booking.spec.js`)

**Route interception strategy:**

All E2E booking tests intercept the live GAS URL at two levels:
1. `config.js` route — overrides `IS_MOCK_MODE: false` and injects a test GAS URL
2. GAS URL glob (`https://script.google.com/macros/s/**`) — intercepts actual API calls

```js
// config.js route override — forces real API mode with controllable mock URL
await page.route('**/config.js', route =>
  route.fulfill({
    contentType: 'application/javascript',
    body: `const APP_CONFIG = { API_URL: "${TEST_GAS_URL}", IS_MOCK_MODE: false };
           export default APP_CONFIG;`,
  })
);

// GAS action handler override
await page.route(GAS_GLOB, async (route, request) => {
  const body = JSON.parse(request.postData());
  if (body.action === 'sendOTP')       return route.fulfill({ body: JSON.stringify({ success: true }) });
  if (body.action === 'verifyAndBook') return route.fulfill({ body: JSON.stringify({ success: true, ... }) });
  return route.fulfill({ status: 400, body: '{}' });
});
```

**`setupMocksWithOverrides(page, overrides)` helper:**
```js
// Used by hardening tests to inject per-action error responses
await setupMocksWithOverrides(page, {
  sendOTP: { status: 500, body: '{}' },       // simulate HTTP 500
  verifyAndBook: { success: false, error: 'slot_not_available' }
});
```

**E2E test coverage — error paths:**

| Scenario | Expectation |
|---|---|
| `sendOTP` returns HTTP 500 | Stays on step 3; shows Hebrew error toast; no raw "HTTP 500" in UI |
| `sendOTP` returns `rate_limited` | Shows seconds-remaining Hebrew toast |
| `verifyAndBook` returns HTTP 500 | Stays on step 4; shows Hebrew error toast |
| `verifyAndBook` returns `slot_not_available` | Shows "slot gone" toast; navigates to step 2 after 2.5s |
| `verifyAndBook` returns `invalid_otp` | Shows inline `#js-otp-error` element (not a toast) |

### 9.4 Unit Test Coverage (`utils.test.js`)

| Suite | Count | Functions tested |
|---|---|---|
| `sanitize()` | 9 | HTML entity escaping, 200-char truncation |
| `isValidPhone()` | mirror | Israeli 05X format, E.164 pass-through |
| `smsQuotaStatus` | 6 | ok/warn/error thresholds at 70%/90% of 45 |
| OTP cooldown state | 7 | `isCoolingDown(cooldownUntil)`, `remainingSecs(cooldownUntil)` |
| `normalizePhone` | 6 | E.164 conversion, hyphen/space stripping, landlines → null |
| Modal content/state | 12 | LEGAL_CONTENT structure, `openModal`/`closeModal` state |

### 9.5 GAS Backend Testing

**`runInternalTests()` — run from GAS editor:**
- `normalizePhone`: valid Israeli mobile numbers (raw, dashes, spaces)
- `normalizePhone`: E.164 and 972-prefix inputs
- `normalizePhone`: invalid inputs → null (landlines, too short, empty)
- `generateOTP`: length 6, digits only, range 100000–999999

**`runBackendTests()` — run from GAS editor:**
All of the above, plus:
- `signAdminToken`: deterministic, different inputs → different tokens, 64-char hex
- `timingSafeEqual`: matching, non-matching, length mismatch

**`testFullBookingFlow()` — golden path integration test:**

This test exercises the complete booking flow end-to-end with real Sheets + Calendar operations, using a phone number of `0500000000` with `IS_TEST_MODE` controlling Twilio/Calendar:

```
Step 1: Insert test slot into Weekly_Slots (Available)
Step 2: Inject OTP into CacheService; call handleVerifyAndBook
Step 3: Assert slot status = Pending_Lock
Step 4: Assert booking row in Bookings_Log with status = Pending
Step 5: Call handleAdminAction APPROVE
Step 6: Assert slot status = Booked
Step 7: Assert booking status = Approved; CalendarEventId set
Cleanup: Delete Calendar event (if created), delete log row, delete slot row
Result: { success: true/false, passed, failed }
```

**`verifyConfig()` — pre-launch checklist:**
```
- SPREADSHEET_ID matches EXPECTED_SS_ID constant
- All 7 required script properties are set
- Weekly_Slots and Bookings_Log sheets accessible
Outputs to GAS Execution Log; safe to run at any time.
```

### 9.6 Solo QA Protocol (Self-Testing Procedure)

**Before every code change that touches frontend JS:**
1. Open the changed file in Chrome DevTools console — look for red parse errors
2. If touching `admin.js` or `admin-render.js`: run `npx playwright test tests/e2e/admin-dashboard.spec.js` in CI (or trigger GitHub Actions)

**Before any deployment to production:**
1. Run `verifyConfig()` from GAS editor — all checks green
2. Run `testFullBookingFlow()` from GAS editor — 7/7 steps pass
3. Open `index.html` in browser — service cards visible, calendar loads
4. Open `admin.html` — login panel visible, no white screen
5. Login with ADMIN_TOKEN — booking list loads
6. Health check from Business Pulse tab — no red checks

**5-minute smoke test checklist:**
- [ ] Service cards render (step 1)
- [ ] Calendar loads with available slots (step 2)
- [ ] Date and time selectable
- [ ] Personal details form validates (step 3)
- [ ] OTP sent (step 3→4) — verify SMS received
- [ ] Admin dashboard loads — all 5 tabs switch without console errors
- [ ] Health check in Business Pulse tab — all green or expected yellows

---

## 10. Deployment, Operations & Rollback

### 10.1 First-Time Deployment Checklist

```
[ ] Step 1 — Google Sheets
    Create spreadsheet; copy SPREADSHEET_ID from URL
    Create tabs: Weekly_Slots, Bookings_Log (headers as per Section 6)
    SMS_LOG, Audit_Log, Execution_Log, Slot_Template are auto-created by GAS

[ ] Step 2 — GAS Deployment
    script.google.com → New Project → paste gas-backend.js
    Project Settings → Script Properties → add all 10 keys (Section 12.B)
    Deploy → New Deployment → Web App
      Execute as: Me
      Who has access: Anyone
    Copy Web App URL → paste as WEB_APP_URL property
    Run installTriggers() from editor (installs 2 time triggers)

[ ] Step 3 — Frontend Wiring
    config.js: set API_URL to GAS Web App URL
    config.js: IS_MOCK_MODE = false
    Deploy frontend/ to static host (GitHub Pages, Netlify, Vercel)

[ ] Step 4 — Twilio
    Create account at twilio.com
    Buy Israeli number or alphanumeric sender
    Add credentials to GAS script properties

[ ] Step 5 — Supabase (V2 data layer)
    Create Supabase project; get API URL and anon key
    Add SUPABASE_URL and SUPABASE_KEY to GAS script properties
    Create tables (schema matches Sheets schema — see Section 6)
    Set IS_SUPABASE_ENABLED = true in gas-backend.js
    Redeploy GAS (clasp push + new version)
    Run migrateToSupabase admin action to copy existing data

[ ] Step 6 — End-to-end verification
    Run verifyConfig() — all checks green
    Complete a live test booking with a real phone number
    Verify OTP SMS received
    Verify admin SMS received with working APPROVE/REJECT links
    Click APPROVE — verify Google Calendar event created
    Verify client confirmation SMS received
    Open admin dashboard — booking shows as Approved with CalendarEventId
```

### 10.2 Routine Maintenance Schedule

| Task | Frequency | Method |
|---|---|---|
| Populate next 4 weeks of slots | Weekly (Sunday) | Admin dashboard → ניהול זמנים → Generate Slots |
| Check Execution_Log for errors | Weekly | Google Sheets → Execution_Log; filter col C for ❌ |
| Check SMS_LOG count | Weekly | Google Sheets → SMS_LOG; count today's rows |
| Create backup snapshot | Before any bulk edit | Admin dashboard → Business Pulse → Health Check → "צור גיבוי" (or `createBackup` admin action) |
| Verify triggers are installed | Monthly | Admin dashboard → Health Check → triggers row |
| Check Twilio quota | Daily (trial account) | Admin dashboard → Health Check → smsQuota row |

### 10.3 Adding a New Service

1. **`booking.js`** — add entry to `SERVICES` array:
   ```js
   { id: 'new_service', name: 'Hebrew Name', desc: 'Description', duration: 60, icon: '🎨' }
   ```
2. **`gas-backend.js`** — add to `ALLOWED_SERVICES` whitelist in `handleVerifyAndBook`:
   ```js
   const ALLOWED_SERVICES = ['gel_hands', 'regular_feet', 'gel_combo', 'new_service'];
   ```
3. **`admin-render.js`** — add to `SERVICE_NAME` map:
   ```js
   export const SERVICE_NAME = { gel_hands: "...", regular_feet: "...", gel_combo: "...", new_service: "Hebrew Name" };
   ```
4. Run the Zero-Console-Error Gate.
5. `clasp push` to deploy backend.

### 10.4 Rollback Procedures

**Frontend rollback:**
```bash
git revert <commit-hash>
git push origin main
# Redeploy static files to host
```

**GAS backend rollback:**
1. GAS editor → Deployments → Manage Deployments
2. Find previous deployment version
3. Click the three dots → "Edit" → change "Version" to previous
4. Save — traffic immediately routes to old version

**Data recovery:**
1. Open Google Spreadsheet
2. Find the most recent `_Backup_YYYYMMDD_HHmm` tab
3. Copy data back to `Weekly_Slots` or `Bookings_Log` as needed
4. Run `clearSlotsCache` admin action to invalidate stale CacheService entries

### 10.5 Deployment File Relationships

```
Edit this file                    Then do this
──────────────────────────────────────────────────────
backend/gas-backend.js           clasp push (Code.js updated automatically)
                                 New GAS deployment required for new doPost routes

frontend/booking.js              Deploy frontend/ to static host
frontend/admin.js                Run Zero-Console-Error Gate first
frontend/admin-render.js         Run Zero-Console-Error Gate first; Vitest unit tests
frontend/config.js               Deploy frontend/ to static host
frontend/admin.html              Run Zero-Console-Error Gate first

CLAUDE.md                        No deployment needed (AI agent instructions)
SYSTEM_MASTER_DOC.md             No deployment needed (documentation)
```

---

## 11. Project Evolution & Decisions Log

### 11.1 Architectural Decisions

#### Decision 1 — Google Apps Script as Backend
**Why GAS:** Free, serverless, zero-maintenance. Native access to Google Workspace APIs (Sheets, Calendar) with no OAuth dance — the `CalendarApp` and `SpreadsheetApp` services authenticate with the deploying user's credentials automatically. The V8 engine (ES2019) is familiar to any JS developer.  
**Trade-offs:** 6-minute execution cap; no WebSockets; no npm packages; `LockService` is process-global (fine for current scale, becomes a bottleneck at high concurrency).  
**Why not Node/Express/Vercel:** No free serverless tier with this combination of Sheets + Calendar native integration. Adds deployment complexity for zero benefit at this scale.

#### Decision 2 — `Content-Type: text/plain` for POST Requests
**Why:** GAS CORS handling requires "simple" requests to avoid preflight. `application/json` triggers `OPTIONS` preflight which GAS does not handle.  
**Impact:** Every developer who reads `apiCall()` in `admin.js` will be confused by `'Content-Type': 'text/plain'`. This document is the explanation.

#### Decision 3 — Separate `HMAC_SECRET` and `ADMIN_TOKEN`
**Why:** Using one secret for both purposes means compromising either the admin SMS link signing OR the dashboard authentication leaks both. Separation follows the principle of least privilege. A compromised `ADMIN_TOKEN` lets an attacker use the dashboard; it does NOT let them forge approve/reject SMS links (which require `HMAC_SECRET`).

#### Decision 4 — OTP in `CacheService`, Not in Sheets
**Why:** Sheets writes take 200–500ms and persist. OTPs need automatic 5-minute expiry (TTL) and millisecond-fast reads. `CacheService` provides both natively. A Sheet-based OTP store would require a cleanup trigger and would add 500ms to every `sendOTP` call.

#### Decision 5 — `LockService.getScriptLock()` for Race Conditions
**Why:** GAS Web Apps can receive concurrent requests. Without a script-global lock, two simultaneous `verifyAndBook` calls for the same slot would both see `Available` status and both succeed, creating a double-booking. The 10-second `waitLock` timeout is sufficient for the expected request latency; the 30-second abort case returns `slot_locked` to the client.

#### Decision 6 — `dom-efficient date selection` in Calendar
**Why:** Re-building all 35–42 calendar cells on every date click caused visible jank (flash of unstyled content) on low-end Android devices. The `_calMonthKey` cache check means date selection only patches the two relevant DOM nodes (deselect old, select new), reducing DOM operations from ~35 to ~2.

#### Decision 7 — Supabase V2 Layer
**Why:** Google Sheets lacks relational query capability. A query like "show me all bookings for client +972541234567 sorted by date" requires reading the entire `Bookings_Log` sheet, loading it into memory, and filtering in GAS JavaScript. Supabase PostgreSQL handles this with a simple `SELECT ... WHERE phone = ...` query. The V1/V2 coexistence (controlled by `IS_SUPABASE_ENABLED`) allowed zero-downtime migration.

#### Decision 8 — `admin-render.js` Extracted Module
**Why:** Originally, all HTML generation lived inside `admin.js`. This made the render functions impossible to unit-test (they depended on DOM state). After the `SyntaxError: Unexpected string` production incident, the render functions were extracted into `admin-render.js` — pure functions with no side effects that can be unit-tested with Vitest without a browser environment.

### 11.2 Significant Pivots

| Date | Pivot | Reason |
|---|---|---|
| 2026-05-18 | Removed QA Mock Phone bypass (`0500000000`) | Production hardening. A real client with that number would bypass OTP. Replaced by service-layer `IS_TEST_MODE` mocking. Documented in Section 9 of CLAUDE.md. |
| 2026-05-18 | Removed first `handleRunFlowTest()` definition | Dead code audit. The first definition (line ~1840) was immediately shadowed by the second definition (~2069). Unreachable code removed. |
| 2026-05-18 | Added `ADMIN_TOKEN` separate from `HMAC_SECRET` | Audit finding. See Decision 3 above. |
| 2026-05-20 | `IS_TEST_MODE = false` | Phase 6 production cutover. Twilio upgrade still pending. |
| 2026-05-20 | `IS_SUPABASE_ENABLED = true` | Supabase V2 data layer live in production. |

### 11.3 Version History

| Version | Date | Key Deliverable |
|---|---|---|
| v0.1.0 | 2026-05-15 | 5-step booking wizard frontend |
| v0.2.0 | 2026-05-15 | RTL design polish; 2 services; Heebo font |
| v0.3.0 | 2026-05-15 | GAS backend: OTP, booking, admin SMS, Calendar |
| v0.4.0 | 2026-05-16 | Legal modal, accessibility, focus trap |
| v0.5.0 | 2026-05-16 | XSS protection, OTP rate limit, API error hardening |
| v0.6.0 | 2026-05-16 | Zero-delay calendar, DOM-efficient date selection |
| v0.7.0 | 2026-05-16 | Meital profile image in header |
| v1.0.0 | 2026-05-18 | Admin dashboard V2 (5 tabs), Execution_Log, SMS quota |
| v1.1.0 | 2026-05-18 | 24h SMS reminders (daily 08:00 trigger) |
| v1.2.0 | 2026-05-18 | 9-check system health monitor |
| v1.3.0 | 2026-05-18 | Vitest + Playwright test suites; Zero-Console-Error Gate |
| v2.0.0 | 2026-05-20 | Supabase V2 live; IS_TEST_MODE=false; production |

---

## 12. Appendices

### Appendix A — File Structure

```
meital-booking-system/
├── frontend/
│   ├── index.html                   Public booking wizard (HTML structure + Tailwind CDN)
│   ├── booking.js                   Booking wizard: State, API layer, all render functions
│   ├── config.js                    API URL, version, IS_MOCK_MODE flag
│   ├── admin.html                   Admin dashboard (window.onerror guard in <head>)
│   ├── admin.js                     Admin: State S, login, all API calls, tab logic
│   ├── admin-render.js              Pure HTML render functions (no side effects)
│   ├── meital_profile_header.webp   Profile image — primary (128×128px, ~4 KB, 2× retina)
│   └── meital_profile_header.png    Profile image — fallback (128×128px, ~24 KB)
├── backend/
│   └── gas-backend.js               GAS source of truth. ALL edits go here.
├── Code.js                          Generated copy for clasp. Do not edit directly.
├── tests/
│   ├── unit/
│   │   ├── utils.test.js            Vitest: booking utility functions
│   │   └── admin-render.test.js     Vitest: admin render pure functions
│   ├── e2e/
│   │   ├── booking.spec.js          Playwright: 5-step wizard + error paths
│   │   ├── legal.spec.js            Playwright: legal modal
│   │   ├── admin-dashboard.spec.js  Playwright: admin load + Zero-Console-Error Gate
│   │   ├── admin-render.spec.js     Playwright: render in browser
│   │   └── qa_guardrails.spec.js    Playwright: QA-specific guardrails
│   └── backend_unit_tests.js        GAS: runInternalTests(), runBackendTests()
├── scripts/
│   └── ai_tools.py                  Python file-patch utility (path encoding workaround)
├── CLAUDE.md                        AI agent instructions (project spec + changelog)
├── SYSTEM_MASTER_DOC.md             This document
└── MEMORY.md                        AI agent persistent memory index
```

### Appendix B — Script Properties Reference

Set all of these in GAS → Project Settings → Script Properties before first deployment.

| Property Key | Required | Format | Example |
|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | ✅ | `AC...` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | ✅ | 32 chars | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_FROM_NUMBER` | ✅ | E.164 | `+972xxxxxxxxx` |
| `ADMIN_PHONE` | ✅ | E.164 | `+972xxxxxxxxx` (Meital's number) |
| `HMAC_SECRET` | ✅ | 32+ random chars | `a8f2...` (generate with openssl rand -hex 32) |
| `ADMIN_TOKEN` | ✅ | 32+ hex chars | `b7c3...` (distinct from HMAC_SECRET) |
| `SPREADSHEET_ID` | ✅ | Google Sheets ID | `1T9B1_4WUYS7Iq1UXyEfnG3LyI0_XapxPH1Q2X-6vVbQ` |
| `CALENDAR_ID` | ✅ | `primary` or email | `primary` or `me@gmail.com` |
| `WEB_APP_URL` | ✅ | GAS Web App URL | `https://script.google.com/macros/s/.../exec` |
| `TIMEZONE` | ✅ | IANA zone | `Asia/Jerusalem` |
| `DAILY_SMS_LIMIT` | Optional | Integer string | `45` (default) |
| `AUTO_SMS_ENABLED` | Auto-set | `true`/`false` | Managed by `setAutoSms` action |
| `REMINDER_LAST_RUN` | Auto-set | `YYYY-MM-DD` | Managed by `sendDailyReminders` |

**Debug helper for token issues:** Run `debugAdminToken()` from GAS editor to check `ADMIN_TOKEN` length, trim state, and first/last character codes. Whitespace in the property value is the most common cause of auth failures.

### Appendix C — Hebrew Micro-Copy Reference

All Hebrew strings used in the UI — for consistency when adding new copy.

| Location | Element | Hebrew Text |
|---|---|---|
| Step 1 | Service name | לק ג'ל קלאסי / לק ג'ל + רגליים |
| Step 2 | Calendar nav | Previous/next month (Unicode arrows) |
| Step 2 | No slots | אין תורים פנויים לחודש זה, נסי חודש אחר |
| Step 3 | Phone placeholder | (empty — no placeholder) |
| Step 3 | Name validation | (inline via disabled button) |
| Step 3 | Returning banner | שלום {name}! הפרטים שלך נשמרו. |
| Step 3 | "Not me" | לא אני |
| Step 4 | OTP sent | קוד אימות נשלח למספר {phone} |
| Step 4 | Wrong OTP | הקוד שגוי. בדקי ונסי שוב. |
| Step 4 | Resend | שלחי שוב |
| Step 5 | Confirmation title | ההזמנה בוטלה ✅ (actually: shows success) |
| Step 5 | Sub-message | ממתין לאישור מיטל |
| Toast — rate limit | | ניתן לשלוח קוד שוב בעוד {n} שניות. |
| Toast — slot gone | | התור שבחרת כבר לא זמין. בחרי תאריך ושעה חדשים. |
| Toast — network | | שגיאת חיבור. בדקי את החיבור לאינטרנט ונסי שוב. |
| Admin SMS — OTP | | קוד האימות שלך להזמנת תור: {otp}\nתקף ל-5 דקות. |
| Admin SMS — new booking | | 📅 הזמנה חדשה ממתינה לאישור:\nשם: {name}\n... |
| Admin SMS — approve | | ✅ ההזמנה שלך אושרה!\nשירות: {name}\nתאריך: {date} |
| Admin SMS — reject | | ❌ לצערנו, הבקשה לתור ב-{date} שעה {time} לא אושרה. |
| Admin SMS — reminder | | תזכורת: מחר יש לך תור! שירות: {name}. תאריך: {date}. |

### Appendix D — Development Environment Constraints

| Tool | Available | Notes |
|---|---|---|
| Python 3.12 (Bash tool) | ✅ | `/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe` |
| Python 3.12 (PowerShell) | ✅ | Available as `python` in PATH |
| Node / NPM / npx | ❌ | **Not in PATH — do not attempt** |
| Vitest (local) | ❌ | No `node_modules` — CI only |
| Playwright (local) | ❌ | CI only |
| `gh` CLI | ❌ | Not installed |
| Git (Bash tool) | ✅ | Use Bash tool for all git commands |
| Git (PowerShell) | ❌ | Fails due to U+200F RTL marks in directory path |

**File editing:** The project directory contains U+200F (RIGHT-TO-LEFT MARK) characters in its path, which cause path resolution issues with the built-in `Edit` tool. Use `scripts/ai_tools.py` via the Bash tool for all file edits:

```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON scripts/ai_tools.py patch frontend/booking.js \
  --old "old string" \
  --new "new string"
```

### Appendix E — Colour & Design Token Reference

| Token | Hex | Tailwind Class | Usage |
|---|---|---|---|
| Primary | `#A67C8E` | `primary` | Buttons, selected states, dots, stepper |
| Secondary | `#DDC3A5` | `secondary` | Borders, connector lines, light accents |
| Cream | `#FAF5F0` | `cream` | Page background, card backgrounds |
| Text Main | `#3D2B35` | `text-main` | Body text, headings |
| Text Muted | `#8C7B7B` | `text-muted` | Secondary text, placeholders, labels |
| Header gradient start | `#C4A0B0` | `[#C4A0B0]` | Active step circle gradient (from) |

**Typography:**
- Font family: Heebo (Google Fonts CDN), fallback sans-serif
- Hebrew-optimised; excellent readability at 12px on mobile screens
- `font-weight: 400` (normal) for most text; `font-weight: 600` (semibold) for labels and buttons; `font-weight: 700` (bold) for OTP boxes and stat numbers

---

*This document is the living source of truth. Update it immediately when architectural decisions change, new features are added, or any of the documented behaviors are modified. Append to Section 11.3 (Version History) and update Section 11.2 (Pivots) for significant changes.*
