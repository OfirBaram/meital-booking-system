# Google Sheets & Script Properties — Exact Structure

Use this as the diagnostic checklist whenever `getSlots` returns an error or the calendar does not load.

---

## Tab 1: `Weekly_Slots`

> Sheet name must be **exactly** `Weekly_Slots` (capital W, capital S, underscore).

### Column layout

| Col | Header | Type | Format | Valid values |
|-----|--------|------|--------|--------------|
| A | `Date` | Date | `YYYY-MM-DD` (Text, or Sheets Date formatted as `yyyy-mm-dd`) | e.g. `2026-06-02` |
| B | `Day` | Text | Hebrew weekday name | `ראשון` `שני` `שלישי` `רביעי` `חמישי` |
| C | `Start_Time` | Time | `HH:MM` 24-hour (Sheets Time cell, or plain text) | e.g. `09:00`, `13:30` |
| D | `End_Time` | Time | `HH:MM` 24-hour | e.g. `10:30`, `15:00` |
| E | `Status` | Text | One of four exact strings (case-sensitive) | `Available` / `Pending_Lock` / `Blocked` / `Booked` |

### Visual example (rows 1–5)

```
| Date       | Day    | Start_Time | End_Time | Status    |
|------------|--------|------------|----------|-----------|
| 2026-06-02 | שני    | 09:00      | 10:30    | Available |
| 2026-06-02 | שני    | 10:30      | 12:00    | Available |
| 2026-06-03 | שלישי  | 13:30      | 15:00    | Blocked   |
| 2026-06-05 | חמישי  | 09:00      | 11:00    | Booked    |
```

### Common mistakes that break `getSlots`

| Mistake | Symptom in GAS Logs | Fix |
|---------|---------------------|-----|
| Column A formatted as `DD/MM/YYYY` | `[getSlots] Row N: unparseable date` | Re-format as `YYYY-MM-DD` or use a plain Date cell |
| Status has trailing space (e.g. `Available `) | Row skipped silently | Use Data Validation to lock values |
| Sheet named `Weekly slots` (lowercase s) | `Sheet not found: Weekly_Slots` | Rename to exact string |
| Date cell is empty for some rows | Row skipped with `empty date, skip` | Delete empty rows at the bottom |
| Friday (col B = `שישי`) or Saturday (`שבת`) present | Returned by backend, frontend shows 0 slots | Remove these rows or leave Status = `Blocked` |

---

## Tab 2: `Bookings_Log`

> Sheet name must be **exactly** `Bookings_Log`.

### Column layout

| Col | Header | Notes |
|-----|--------|-------|
| A | `UUID` | RFC 4122 v4 UUID — written by backend on booking |
| B | `Name` | Client full name (free text) |
| C | `Phone` | E.164 format: `+9725XXXXXXXX` |
| D | `Service` | Service ID: `gel_classic` or `gel_feet` |
| E | `ServiceName` | Human-readable: `לק ג'ל קלאסי` or `לק ג'ל + רגליים` |
| F | `Date` | `YYYY-MM-DD` |
| G | `Time` | `HH:MM` |
| H | `Timestamp_ISO` | ISO 8601 with Israel offset, e.g. `2026-06-02T09:00:00+03:00` |
| I | `Duration_Min` | Integer: `90` or `120` |
| J | `Status` | `Pending` / `Approved` / `Rejected` |
| K | `CalendarEventId` | Google Calendar event ID (filled on APPROVE) |
| L | `AdminToken` | HMAC-SHA256 hex digest (64 chars) |

> Row 1 must be the header row. Backend reads from row 2 onward.

---

## Script Properties

Set via: **GAS Editor → Project Settings (⚙️) → Script Properties**

| Property key | What it looks like | Where to get it |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (34 chars, starts with `AC`) | Twilio Console → Account Info |
| `TWILIO_AUTH_TOKEN` | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (32 hex chars) | Twilio Console → Account Info (hidden by default) |
| `TWILIO_FROM_NUMBER` | `+97215XXXXXXX` or `+1415XXXXXXX` | Twilio Console → Phone Numbers |
| `ADMIN_PHONE` | `+9725XXXXXXXX` | Meital's phone in E.164 format |
| `HMAC_SECRET` | Any random 32+ char string, e.g. `m3!tA1-s3cur3-s3cr3t-k3y-2026!` | Generate with: `Utilities.base64Encode(Utilities.newBlob(Math.random().toString()))` |
| `SPREADSHEET_ID` | `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms` | From Sheets URL: `.../spreadsheets/d/<THIS_PART>/edit` |
| `CALENDAR_ID` | `primary` **or** `abc123@group.calendar.google.com` | Google Calendar → Settings → Calendar ID |
| `WEB_APP_URL` | `https://script.google.com/macros/s/AKfyc.../exec` | Paste AFTER first deployment |
| `TIMEZONE` | `Asia/Jerusalem` | Literal string — do not change |

### Quick validation test

Run this function once from the GAS Editor (not as a web app) to verify all properties are set:

```javascript
function validateConfig() {
  const keys = [
    'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_FROM_NUMBER',
    'ADMIN_PHONE','HMAC_SECRET','SPREADSHEET_ID','CALENDAR_ID',
    'WEB_APP_URL','TIMEZONE',
  ];
  const props = PropertiesService.getScriptProperties();
  keys.forEach(k => {
    const v = props.getProperty(k);
    Logger.log(k + ': ' + (v ? '✅ set (' + v.length + ' chars)' : '❌ MISSING'));
  });

  // Verify sheet access
  try {
    const ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    ['Weekly_Slots','Bookings_Log'].forEach(name => {
      const sh = ss.getSheetByName(name);
      Logger.log('Sheet "' + name + '": ' + (sh ? '✅ found (lastRow=' + sh.getLastRow() + ')' : '❌ NOT FOUND'));
    });
  } catch(e) {
    Logger.log('Spreadsheet access: ❌ ' + e.message);
  }
}
```

---

## CORS "error" is almost always a JSON parse failure

When the Network tab shows a red `getSlots` request and the browser console says
`SyntaxError: Unexpected token '<'`, it means GAS returned **HTML** instead of JSON.

**Cause:** GAS crashed *before* returning a response, and the outer error handler sent an HTML page.  
**Fix:** Check GAS Stackdriver logs (GAS Editor → Executions) for the real error.  
**Common culprits:** missing Script Property, wrong Sheet name, empty spreadsheet.