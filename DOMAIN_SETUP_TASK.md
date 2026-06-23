# משימה: חיבור דומיין meytalnails.co.il לאתר

## רקע — מה כבר נעשה
- דומיין `meytalnails.co.il` נרכש ב-Galcomm ביום 23/06/2026
- מזהה הזמנה: 400353369 | חשבונית: 149835
- שולם: ₪217 (2 שנים)
- חשבון Galcomm: שם משתמש `ofirIsBa`, מייל `ofirbaram@gmail.com`
- האתר רץ כרגע על: `https://ofirbaram.github.io/meital-booking-system/`

---

## תנאי מוקדם — לפני הכל

**בדוק שהדומיין פעיל:**
כנס ל-galcomm.co.il → "הדומיינים שלי" → `meytalnails.co.il` צריך להופיע עם סטטוס Active.
אם לא פעיל — פנה ל-Galcomm: 09-8850558 / support-israel@galcomm.com עם מזהה 400353369.

---

## שלב 1 — הגדרת DNS ב-Galcomm

כנס ל-galcomm.co.il → "הדומיינים שלי" → `meytalnails.co.il` → ניהול DNS → הוסף Records:

| Type | Name | Content | הערה |
|------|------|---------|------|
| `A` | `@` | `185.199.108.153` | GitHub Pages |
| `A` | `@` | `185.199.109.153` | GitHub Pages |
| `A` | `@` | `185.199.110.153` | GitHub Pages |
| `A` | `@` | `185.199.111.153` | GitHub Pages |
| `CNAME` | `www` | `ofirbaram.github.io` | www redirect |

**חשוב:** אם Galcomm משתמש ב-Cloudflare Proxy — כבה אותו (ענן אפור, לא כתום).

---

## שלב 2 — GitHub Pages Settings

1. כנס ל: github.com → meital-booking-system → Settings → Pages
2. בשדה **Custom domain** הקלד: `meytalnails.co.il`
3. לחץ **Save** — GitHub יוסיף CNAME file אוטומטית לריפו
4. המתן 5-10 דקות → סמן **Enforce HTTPS**

---

## שלב 3 — פתח ברנץ חדש

```bash
git checkout main
git pull origin main
git checkout -b feat/custom-domain-meytalnails
```

---

## שלב 4 — שינויי קוד (6 שורות ב-5 קבצים)

### הכלי לעריכה (חובה — בגלל U+200F בנתיב):
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch frontend/FILENAME --old "OLD" --new "NEW"
```

---

### 4א. frontend/index.html — canonical (שורה 34)
```
OLD: <link rel="canonical" href="https://ofirbaram.github.io/meital-booking-system/" />
NEW: <link rel="canonical" href="https://meytalnails.co.il/" />
```

### 4ב. frontend/index.html — og:url (שורה 42)
```
OLD: <meta property="og:url"         content="https://ofirbaram.github.io/meital-booking-system/" />
NEW: <meta property="og:url"         content="https://meytalnails.co.il/" />
```

### 4ג. frontend/index.html — Schema.org url (שורה 65)
```
OLD: "url": "https://ofirbaram.github.io/meital-booking-system/",
NEW: "url": "https://meytalnails.co.il/",
```

### 4ד. frontend/accessibility.html — canonical (שורה 9)
```
OLD: <link rel="canonical" href="https://ofirbaram.github.io/meital-booking-system/accessibility.html" />
NEW: <link rel="canonical" href="https://meytalnails.co.il/accessibility.html" />
```

### 4ה. frontend/privacy.html — canonical (שורה 9)
```
OLD: <link rel="canonical" href="https://ofirbaram.github.io/meital-booking-system/privacy.html" />
NEW: <link rel="canonical" href="https://meytalnails.co.il/privacy.html" />
```

### 4ו. frontend/takanon.html — canonical (שורה 9)
```
OLD: <link rel="canonical" href="https://ofirbaram.github.io/meital-booking-system/takanon.html" />
NEW: <link rel="canonical" href="https://meytalnails.co.il/takanon.html" />
```

---

## שלב 5 — CNAME File

בדוק אם GitHub יצר אוטומטית קובץ `CNAME` בשורש הריפו עם התוכן `meytalnails.co.il`.
אם לא — צור אותו ידנית:
```bash
echo "meytalnails.co.il" > CNAME
```

---

## שלב 6 — Commit ו-PR

```bash
git add frontend/index.html frontend/accessibility.html frontend/privacy.html frontend/takanon.html CNAME
git commit -m "feat(domain): update canonical/og URLs to meytalnails.co.il"
gh pr create --title "feat(domain): connect meytalnails.co.il custom domain" --base main
```

---

## שלב 7 — בדיקה סופית

אחרי merge ל-main, המתן 10-30 דקות ובדוק:
- `https://meytalnails.co.il` → האתר עולה עם HTTPS ✅
- `https://www.meytalnails.co.il` → מפנה נכון ✅
- דפדפן מציג מנעול ירוק (SSL) ✅

---

## סיכום זמנים משוער

| שלב | זמן |
|-----|-----|
| DNS מתפשט | 30 דק' עד 24 שעות |
| GitHub Pages SSL | 5-10 דקות אחרי DNS |
| סה"כ | עד 24 שעות |
