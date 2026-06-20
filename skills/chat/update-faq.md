# Skill: update-faq
> הוסף / ערוך / מחק כלל FAQ בבוט

## מה זה FAQ engine?
`supabase/functions/_shared/faq-engine.ts` — 50+ כללים שנבדקים לפני קריאת Anthropic.
First-match wins. מופעל רק כשה-user message אינו booking intent.

## הוסף כלל חדש

```bash
# 1. ערוך את הקובץ
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch supabase/functions/_shared/faq-engine.ts \
  --old "// Q6 -- Nail art / special designs" \
  --new "// Q_NEW -- New rule title
  {
    triggers: [/your_regex/i],
    response: 'התשובה שלך כאן\\n[WA]',
  },

  // Q6 -- Nail art / special designs"

# 2. פרוס
bash scripts/deploy-functions.sh
```

## מבנה כלל
```typescript
{
  triggers: [/regex1/i, /regex2/i],   // כל regex נבדק בנפרד עם .test(msg)
  response: 'תשובה בעברית\n[WA]',   // [WA] / [IG] tokens מותרים
},
```

## כללי עיצוב
- `triggers` — array של RegExp; כל אחד נבדק בנפרד עם `.test(msg)`
- `response` — plain text Hebrew; מותר [WA], [IG]; אסור [BOOK] / [SVC]
- **first-match wins** — שים כללים ספציפיים לפני כלליים
- safety/jailbreak כללים תמיד ראשונים

## לא נפגש ב-FAQ — תמיד עובר ל-LLM
```
BOOKING_INTENT = /תור|לקבוע|הזמ|פנוי|זמינ|מחר|היום|ראשון|שני|שלישי|
                  רביעי|חמישי|שעה|\d{1,2}:\d{2}|בטל|ביטול|לשנות|
                  book|appointment|availab|schedule|slot|cancel|reschedul/i
```
