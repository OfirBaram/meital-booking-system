# ✅ מצב מערכת — פרודקשן חי (עודכן 2026-06-15)

## 🌐 Domain / URL
- **Landing page (GitHub Pages):** `https://ofirbaram.github.io/meital-booking-system/`
- `canonical`, `og:url`, Schema.org `url` כבר מעודכנים לכתובת זו ב-`landing.html`.
- כשיהיה דומיין אמיתי — עדכן את 3 השדות הללו + `SiteConfig.identity.apiBase` (לתצוגת הזמן הפנוי הקרוב בהירו).



| פרמטר | ערך |
|---|---|
| `IS_TEST_MODE` (backend) | **`false`** — פרודקשן אמיתי |
| `IS_MOCK_MODE` (frontend) | **`false`** |
| `IS_SUPABASE_ENABLED` | **`true`** |
| Twilio | ✅ Paid (pay-as-you-go, אומת 2026-05-30) — אין צורך בשדרוג |

### ✅ Phase 6 הושלם (2026-06-04)
- GAS deployed @80 — auto-block + past-slot filter בתוקף. `Main.js` מסונכרן עם `gas-backend.js`.
- כל 19 Supabase Edge Functions פרוסות ומסונכרנות (`bash scripts/deploy-functions.sh`).
- בדיקת קצה-לקצה חיה עברה — OTP → אישור → SMS ללקוח ✓

