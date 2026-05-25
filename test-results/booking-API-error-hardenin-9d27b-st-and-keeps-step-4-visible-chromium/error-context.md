# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.js >> API error hardening — verifyAndBook >> HTTP 500 on verifyAndBook shows a Hebrew toast and keeps step 4 visible
- Location: tests\e2e\booking.spec.js:561:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#js-toast')
Expected: visible
Received: hidden

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#js-toast')

```

```yaml
- banner:
  - img "מיטל שבע ברעם"
  - heading "מיטל שבע ברעם" [level=1]
  - paragraph: לק ג'ל בוטק
- main:
  - img
  - text: בחירת שירות
  - img
  - text: תאריך ושעה
  - img
  - text: פרטים אישיים 4 אימות SMS
  - heading "אימות מספר" [level=2]
  - paragraph: קוד אימות נשלח למספר 050-1234567
  - textbox "ספרה 1": "1"
  - textbox "ספרה 2": "2"
  - textbox "ספרה 3": "3"
  - textbox "ספרה 4": "4"
  - textbox "ספרה 5": "5"
  - textbox "ספרה 6": "6"
  - paragraph: לא קיבלת SMS?
  - button "שלחי שוב" [disabled]
  - text: (60s)
- contentinfo:
  - navigation "קישורי מידע משפטי":
    - button "מדיניות פרטיות"
    - button "הצהרת נגישות"
  - paragraph: © 2025 מיטל שבע ברעם
- button "חזרה"
- button "אמתי"
```

```
Error: browserContext.close: Target page, context or browser has been closed
```