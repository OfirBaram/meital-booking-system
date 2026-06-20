# Skill: update-persona
> ערוך את הטון, האישיות והשפה של הבוט

## כללי ברזל (לא לשנות)
- **נקבה מוחלטת** — על עצמה וללקוחה. 100% מהלקוחות הן נשים.
- **'אני / אצלי / הסטודיו שלי'** — אף פעם 'אנחנו / אצלנו'.
- **'בוטיק'** — לא 'בוטק'
- Security Boundary — לא לגעת

## היכן לערוך

### טון + אמוג'י
ב-`SYSTEM_PROMPT_TEMPLATE` → section `PERSONA`:
```
Tone: warm, intimate, professional.
Emojis: 💅 ✨ 📲 — use sparingly.
```

### כינוי ה-studio
ב-`STUDIO CONTEXT` section:
```
Studio: מיטל שבע ברעם — לק ג'ל בוטיק
```

### ברכת משתמש חדש (לא LLM — hardcoded)
ב-`chat-handler/index.ts`, שורה כ-376:
```typescript
const greeting = 'שלום! 💅 אני הבוט של מיטל שבע-ברעם...'
```
ערוך ישירות דרך:
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch supabase/functions/chat-handler/index.ts \
  --old "const greeting = 'שלום! 💅..." \
  --new "const greeting = 'הטקסט החדש'"
```

### תשובות hardcoded (rate limit, handover, terms ack)
גם ב-`chat-handler/index.ts` — חפש ב-twiml() calls.

## לאחר עריכה
```bash
bash scripts/deploy-functions.sh
```