### ✅ Phase 7 הושלם — Smart Scheduling + Admin Auth (2026-06-15) — PR #80
- **Smart Scheduling** (feature flag `smart_scheduling`, ברירת מחדל OFF):
  - SQL: `get_viable_slots()`, `explain_viable_slots()`, `check_gap_safety()` — מסנן חריצים שיוצרים פערים לא שמישים (< 90 דק').
  - `get-slots` Edge Function: נתיב חכם קורא ל-RPC ומלוגג כל חריץ שסונן.
  - `verify-and-book`: מפעיל `check_gap_safety()` לפני נעילת החריץ.
  - הדלקה: Admin Console → Pulse → הגדרות מערכת → toggle. ללא redeployment.
- **Admin Auth Hardening**:
  - Session tokens: `<expiryHex>.<HMAC-SHA256>`, TTL 24 שעות.
  - Dual-mode auth: Cookie HttpOnly (פרודקשן) + header `x-admin-session` (dev מקומי).
  - `admin-flags` Edge Function חדשה: `getFlags` / `setFlag` + audit log.
  - `load()` ו-`sbCall()` ב-admin.js שולחים את ה-header; logout מנקה sessionStorage.

> מיגרציית Supabase: Phases 1-4 הושלמו (2026-05-23). ה-DB החי הוא Supabase. **SMS ללקוח/אדמין נשלח כעת מ-Supabase Edge Functions** (`change-status`, `admin-action`, `verify-and-book`) — לא מ-GAS (ה-GAS side-effect קרא את ה-Sheet הריק ולכן ה-SMS לא נשלח). GAS נשאר ל-Calendar בלבד. פריסה: `bash scripts/deploy-functions.sh`.

---

# 💅 Meital Boutique Booking — Spec & Context

## 1. Vision
מערכת הזמנות פרימיום, קלה ומאובטחת לסטודיו ציפורניים בוטיק. מטרה: תחזוקת backend בעלות אפס, UX יוקרתי, ושליטת אדמין מלאה.

## 2. Tech Stack ("Lean")
- **Frontend:** Vanilla JS, Tailwind CSS, LocalStorage.
- **Backend:** Supabase (DB חי + Edge Functions) + Google Apps Script (תופעות-לוואי: SMS/Calendar).
- **Calendar:** Google Calendar API (מסונכרן למכשיר Galaxy של מיטל).
- **Timezone:** ISO 8601 קפדני (Asia/Jerusalem) למניעת DST drift.
- **SMS:** Twilio API (אימות OTP + לינקים לאדמין).
- **מיתוג:** RTL, גופן Heebo, פלטת Dust-Rose (#A67C8E, #DDC3A5, #FAF5F0). "מיטל שבע ברעם — לק ג'ל בוטק". 3 שירותים: gel_hands (60 דק'), regular_feet (30 דק'), gel_combo (90 דק').

## 3. Core Logic & Safety
- **Race Condition Guard:** `LockService.getScriptLock()` + בדיקה כפולה של סטטוס החריץ לפני כתיבה.
- **Security:** UUID v4 לכל ה-IDs (לא סדרתי). טוקני אדמין חתומים ב-HMAC-SHA256, השוואה timing-safe (XOR loop). כל הסודות ב-`PropertiesService.getScriptProperties()` — לעולם לא בקוד.
- **OTP:** `CacheService` עם TTL של 5 דק', single-use. Rate limit: cooldown 30 שניות (frontend `State.otpCooldownUntil`).
- **Admin Approval:** אישור דו-שלבי (SMS link → דף `doGet` עם Approve/Reject).
- **XSS:** `sanitize()` ב-booking.js בורח מ-`< > & " '` לפני כל innerHTML.
- **API hardening:** כל קריאות ה-API בודקות `r.ok`, עטופות ב-try/catch, ומציגות רק toast עברי ידידותי (אף פעם לא stack trace).

## 4. Database Schema (Google Sheets / Supabase mirror)

### `Weekly_Slots` — A:Date(YYYY-MM-DD), B:Day(שם יום עברי), C:Start_Time(HH:MM), D:End_Time(HH:MM), E:Status
- Status: Available/Pending_Lock/Blocked/Booked. **שים לב:** ב-Supabase הסטטוס **lowercase** (available) — השווה case-insensitive.
- Pending_Lock = מצב מעבר אטומי בזמן הזמנה. Blocked נכתב ע"י `syncCalendarToSlots()` כשאירוע יומן חופף.

### `Bookings_Log` — A:UUID, B:Name, C:Phone(E.164), D:Service, E:ServiceName, F:Date, G:Time, H:Timestamp_ISO, I:Duration_Min, J:Status(Pending/Approved/Rejected/Cancelled — **Capitalized**), K:CalendarEventId, L:AdminToken(HMAC hex)

### טאבים נוספים (נוצרים אוטומטית)
- `SMS_LOG` — Timestamp/To/Context/Status/Message/Detail.
- `Audit_Log` — Timestamp/Admin/Action/BookingId/PrevStatus/NewStatus/Detail.
- `Execution_Log` — לוג עברי קריא ל-`log()`; עמודה G (פרט טכני) מוסתרת כברירת מחדל.
- `Slot_Template` — תבנית שבועית: DayOfWeek/DayName/StartTimes[]/Active.

> **סטטוס casing (חשוב):** SLOT = lowercase (available); BOOKING = Capitalized (Pending). ערבוב שובר את ה-UI בשקט. ב-mocks של slot E2E השתמש ב-lowercase.

### Supabase Live DB Tables (הטבלאות האמיתיות בפרודקשן)
| טבלה | תיאור |
|---|---|
| `slots` | `id BIGSERIAL, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, status TEXT, last_updated TIMESTAMPTZ`. `end_time` = חלון מלא (טיפול + buffer 30 דק'). |
| `appointments` | `id UUID, client_id UUID, slot_id BIGINT, treatment_type, treatment_name, duration_min INT, status TEXT, admin_token, calendar_event_id`. |
| `clients` | פרטי לקוח (phone כ-PK פונקציונלי). |
| `feature_flags` | `key TEXT PK, enabled BOOLEAN, description TEXT, updated_at TIMESTAMPTZ`. RLS: service_role בלבד. |
| `audit_log` | Append-only — `action, booking_id, slot_id, prev_val, new_val, ip, user_agent, meta`. |
| `communication_logs` | לוג SMS/WhatsApp. |
| `otp_requests` | OTP tracking. |

> **effective_end — כלל קריטי:** `slots.end_time` = הזמן המלא הנחסם (טיפול + 30 דק' buffer). **לעולם אל תשתמש ב-`appointments.duration_min` לחישוב left_wall/right_wall** — זה רק אורך הטיפול, blind spot של 30 דק'.

## 5. Dev Guidelines
Mobile-First, JS מודולרי, feature-branch workflow (אין commit ישיר ל-main), תיעוד מתמשך בקובץ זה.

## 6. Script Properties (GAS)
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ADMIN_PHONE`, `HMAC_SECRET`, `SPREADSHEET_ID`, `CALENDAR_ID`, `WEB_APP_URL`, `TIMEZONE`(=Asia/Jerusalem), `ADMIN_TOKEN` (אימות דשבורד אדמין — נפרד מ-HMAC_SECRET), `DAILY_SMS_LIMIT` (אופ', ברירת מחדל 45).

## 7. Deployment Checklist (תמצית)
1. **Sheets** — צור גיליון, טאבים Weekly_Slots+Bookings_Log עם כותרות, מלא חריצים, העתק SPREADSHEET_ID.
2. **GAS** — הדבק `backend/gas-backend.js`, הגדר את כל ה-Script Properties, Deploy כ-Web App (Execute as: Me, Access: Anyone), העתק URL ל-WEB_APP_URL, הרץ `installTriggers()` פעם אחת (מתקין syncCalendarToSlots ב-01:00 ו-sendDailyReminders ב-08:00).
3. **Frontend** — הגדר `CONFIG.API_BASE`, פרוס תיקיית frontend/.
4. **Twilio** — חשבון, מספר/sender ID, סודות.
5. **E2E חי** — הזמנה מלאה: OTP → admin SMS → Approve → client SMS → Calendar event → Approved ב-log.

## 8. Triggers & Time Functions (GAS)
- `syncCalendarToSlots()` — יומי 01:00; חלון מתגלגל 30 יום; מסמן Blocked/משחזר Available.
- `sendDailyReminders()` — יומי 08:00; תזכורת SMS ללקוחות עם הזמנה מאושרת למחר. אידמפוטנטי דרך `REMINDER_LAST_RUN`. quota guard עוצר נקי בלי לכתוב את המפתח (כדי לאפשר retry).
- `handleSendReminders({force:true})` — מוחק REMINDER_LAST_RUN ושולח שוב.
- `handleHealthCheck()` — 9 בדיקות לא-הרסניות (properties/sheets/calendar/testMode/smsQuota/recentErrors/triggers/reminderLastRun/pendingBookings) → {overall: ok|warn|error}.
- `createBackupSnapshot()` — טאב _Backup_YYYYMMDD_HHmm עם עותק של Weekly_Slots+Bookings_Log (action createBackup).

## 9. Admin Dashboard (admin.html/admin.js)
ניווט תחתון — **הזמנות**, **לוח שנה**, **דופק עסקי**, **יומן**, **לקוחות**.

**טאב דופק עסקי**: 4 KPI tiles, התפלגות שירותים, 8 הזמנות קרובות, כרטיס בדיקת תקינות, **כרטיס הגדרות מערכת (feature flags)**:
- `loadFlags()` → `admin-flags` Edge Function (action: `getFlags`).
- `toggleFlag(key, enabled)` → `admin-flags` (action: `setFlag`) — מעדכן DB + audit log.
- אלמנטים: `#js-flags-list`, `#js-flags-refresh`.

**Admin Auth (admin.js)**:
- Login → `admin-sign-in` → `{ success, sessionToken }` + HttpOnly cookie.
- `sessionStorage.setItem('admin_session_tkn', token)` — fallback לסביבות שחוסמות cookies.
- `sbCall(funcName, body)` — שולח `x-admin-session` header בכל קריאת Supabase.
- `load()` (auto-refresh 60 שניות) — גם שולח `x-admin-session`; logout מנקה `admin_session_tkn`.

Actions Supabase Edge Functions (דורשות session): list-bookings, change-status, admin-action, admin-slots, admin-clients, admin-flags, send-reminders, sms-log, twilio-stats.
Actions GAS (דורשות ADMIN_TOKEN): getTemplate, saveTemplate, generateSlots, blockDates, getSystemInfo, healthCheck, createBackup.

## 10. Quota Baseline
Twilio **Paid (pay-as-you-go)** — אין תקרת trial. מחזור הזמנה מלא = 3 SMS + תזכורת = 4. GAS: UrlFetch 20k/יום, ריצה 6 דק', 20 triggers.

---

# ⚙️ AI Agent Protocol — הוראות תפעול קריטיות

## 11. Environment & Paths
שם תיקיית הפרויקט מכיל שני תווי U+200F (RIGHT-TO-LEFT MARK) לפני OfirBaram — זה גורם ל-path resolution להתנהג שונה בין כלים.

| כלי | זמין | הערות |
|---|---|---|
| Git (Bash) | ✅ | הרץ git **רק** דרך Bash tool; ה-CWD הוא git root. אם לא בטוח: `git -C "$(git rev-parse --show-toplevel)" ...` |
| Git (PowerShell) | ❌ | נכשל "not a git repository" בגלל .git בנתיב |
| Python 3.12 (Bash) | ✅ | `/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe` — הכלי המרכזי לעריכת קבצים |
| Python 3.12 (PowerShell) | ✅ | `python` ב-PATH |
| Node/npm/npx/Playwright/Vitest | ✅ | **רצים מקומית** (CLAUDE.md הישן טען שלא — זה לא נכון). שחזר כשלי CI מקומית במקום לנחש |
| gh CLI | ✅ | מותקן ומאומת (v2.93.0, חשבון OfirBaram, scope `repo`). שמש ליצירת PR-ים. |

## 12. File Patch Protocol — חובה
ה-Edit/Write המובנים **mis-resolve** את נתיב ה-U+200F לתיקייה שגויה ("File has not been read yet"). ערוך קבצי JS/HTML **רק** דרך כלי ה-patch של Python, עם נתיבים שנפתרו ע"י git/find:
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch frontend/booking.js --old "old string" --new "new string"
```
או inline דרך `patch_file(path, old, new)` / `verify_contains(path, snippet)` מ-`skills/utils/ai_tools.py`.
- **לעולם לא** PowerShell לכתיבת קבצים (EPERM אקראי).
- **לעולם לא** `sed -i` ל-patch רב-שורתי של JS (backticks/template literals נשברים).

### Supabase Deno `.catch()` Hazard — חובה
`PostgrestBuilder` (תוצר של `supabase.from(...).insert(...)`) הוא thenable אבל **לא** Promise מלא בDeno — אין `.catch()`. קריאה ל-`.catch()` זורקת `TypeError: ... is not a function` → HTTP 500.
```typescript
// BAD — זורק 500 בDeno:
supabase.from('audit_log').insert({...}).catch(e => console.error(e))

// GOOD — async IIFE fire-and-forget:
;(async () => {
  try { await supabase.from('audit_log').insert({...}) }
  catch (e) { console.error('[fn] insert failed', e) }
})()
```

## 13. GAS Date Reading Rule — חובה
**לעולם לא** `getValues()` לעמודות זמן/תאריך (גורם ל-1899 epoch bug). **תמיד** `getDisplayValues()` + regex `/\d{2}:\d{2}/`. (ה-1899 bug תוקן 2026-05-21 כך.)

## 14. Backend Build Model
`backend/gas-backend.js` = המקור המנוהל. `backend/Main.js` = העותק ש-clasp דוחף (`.claspignore` מוציא את `gas-backend.js`). **סנכרן `Main.js` ← `gas-backend.js` לפני כל `clasp push`**, ואז הרץ `clasp deploy` ליצירת גרסה ממוספרת. push ≠ deploy.

## 15. Zero-Error Workflow Protocol — חובה לכל משימה
sync → branch → plan → validate → state-update.

---

# 🛡️ Frontend Deployment Gate — כללי חובה
> נוצר כי SyntaxError ב-admin.js גרם למסך לבן מלא בפרודקשן בעוד כל בדיקות ה-GAS עברו ירוק. בדיקות backend לא מפעילות את ה-parser של הדפדפן.

### כלל: Zero-Console-Error Gate
אין commit/push/merge של frontend בלי שהבדיקה עוברת מקומית:
```bash
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```
חייב להיות ירוק — במיוחד: טעינה ללא JS console errors, פאנל login נראה מיד (לא מסך לבן), מעבר בין טאבים לא זורק exception.

### כלל: No Adjacent String Literals ב-onclick
בבניית HTML עם onclick inline, **אף פעם** אל תשים שני string literals צמודים בלי `+`. השתמש ב-`\'` לבריחת מרכאה בודדת. דוגמה תקינה: `'onclick="fn(' + id + ',\'' + val + '\')"'`.

### כלל: window.onerror ב-admin.html
admin.html חייב להכיל handler של `window.onerror` כ-`<script>` הראשון ב-`<head>`, שמציג באנר שגיאה עברי ממותג (#js-crash-banner) במקום מסך לבן. אל תסיר/תעביר אותו.

### כלל: dispatchEvent ב-Swipe Card Tests
כפתורים בתוך `.swipe-card` חייבים להשתמש ב-`dispatchEvent('click')`, לא `.click()` — setPointerCapture חוטף clicks סינתטיים.

---

# 16. QA Mock Phone Bypass — הוסר (Phase 3.5, 2026-05-18)
תשתית ה-mock phone (QA_MOCK_PHONE/QA_MOCK_OTP, simulateAdminSMS(), CONFIG.MOCK_PHONE/MOCK_OTP) **נמחקה לחלוטין** כצעד הקשחה. **אל תוסיף מחדש.**
QA ללא bypass: השתמש ב-`IS_TEST_MODE = true` — CalService/SmsService ממוקים בשכבת השירות. `testFullBookingFlow()` משתמש ב-OTP inline 000001.

# 17. Skills Directory
| נתיב | מטרה |
|---|---|
| `skills/db/list_supabase_tables.py` | רשימת טבלאות (PostgREST + information_schema) |
| `skills/utils/ai_tools.py` | patch בטוח (patch_file, verify_contains) — לכל עריכת JS/HTML |
| `skills/setup/` | סקריפטי setup חד-פעמיים |
> `scripts/` = patch-ים היסטוריים חד-פעמיים (נפרד מ-skills/). ראה `PROJECT_NOTES.md` לסקירת ארכיטקטורה.

---

# 18. Application State (frontend/booking.js)
כל state האשף ב-אובייקט `State`. **אף פעם אל תקרא state מה-DOM** — קרא מ-State.
שדות: step(1-5), service, date, time, name, phone, bookingId, calMonth, slots(map YYYY-MM-DD→times[]), loading, prefetchedMonths(Set "YYYY-M"), otpCooldownUntil.
- `resetApp()` מאפס הכל **חוץ מ-**prefetchedMonths ו-slots (cache נשמר בין הזמנות); מאפס otpCooldownUntil=0.

## כללי Performance (מהירות נתפסת)
- **בדוק `State.prefetchedMonths` לפני הצגת loader.** במקרה hit קרא `renderCalendar()` ישירות (לא loadMonthSlots()) — לוח מופיע באותו tick.
- **כל מעברי UI ≤ 150ms** (stepFadeIn = .15s). scroll = 'instant'.
- **אל תקרא `renderCalendar()` לבחירת תאריך באותו חודש** — patch של .selected ב-DOM קיים דרך בדיקת _calMonthKey. רק ניווט חודש מפעיל rebuild מלא.
- `prefetchSlots()` נקרא fire-and-forget מ-init() ב-DOMContentLoaded.

# 19. Legal & Accessibility Modal (frontend/index.html + booking.js)
שכבת compliance ללא תלויות. `LEGAL_CONTENT = { privacy, accessibility }` (עברית, כולל לינק mailto). פוטר עם 2 כפתורים → openModal(). `setupModalListeners()` מ-init(): X/backdrop/Escape סוגרים, focus trap, focus מוחזר ל-opener (_modalTrigger, WCAG 2.4.3).
- מידות: max-w-[380px] / max-h-[70vh]; דסקטופ `sm:my-8` (**קריטי — אל תסיר**, שובר את בדיקת ה-backdrop click), מובייל bottom-sheet.

---

# 21. Smart Scheduling — לוגיקה ומבנה

### Feature Flag
- `feature_flags` table: `key='smart_scheduling'`, `enabled=false` (ברירת מחדל — בטוח).
- הדלקה/כיבוי: Admin Console → Pulse → הגדרות מערכת → toggle. אפקט מידי, ללא deploy.
- Migrations: `20260614000000_feature_flags.sql`, `20260614000001_get_viable_slots.sql`, `20260615000000_fix_viable_slots_and_explain.sql`.

### אלגוריתם (לכל חריץ זמין S, שירות משך D דק'):
```
left_wall      = slots.end_time של הטיפול התפוס הקודם (או תחילת היום)
treatment_end  = S.start_time + D
right_wall     = slots.start_time של הטיפול התפוס הבא (או סוף היום)

gap_before = S.start_time - left_wall
gap_after  = right_wall   - treatment_end

REJECT S if: 0 < gap_before < 90 min
          OR 0 < gap_after  < 90 min
```
פער == 0 (בסמוך לחומה) → מותר. פער >= 90 → שירות נוסף יכול להיכנס → מותר.

### SQL Functions (supabase/migrations/)
| פונקציה | שימוש |
|---|---|
| `get_viable_slots(start, end, duration_min)` | `get-slots` smart path — מחזיר slot_starts תקינות |
| `check_gap_safety(slot_id, duration_min)` | `verify-and-book` guard לפני נעילת חריץ |
| `explain_viable_slots(start, end, duration_min)` | מחזיר כל חריץ עם `(viable, gap_before_min, gap_after_min)` ל-logging |

### Buffer Rule — קריטי
`effective_end` של חריץ תפוס = `slots.end_time` (כולל 30 דק' buffer). **לעולם לא** `appointments.duration_min` — blind spot של 30 דק'.

### Logging (כשהדגל פעיל)
```
[get-slots][smart] REMOVED 2026-07-05 11:30 gap_before=30m gap_after=90m service=gel_hands duration=60m
```

---

# 22. Admin Session Auth

### Token Format
`<expiryHex>.<hmacHex>` — `expiryHex=(Date.now()+86400000).toString(16)`, HMAC-SHA256 of `"admin_session:"+expiryHex`, TTL 24h.

### Dual-Mode Auth (`_shared/auth.ts → validateAdminSession`)
1. **Cookie** `admin_session`: `HttpOnly; Secure; SameSite=None; Max-Age=86400` — פרודקשן HTTPS.
2. **Header** `x-admin-session` — fallback; Chrome חוסם cookies Secure מ-`http://127.0.0.1`. אחד מהם מספיק.

### admin.js
- `sbCall(fn, body)` — תמיד שולח `x-admin-session` מ-`sessionStorage.getItem('admin_session_tkn')`.
- `load()` (60-second auto-refresh) — גם שולח; היה root cause של logout כל 60 שניות.
- `logout()` — מנקה `LS_TOKEN`, `LS_TS`, **ו-`admin_session_tkn`** מ-sessionStorage + קורא `admin-sign-out`.

### CORS (`_shared/cors.ts → adminCors`)
Echo-back origin (לא `*`) — נדרש עבור `credentials: 'include'`. `ADMIN_ORIGINS` Set: GitHub Pages, `localhost:5500`, `localhost:4173`, `127.0.0.1:5500`.

---

# 20. Changelog (תמצית — הפרטים המלאים ב-git history)

| גרסה | תאריך | תקציר |
|---|---|---|
| v0.1.0 | 05-15 | Frontend foundation — אשף 5 שלבים, uuid4(), toISO8601Jerusalem(), API stubs |
| v0.2.0 | 05-15 | Luxury polish — מיתוג, 2 שירותים, stepper, נטרול שישי+שבת |
| v0.3.0 | 05-15 | Backend GAS API — getSlots/sendOTP/verifyAndBook/adminAction, Twilio, Calendar sync |
| v0.4.0 | 05-16 | Legal & Accessibility modal + 26 בדיקות |
| v0.5.0 | 05-16 | Performance/Security — prefetch, skeleton, sanitize(), OTP rate limit, API hardening |
| v0.6.0 | 05-16 | Perceived performance — לוח zero-delay, date select יעיל-DOM, scroll instant |
| v0.7.0 | 05-16 | תמונת פרופיל בכותרת (webp+png fallback) |
| v1.0.0 | 05-18 | Phase 3.1 observability (Execution_Log, log(), withRetry, SMS quota) + Phase 2 Admin Dashboard v2 |
| v1.1.0 | 05-18 | Phase 3.2 — תזכורות SMS 24h |
| v1.2.0 | 05-18 | Phase 4 — System Health Monitor (9 בדיקות) |
| v1.3.0 | 05-18 | Phase 5 — QA framework (unit + E2E hardening) |
| v1.4.0 | 05-28 | Calendar Day Actions — אשר/דחה/בטל מתוך ה-day sheet |
| v1.5.0 | 05-29 | Calendar Clarity — tint לכל התא, count pill, free-slot marker, legend |
| v1.6.0 | 05-29 | SMS fixes — אישור/דחייה שולחים SMS ללקוח מ-Supabase; admin-action (one-tap); WhatsApp CTA |
| v1.7.0 | 06-04 | Design system — Motion One spring animations, gradient shimmer skeletons, CSS tokens, buildCard decomposition |
| v1.8.0 | 06-04 | Customer calendar — slot-count badges, duration hints on time chips, swipe navigation, next-available shortcut |
| v1.9.0 | 06-04 | Admin calendar — month summary bar, next-pending jump button, swipe navigation, shimmer skeleton |
| v2.0.0 | 06-04 | Confirmation screen polish (personalized heading, short ref, WhatsApp pre-fill); GAS sync + full live deploy |
| v2.1.0 | 06-15 | Smart Scheduling (feature flag, gap-safe SQL, per-slot logging); admin-flags Edge Function; dual-mode session auth; הגדרות מערכת card; Deno .catch() fix |
| v2.2.0 | 06-16 | Service catalog update: gel_hands (60m), regular_feet (30m), gel_combo (90m) — replaces gel_classic/gel_feet; skill update-services added; 18 touch-points updated |

