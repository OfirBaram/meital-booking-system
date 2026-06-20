# pre-merge-whatsapp — סריקה מקיפה לפני מיזוג

> הרץ סריקה זו לפני כל מיזוג של branch שנוגע בבוט הווטסאפ.
> מכסה: אבטחה, TypeScript hazards, DB, UX, שפה עברית, מיגרציות, deploy.

## קבצים לקריאה (במקביל)

```
supabase/functions/chat-handler/index.ts
supabase/functions/_shared/bot-config.ts
supabase/functions/_shared/bot-core.ts
supabase/functions/_shared/faq-engine.ts
supabase/functions/_shared/whatsapp.ts
supabase/functions/_shared/circuit-breaker.ts
supabase/functions/_shared/twilio-webhook.ts
supabase/functions/_shared/notify.ts
supabase/functions/_shared/sms.ts
supabase/functions/_shared/messages.ts
supabase/functions/wa-terms-reminder/index.ts
supabase/functions/send-reminders/index.ts
supabase/functions/_tests/whatsapp.test.ts
.github/workflows/chat-security.yml
supabase/migrations/  (last 5 files)
```

## שלב 1 — הרץ static-checks.py

```bash
python skills/audit/static-checks.py
```

כל `FAIL` חייב לתיקון לפני מיזוג. `WARN` לשיקול דעת.

## שלב 2 — Deno / TypeScript hazards

- [ ] אין `.catch()` על `PostgrestBuilder` (חייב `async IIFE`)
- [ ] אין `import(...)` דינמי — רק static imports
- [ ] אין literal control chars (`\r\n\t`) בתוך regex strings
- [ ] `CommContext` תואמת את DB constraint (כל context שנשלח ל-`sendAndLogSms` נמצא ב-`comm_logs_context_check`)
- [ ] `DEFAULT_SERVICES` כולל את כל 3 השירותים: `gel_hands`, `regular_feet`, `gel_combo`

## שלב 3 — אבטחה

- [ ] `verifyTwilioSignature` נקרא וה-result בדוק (`if (!ok) return 403`)
- [ ] `WA_SKIP_SIG_CHECK` נקרא **רק** מ-`Deno.env` (לא hardcoded)
- [ ] phone בלוגים עטוף ב-`maskPhone` / `scrubPhones` (אין מספר ישיר)
- [ ] `rawBody` לא מלוגג
- [ ] `TWILIO_AUTH_TOKEN` / `SERVICE_ROLE_KEY` לא בלוגים
- [ ] `join_waitlist` על WA משתמש ב-`ctx.phone` (לא ב-input.phone)
- [ ] `escalate_to_support` משתמש ב-`ctx.phone` / `ctx.clientId` (לא ב-model input)
- [ ] `book_appointment` משתמש ב-`ctx.phone` מ-Twilio HMAC (לא מה-model)
- [ ] SECURITY BOUNDARY נמצא ב-`bot-config.ts` ובראש הפרומפט

## שלב 4 — Resilience & UX flows

- [ ] `twiml()` תמיד מחזיר 200 (לא 500) גם בשגיאות
- [ ] circuit breaker: `recordFailure()` נקרא בשגיאות; `recordSuccess()` אחרי תגובה
- [ ] לולאת bot-core: כל `tool_use` בלוק מקבל `tool_result` (כולל `else` branch לkool לא מוכר)
- [ ] `persistConversation` נקרא ב-כל נתיב החזרה מ-WA (כולל terms gate + media shortcuts)
- [ ] `last_msg_sid` מתעדכן בכל נתיב — גם non-confirmation בterms gate
- [ ] deduplication: `conv.last_msg_sid === messageSid` → `twiml('')` (200, silent)

## שלב 5 — מיגרציות

- [ ] כל migration חדש בקוד נמצא גם ב-DB (`mcp__supabase__list_migrations`)
- [ ] אין `__PLACEHOLDER__` או secrets בתוך SQL
- [ ] `locked_at` column קיים ב-`slots` (migration 20260620000003)
- [ ] `wa_terms_pending` view קיים (migration 20260620000008)
- [ ] `terms_confirmed_at` קיים ב-`appointments` (migration 20260620000007)

## שלב 6 — שפה עברית (CLAUDE.md rules)

- [ ] אין "אנחנו / שלנו / נוכל / רצינו" בהודעות ללקוחות
- [ ] כל הודעה ללקוחה — לשון נקבה בלבד
- [ ] "מיטל" מדברת "אני / שלי" בלבד, גם בתוכן הבוט

## שלב 7 — בדיקות

- [ ] Vitest: `npx vitest run tests/unit/whatsapp-security.test.js` — 151 ירוק
- [ ] Deno: `deno test --allow-env supabase/functions/_tests/whatsapp.test.ts` — 30 ירוק
- [ ] CI workflow (`chat-security.yml`) מכסה את הקבצים שנגעת בהם

## שלב 8 — Deploy

- [ ] `bash scripts/deploy-functions.sh` — כל 29 פונקציות in sync
- [ ] Push עובר את ה-pre-push hook ללא "drift" errors

---

## פטרנים נפוצים לתיקון

### `.catch()` על PostgrestBuilder (Deno)
```typescript
// BAD
supabase.from('t').insert({...}).catch(e => console.error(e))

// GOOD
;(async () => {
  try { await supabase.from('t').insert({...}) }
  catch (e) { console.error(e) }
})()
```

### CommContext לא חוקי
```typescript
// BAD: 'TermsAlert' — לא ב-DB constraint
context: 'TermsAlert'

// GOOD: השתמש ב-'AdminNotify' לכל הודעה לאדמין
context: 'AdminNotify'
```

### DEFAULT_SERVICES חסר שירות
```typescript
export const DEFAULT_SERVICES: ServiceRow[] = [
  { id: 'gel_hands',    name_he: "לק ג'ל לציפורניים",           duration_min: 60, sort_order: 0 },
  { id: 'regular_feet', name_he: "לק רגיל לציפורניים ברגליים", duration_min: 30, sort_order: 1 },
  { id: 'gel_combo',    name_he: "לק ג'ל ידיים + לק רגליים",   duration_min: 90, sort_order: 2 },
]
```

### tool_result חסר (bot-core)
```typescript
const tool = TOOL_REGISTRY.get(toolBlock.name)
if (tool) {
  const result = await tool.execute(...)
  history.push({ role: 'user', content: [{ type: 'tool_result', ... }] })
} else {
  console.error('[bot-core] unknown tool: ' + toolBlock.name)
  history.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: JSON.stringify({ error: 'tool_not_found' }) }] })
}
```
