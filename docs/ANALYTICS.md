# מדידה — מה נאסף, איפה, ואיך שואלים

עודכן 2026-08-03.

## למה יש לנו מדידה משלנו

האתר מדווח ל-Mixpanel וגם ל-GA4. שתיהן מערכות צד-שלישי, ולכן:

- **אי אפשר לשאול אותן** בלי מפתח Service Account שאין לפרויקט.
- **חוסם פרסומות מפיל את שתיהן בשקט** — המבקרת נכנסה, ואף מערכת לא יודעת.

לכן נוספה שכבה שלישית שהיא שלנו: טבלת `site_events` ב-Supabase, שנכתבת דרך
Edge Function בשם `track`. אותם אירועים בדיוק, רק שאפשר לשאול אותם ב-SQL רגיל,
בכל רגע, בלי להיות תלויים באף אחד.

## הזרימה

```
דפדפן  →  trackEvent()  →  Mixpanel  (צד שלישי, לא נשאל)
                        →  GA4       (צד שלישי, לא נשאל)
                        →  /track    →  site_events  →  ה-views למטה
```

הקוד: `frontend/lib/analytics.js` (שליחה) · `supabase/functions/track/index.ts` (קליטה).

## פרטיות

- `session_id` הוא מזהה אקראי לכל טאב, ב-`sessionStorage`. לא טלפון, לא שם.
- פונקציית `track` **דוחה** מטען שנראה כמו מספר טלפון במקום לנקות אותו, כדי
  שטעות בפרונטאנד תיפול ברעש בלוגים ולא תישמר בשקט.
- מה-referrer נשמרים רק origin ו-path. ה-query string נזרק.
- `site_events` עם RLS פעיל וללא אף policy. ה-views מוגדרים `security_invoker`
  והרשאות ה-REST שלהם נשללו. כלומר: אין דרך לקרוא את זה מהדפדפן.

## השאילתות

הכל דרך Supabase Dashboard ← SQL Editor.

### כמה נכנסו, כמה פתחו צ'אט, כמה דיברו

```sql
select * from analytics_funnel order by day desc limit 30;
```

| עמודה | פירוש |
|---|---|
| `sessions` | כניסות — טאבים ייחודיים, לא רענונים |
| `chat_openers` | כמה פתחו את הצ'אט |
| `chat_talkers` | כמה באמת שלחו הודעה |
| `whatsapp_clickers` | כמה הגיעו לוואטסאפ |
| `booking_clickers` | כמה הגיעו למערכת ההזמנות |
| `pct_talked_of_openers` | מתוך מי שפתח — כמה גם דיבר. המספר שמעיד אם הצ'אט שימושי |

### מאיפה הן מגיעות

```sql
select * from analytics_sources where day > current_date - 30;
```

מפלח לפי אינסטגרם / גוגל / טיקטוק / ישיר וכו'.

### מה הכי לוחצים

```sql
select event, count(*) as n, count(distinct session_id) as people
from site_events
where created_at > now() - interval '30 days'
group by 1 order by n desc;
```

### מה שואלים את הצ'אט

```sql
select props->>'message_length' as len, count(*)
from site_events where event = 'chat_message_sent'
group by 1 order by 2 desc;
```

> תוכן ההודעות עצמן **לא** נשמר — רק האורך. אם נרצה לדעת על מה שואלים,
> זו החלטת פרטיות נפרדת שצריך לקבל במפורש.

## מה עדיין חסר

| פער | מה זה חוסם | מה צריך |
|---|---|---|
| Search Console לא מחובר | אין נראות לשאילתות חיפוש, הופעות ובעיות אינדוקס | לאמת את הדומיין ב-Search Console |
| אין מפתח Mixpanel לקריאה | אי אפשר לשלוף היסטוריה שנאספה לפני 03/08 | Project Settings ← Service Accounts |
| אין מפתח GA4 לקריאה | אותו דבר עבור GA4 | Analytics Data API + Service Account |
| ל-`services` אין עמודת מחיר | אף מערכת לא יכולה לענות "כמה עולה" — לא הדף, לא הצ'אט, לא הבוט | להוסיף עמודה ולמלא מחירים |

## הצ'אט באתר — מצב נוכחי

הווידג'ט בדף הבית **לא מדבר עם השרת**. `sendLocal()` ב-`frontend/index.html`
מתאים מילת מפתח לטבלה קשיחה `LOCAL_RESPONSES` ומחזיר תשובה מוכנה אחרי השהיית
הקלדה מדומה של 650 מילישניות. המחרוזת `chat-handler` לא מופיעה בקובץ.

במקביל, `supabase/functions/chat-handler` **כן** מכיל בוט מלא עם ערוץ web מוכן,
והוא פרוס ועובד. בבדיקה ישירה מול הפונקציה, לשאלה "איפה הסטודיו" הוא ענה
"רחוב רש\"י 11, רמת גן" — תשובה שהווידג'ט באתר לא יודע לתת.

כלומר הבוט החכם קיים, פרוס, ומשלם עליו — האתר פשוט לא מחובר אליו.
