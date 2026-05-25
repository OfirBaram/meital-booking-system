# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-render.spec.js >> renderClientList — no inline onclick in DOM >> clicking a client card opens the history panel
- Location: tests\e2e\admin-render.spec.js:253:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#js-clients-list [data-action="select-client"]').first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#js-clients-list [data-action="select-client"]').first()

```

```yaml
- banner:
  - text: מ לוח הבקרה מיטל שבע ברעם
  - button "רענן":
    - img
  - button "SMS"
  - button "יציאה":
    - img
- main:
  - heading "לקוחות" [level=2]
  - searchbox "חפש לפי שם או טלפון..."
  - button "חפש"
  - text: שגיאה בטעינה
- navigation:
  - button "יומן":
    - img
    - text: יומן
  - button "הזמנות":
    - img
    - text: הזמנות
  - button "דופק עסקי":
    - img
    - text: דופק עסקי
  - button "זמנים":
    - img
    - text: זמנים
  - button "יומן":
    - img
    - text: יומן
  - button "לקוחות":
    - img
    - text: לקוחות
- text: שגיאה בטעינת לקוחות
```

```
Error: browserContext.close: Target page, context or browser has been closed
```