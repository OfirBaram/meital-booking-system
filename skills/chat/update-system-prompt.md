# Skill: update-system-prompt
> ערוך את ה-system prompt של הבוט

## קובץ מקור
`supabase/functions/_shared/bot-config.ts`

## חלקי ה-prompt (לפי סדר)

### SECURITY BOUNDARY (אסור לשנות מיקום)
תמיד **ראשון** בprompt. models מעדיפים תחילת הheredoc.
לא להזיז, לא לקצר, לא למחוק שורות ממנו.

### PERSONA
כללי נקבה — על עצמה ולקוחה.
לשנות: `$PYTHON skills/utils/ai_tools.py patch supabase/functions/_shared/bot-config.ts --old "..." --new "..."`

### STUDIO CONTEXT
**אל תשנה ידנית** — שינוי שעות/כתובת כאן מספיק.
שינוי שירותים → עדכן בטבלת `services` ב-Supabase (הbot טוען דינמית).

### OPERATIONAL RULES 1-16
כל כלל ממוספר. להוסיף כלל:
```
17. RULE_NAME — תיאור הכלל
```

### WHATSAPP_CHANNEL_BLOCK
מוצג רק בchannel='whatsapp'. שינוי הוראות booking בWA כאן.

## אחרי עריכה
```bash
bash scripts/deploy-functions.sh
# ואז בדוק ב-admin console שהבוט מגיב נכון
```

## נושאים שאסור לשנות
- `SECURITY BOUNDARY` section — לא לקצר / לא להזיז
- `WHATSAPP_ONLY_TOOLS` set — לא להסיר tool
- clientName injection format — `CLIENT_NAME: <name>` (שם הflag ב-prompt)
