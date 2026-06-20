# Skill: update-media-urls
> עדכן תמונת מחירים / תמונת תקנון בבוט

## המנגנון
הבוט שולח תמונה (TwiML `<Media>`) בתגובה לשאלות על מחיר/תקנון,
**ללא קריאת LLM** — zero cost, instant.

Trigger patterns:
- מחירים: `PRICE_RE = /מחיר|עולה|עלות|תעריף|מחירון|כמה|כסף|price|how much/i`
- תקנון:  `TERMS_RE = /תקנון|מדיניות|כלל|ביטול|איחור|regulations|terms|policy/i`

## לעדכן תמונה

### 1. העלה את התמונה לאחסון ציבורי
אפשרויות:
- **Supabase Storage** (מומלץ — באותו פרויקט):
  ```bash
  # צור bucket ציבורי אם לא קיים:
  supabase storage create-bucket media --public

  # העלה:
  supabase storage upload media/prices.jpg c:/Users/DELL/Downloads/prices.jpg
  supabase storage upload media/terms.jpg  c:/Users/DELL/Downloads/terms.jpg

  # קבל URL:
  supabase storage public-url media/prices.jpg
  supabase storage public-url media/terms.jpg
  ```
- **GitHub Pages**: שים ב-`frontend/assets/` ופרוס ל-gh-pages

### 2. עדכן את ה-secret ב-Supabase
```bash
supabase secrets set TWILIO_PRICES_MEDIA_URL="https://PROJECT.supabase.co/storage/v1/object/public/media/prices.jpg"
supabase secrets set TWILIO_TERMS_MEDIA_URL="https://PROJECT.supabase.co/storage/v1/object/public/media/terms.jpg"
```

### 3. ודא שהURL נגיש
```bash
curl -I "https://YOUR_URL/prices.jpg"
# חייב להחזיר 200 OK ו-Content-Type: image/jpeg
```

### 4. בדיקה
שלח לבוט WhatsApp: "כמה עולה לק ג'ל?"
צפה שתקבל תמונה (לא טקסט).

## שינוי trigger patterns
ערוך ב-`supabase/functions/chat-handler/index.ts`:
```typescript
const PRICE_RE = /מחיר|עולה|..../i
const TERMS_RE = /תקנון|..../i
```
ואז: `bash scripts/deploy-functions.sh`

## דרישות Twilio
- URL חייב להיות **HTTPS** (לא HTTP)
- URL חייב להיות **נגיש ציבורית** (לא מאחורי auth)
- תמונה: JPEG/PNG, מומלץ < 5MB
- Twilio מ-cache את התמונה — אם שינית את הקובץ אך לא את ה-URL, ייתכן שצריך URL חדש
