# ✅ מצב מערכת — Phase 6 (עודכן 2026-05-29)

| פרמטר | ערך |
|---|---|
| `IS_TEST_MODE` (backend) | **`false`** — פרודקשן אמיתי |
| `IS_MOCK_MODE` (frontend) | **`false`** |
| `IS_SUPABASE_ENABLED` | **`true`** |
| Twilio | ⏳ ממתין לשדרוג ידני לחשבון Paid |

### ⏳ נותר לביצוע ידני (Phase 6 סיום)
1. **Twilio** — שדרג לחשבון Paid, אמת ששליחה ל-+972 עובדת.
2. **clasp deploy** — דחוף גרסה חדשה ל-GAS אחרי כל שינוי backend (push ≠ deploy; הרץ `clasp deploy -i AKfycbw...`).
3. **בדיקת קצה-לקצה חיה** — הזמנה אמיתית עם מספר טלפון ישראלי.

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
- **מיתוג:** RTL, גופן Heebo, פלטת Dust-Rose (#A67C8E, #DDC3A5, #FAF5F0). "מיטל שבע ברעם — לק ג'ל בוטק". 2 שירותים בלבד: gel_classic (90 דק') ו-gel_feet (120 דק').

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
ניווט תחתון 3 טאבים: **הזמנות** (ניהול + daily planner), **דופק עסקי** (4 KPI tiles, התפלגות שירותים, 8 הזמנות קרובות, כרטיס בדיקת תקינות), **ניהול זמנים** (Weekly Template editor, Generate Slots לטווח תאריכים, Vacation Override/blockDates, כרטיס תזכורות יומיות).
Actions אדמין (כולן דורשות ADMIN_TOKEN): getTemplate, saveTemplate, generateSlots, blockDates, sendReminders, getSystemInfo, healthCheck, createBackup.

## 10. Quota Baseline
Twilio trial = 50 SMS/יום. מחזור הזמנה מלא = 3 SMS + תזכורת = 4 → **~12 הזמנות/יום**. חובה לשדרג ל-Twilio Paid לפני פרודקשן. GAS: UrlFetch 20k/יום, ריצה 6 דק', 20 triggers.

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
| gh CLI | ❌ | לא מותקן |

## 12. File Patch Protocol — חובה
ה-Edit/Write המובנים **mis-resolve** את נתיב ה-U+200F לתיקייה שגויה ("File has not been read yet"). ערוך קבצי JS/HTML **רק** דרך כלי ה-patch של Python, עם נתיבים שנפתרו ע"י git/find:
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch frontend/booking.js --old "old string" --new "new string"
```
או inline דרך `patch_file(path, old, new)` / `verify_contains(path, snippet)` מ-`skills/utils/ai_tools.py`.
- **לעולם לא** PowerShell לכתיבת קבצים (EPERM אקראי).
- **לעולם לא** `sed -i` ל-patch רב-שורתי של JS (backticks/template literals נשברים).

## 13. GAS Date Reading Rule — חובה
**לעולם לא** `getValues()` לעמודות זמן/תאריך (גורם ל-1899 epoch bug). **תמיד** `getDisplayValues()` + regex `/\d{2}:\d{2}/`. (ה-1899 bug תוקן 2026-05-21 כך.)

## 14. Backend Build Model
`backend/gas-backend.js` = המקור המנוהל. `Code.js` = עותק נוצר ש-clasp דוחף. **חדש את Code.js לפני כל clasp push**, ואחרי כל שינוי backend הרץ `clasp deploy -i AKfycbw...` (push ≠ deploy).

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

## v1.5.0 פרטים (העבודה הנוכחית)
- `calDayStatus(entry)` מעשיר: tone (pending→approved→free→none), pendingCount, approvedCount, freeSlotCount (active בלבד — Rejected/Cancelled לא נספרים).
- `renderCalendar` מחיל tint לכל התא (has-pending/has-approved/has-free), count pill (.cal-count), ו-rose free marker (.cal-free-dot). ה-.cal-dot הישן 4px הוסר.
- עדיפות tint: pending (amber + ring/pulse — actionable) → approved (green) → free (rose). tints מדלגים על תא today.
- legend תמיד-נראה מעל הגריד.
- **באג שתוקן:** rose "זמן פנוי" לא הופיע כי buildCalData השווה ל-'Available' בעוד Supabase מחזיר 'available' — עכשיו case-insensitive.
- **התנהגות popup:** addSlot ו-_commitSheetAction עכשיו closeSheet() וחושפים את הלוח עם העדכון האופטימי (לא re-open). Undo מחזיר את הלוח in-place.

## v1.6.0 פרטים — SMS / Notification fixes
- **שורש הבאג:** הזמנות חיות נכתבות ל-Supabase (`appointments`), אך side-effect ה-SMS ב-GAS קרא את ה-Sheet הריק → `booking_not_found` → SMS לא נשלח (השגיאה נבלעה ב-`.catch`).
- `supabase/functions/_shared/`: `messages.ts` (pure — `hebrewDayLabel`, `buildClientStatusSms`, `buildAdminNewBookingSms`; נבדק ב-Vitest), `crypto.ts` (HMAC + timing-safe verify), `sms.ts` (Twilio).
- `change-status`: אחרי RPC מוצלח שולף מ-`bookings_view` ושולח SMS ללקוח (approved/rejected/cancelled). SMS לא-פטאלי.
- `admin-action` (**חדש**, `verify_jwt=false`): לינק GET חתום-HMAC מה-SMS לאדמין → מאשר/דוחה → SMS ללקוח → דף HTML עברי. מאובטח ע"י טוקן ה-HMAC לכל הזמנה (אותו סוד כמו verify-and-book).
- `verify-and-book`: ה-SMS לאדמין כולל שם-יום עברי, ולינק `${SUPABASE_URL}/functions/v1/admin-action` קליקבילי (לא עוד `undefined` מ-GAS_URL חסר). **GAS_URL הוסר.**
- Frontend: מסך ה-pending — הוסר "הזמני תור נוסף", במקומו כפתור WhatsApp בולט (`#js-whatsapp`, `wa.me/972547686865`).

## v1.4.0 פרטים — Calendar Day Actions
- `frontend/admin-sheet.js`: `_bookingActions(b)` מציג כפתורים inline לפי סטטוס; event delegation על js-sheet-content (listener אחד ב-initSheet); `isSheetOpen()` exported.
- `frontend/admin.js`: `_commitSheetAction(id, target)` — עדכון אופטימי + toastUndo (5s), אז Supabase change-status → GAS side-effects fire-and-forget → load(true) מרענן.
- כפתורים לפי סטטוס: Pending=אשר+דחה, Approved=בטל, Rejected/Cancelled=ללא.

---

# 21. Next Steps — Admin Calendar Enhancement (resume point)
Branch: `feature/calendar-clarity` (off main).
1. **Inline slot creation מיום ריק** — footer עם mini time-picker (`<select>` חצי-שעה + כפתור), `_handleAddSlot(dateStr, time)` שקורא sbCall action addSlot; הסר את case addSlot מ-sheet:action ב-admin.js.
2. **חיווט peek-strip "הוסף שעה"** (#js-cal-peek-add) — ב-onCalDayClick חשוף + set data-date; click מפעיל את אותו flow.
3. **Optimistic dot update** — ב-_commitSheetAction קרא מיד `S.calData = buildCalData(S.bookings)` + `renderVisibleCalendar()` אחרי שורת ה-status האופטימי.
4. **E2E** ב-`tests/e2e/admin-calendar-actions.spec.js` — כפתורים לפי סטטוס, fire של sheet:action, re-open עם badge מעודכן, terminal=ללא כפתורים.
