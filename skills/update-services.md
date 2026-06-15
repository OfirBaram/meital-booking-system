---
name: update-services
description: >
  Update the service catalog for the Meital booking system — add, rename, or remove services
  (treatment types) and/or change their durations. Use whenever Meital changes her service menu.
  Covers all 18 touch-points: frontend wizard, admin dashboard, landing chatbot, GAS backend,
  Supabase Edge Functions, DB constraint migration, and documentation.
metadata:
  type: project
---

# update-services skill

## When to trigger
- "הוסיפי שירות חדש"
- "שני שמות השירות השתנו"
- "אורך הטיפול השתנה"
- "צריך 3 שירותים במקום 2"
- Any request touching `gel_classic`, `gel_feet`, treatment type, or duration

---

## 1. Service Registry — Single Source of Truth

**`config/studio.json` → `services[]`** is the canonical definition.  
All other files MUST mirror this. Never change service IDs/durations anywhere else first.

```jsonc
// config/studio.json — current (post-v2.2) service list:
{
  "services": [
    {
      "id":          "gel_hands",
      "name":        "לק ג'ל לציפורניים",
      "nameEn":      "Gel Nail Polish",
      "emoji":       "💅",
      "durationMin": 60
    },
    {
      "id":          "regular_feet",
      "name":        "לק רגיל לציפורניים ברגליים",
      "nameEn":      "Regular Feet Nail Polish",
      "emoji":       "🦶",
      "durationMin": 30
    },
    {
      "id":          "gel_combo",
      "name":        "לק ג'ל לציפורניים + לק רגיל לרגליים",
      "nameEn":      "Gel Hands + Regular Feet Combo",
      "emoji":       "✨",
      "durationMin": 90
    }
  ]
}
```

When adding a future service, add it here first — then propagate to all files below.

---

## 2. Complete Touch-Point Checklist

Work through these in order. Each section includes the exact string to find and what to replace.

### ⬜ 2.1 frontend/booking.js — Service definitions + duration guard

**Location:** top of file, `SERVICES` array  
**What:** id, name (Hebrew display), duration (minutes)

```js
// OLD:
{ id: 'gel_classic', name: "לק ג'ל קלאסי", duration: 90 },
{ id: 'gel_feet',   name: "לק ג'ל לרגליים", duration: 120 },

// NEW:
{ id: 'gel_hands',        name: "לק ג'ל לציפורניים",                      duration: 60  },
{ id: 'regular_feet',     name: "לק רגיל לציפורניים ברגליים",              duration: 30  },
{ id: 'gel_combo',        name: "לק ג'ל לציפורניים + לק רגיל לרגליים",    duration: 90  },
```

**Location:** duration fallback guard (~line 578)  
```js
// OLD:
const _dur = State.service === 'gel_feet' ? 120 : 90;
// NEW: State.service is now an object with .duration — guard is likely unused, but if present:
const _dur = State.service?.duration ?? 60;
```

**Patch command:**
```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
BASE=$(git rev-parse --show-toplevel)
$PYTHON "$BASE/skills/utils/ai_tools.py" patch "$BASE/frontend/booking.js" \
  --old "old string" --new "new string"
```

---

### ⬜ 2.2 frontend/index.html — meta description

```html
<!-- OLD: -->
<meta name="description" content="... לק ג'ל קלאסי ולרגליים ...">
<!-- NEW: -->
<meta name="description" content="... לק ג'ל לציפורניים, לק רגיל לרגליים, וקומבו — שירות אישי ומקצועי.">
```
Same change for `og:description`.

---

### ⬜ 2.3 frontend/admin-render.js — SERVICE_NAME map

```js
// OLD:
export const SERVICE_NAME = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" };

// NEW (keep old IDs for backward compat with historical DB records):
export const SERVICE_NAME = {
  gel_hands:     "לק ג'ל לציפורניים",
  regular_feet:  "לק רגיל לציפורניים ברגליים",
  gel_combo:     "לק ג'ל + לק רגיל לרגליים",
  // legacy — existing appointments in DB still reference these
  gel_classic:   "לק ג'ל קלאסי (ישן)",
  gel_feet:      "לק ג'ל רגליים (ישן)",
};
```

---

### ⬜ 2.4 frontend/admin-sheet.js — _SVC_EMOJI / _SVC_DURATION / _SVC_LABEL

```js
// OLD:
const _SVC_EMOJI    = { gel_classic: '💅', gel_feet: '🦶' }
const _SVC_DURATION = { gel_classic: 90,   gel_feet: 120   }
const _SVC_LABEL    = { gel_classic: "לק ג'ל קלאסי", gel_feet: "לק ג'ל רגליים" }

// NEW (keep legacy keys for historical records):
const _SVC_EMOJI    = { gel_hands:'💅', regular_feet:'🦶', gel_combo:'✨', gel_classic:'💅', gel_feet:'🦶' }
const _SVC_DURATION = { gel_hands:60,  regular_feet:30,   gel_combo:90,   gel_classic:90,  gel_feet:120  }
const _SVC_LABEL    = {
  gel_hands:    "לק ג'ל לציפורניים",
  regular_feet: "לק רגיל לרגליים",
  gel_combo:    "לק ג'ל + לק רגיל לרגליים",
  gel_classic:  "לק ג'ל קלאסי (ישן)",
  gel_feet:     "לק ג'ל רגליים (ישן)",
}
```

---

### ⬜ 2.5 frontend/admin.js — SERVICE_DURATION map (~line 621)

```js
// OLD:
const SERVICE_DURATION = { gel_classic: 90, gel_feet: 120 };

// NEW:
const SERVICE_DURATION = {
  gel_hands: 60, regular_feet: 30, gel_combo: 90,
  gel_classic: 90, gel_feet: 120  // legacy
};
```

---

### ⬜ 2.6 frontend/landing.html — Chatbot SVC chip logic

Find around line 1592:
```js
// OLD:
} else if (p.match(/^\[SVC:(gel_classic|gel_feet)\]$/)) {
  var svcId    = p.match(/\[SVC:(\w+)\]/)[1];
  var svcLabel = svcId === 'gel_classic' ? '💅 לק ג\'ל קלאסי — 90 דק\'' : '🦶 לק ג\'ל לרגליים — 120 דק\'';
  var svcMsg   = svcId === 'gel_classic' ? 'לק ג\'ל קלאסי' : 'לק ג\'ל לרגליים';

// NEW:
} else if (p.match(/^\[SVC:(gel_hands|regular_feet|gel_combo)\]$/)) {
  var svcId    = p.match(/\[SVC:(\w+)\]/)[1];
  var _SVC_LABELS = {
    gel_hands:    '💅 לק ג\'ל לציפורניים — 60 דק\'',
    regular_feet: '🦶 לק רגיל לרגליים — 30 דק\'',
    gel_combo:    '✨ לק ג\'ל + לק רגיל לרגליים — 90 דק\'',
  };
  var _SVC_MSGS = {
    gel_hands:    'לק ג\'ל לציפורניים',
    regular_feet: 'לק רגיל לרגליים',
    gel_combo:    'לק ג\'ל + לק רגיל לרגליים',
  };
  var svcLabel = _SVC_LABELS[svcId] || svcId;
  var svcMsg   = _SVC_MSGS[svcId]   || svcId;
```

---

### ⬜ 2.7 backend/gas-backend.js — ALLOWED_SERVICES (~line 695)

```js
// OLD:
const ALLOWED_SERVICES = ['gel_classic', 'gel_feet'];
// NEW:
const ALLOWED_SERVICES = ['gel_hands', 'regular_feet', 'gel_combo'];
```

**Then sync to Main.js** (same line):
```bash
# After editing gas-backend.js, copy to Main.js:
cp "$BASE/backend/gas-backend.js" "$BASE/backend/Main.js"
```

---

### ⬜ 2.8 backend/SupabaseLayer.js — VALID_SERVICES map (~line 383)

```js
// OLD:
var VALID_SERVICES = {
  gel_classic: { name: "לק ג'ל קלאסי",   duration: 90  },
  gel_feet:    { name: "לק ג'ל רגליים",   duration: 120 },
};

// NEW:
var VALID_SERVICES = {
  gel_hands:    { name: "לק ג'ל לציפורניים",                   duration: 60  },
  regular_feet: { name: "לק רגיל לציפורניים ברגליים",           duration: 30  },
  gel_combo:    { name: "לק ג'ל לציפורניים + לק רגיל לרגליים", duration: 90  },
};
```

---

### ⬜ 2.9 supabase/functions/get-slots/index.ts — duration lookup (~line 49)

```ts
// OLD:
// gel_classic = 90 min, gel_feet = 120 min; default conservative (90)
const durationMin = service === 'gel_feet' ? 120 : 90

// NEW:
const SERVICE_DURATION: Record<string, number> = {
  gel_hands: 60, regular_feet: 30, gel_combo: 90,
}
const durationMin = SERVICE_DURATION[service] ?? 60
```

---

### ⬜ 2.10 supabase/functions/verify-and-book/index.ts — VALID_TREATMENTS (~line 21)

```ts
// OLD:
const VALID_TREATMENTS = ['gel_classic', 'gel_feet']
// NEW:
const VALID_TREATMENTS = ['gel_hands', 'regular_feet', 'gel_combo']
```

---

### ⬜ 2.11 supabase/functions/_shared/bot-config.ts — Bot prompt chips

```ts
// OLD:
[SVC:gel_classic] → tap-to-select chip: לק ג׳ל קלאסי (90 דקות)
[SVC:gel_feet]    → tap-to-select chip: לק ג׳ל לרגליים (120 דקות)
...
[SVC:gel_classic]
[SVC:gel_feet]
...
Valid service_id values: "gel_classic" | "gel_feet"
Example: [BOOK:2026-06-20:10:00:gel_classic]

// NEW:
[SVC:gel_hands]    → tap-to-select chip: לק ג׳ל לציפורניים (60 דקות)
[SVC:regular_feet] → tap-to-select chip: לק רגיל לציפורניים ברגליים (30 דקות)
[SVC:gel_combo]    → tap-to-select chip: לק ג׳ל + לק רגיל לרגליים (90 דקות)
...
[SVC:gel_hands]
[SVC:regular_feet]
[SVC:gel_combo]
...
Valid service_id values: "gel_hands" | "regular_feet" | "gel_combo"
Example: [BOOK:2026-06-20:10:00:gel_hands]
```

---

### ⬜ 2.12 nail-artist-landing-page/config/site-config.ts — Landing page services

```ts
// OLD:
{ id: "gel_classic", name: "לק ג'ל קלאסי",   duration: "90 דקות", ... }
{ id: "gel_feet",    name: "לק ג'ל לרגליים",  duration: "120 דקות", ... }

// NEW:
{ id: "gel_hands",    name: "לק ג'ל לציפורניים",                   duration: "60 דקות"  },
{ id: "regular_feet", name: "לק רגיל לציפורניים ברגליים",           duration: "30 דקות"  },
{ id: "gel_combo",    name: "לק ג'ל לציפורניים + לק רגיל לרגליים", duration: "90 דקות"  },
```

---

### ⬜ 2.13 Supabase DB Migration — Update CHECK constraint

Create a new migration file. **Never edit historical migrations.**

```bash
# File: supabase/migrations/20260616000000_update_service_catalog.sql
```

```sql
-- Migration: update treatment_type CHECK constraint to new service catalog
-- Old: gel_classic | gel_feet
-- New: gel_hands | regular_feet | gel_combo
-- Legacy IDs kept in constraint so historical rows remain valid.

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_treatment_type_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_treatment_type_check
  CHECK (treatment_type IN (
    'gel_hands', 'regular_feet', 'gel_combo',
    'gel_classic', 'gel_feet'   -- legacy: existing bookings
  ));
```

**Apply via MCP:**
```
mcp__supabase__apply_migration(sql=<above>)
```

---

### ⬜ 2.14 config/studio.json — Update services array (always do this first)

See section 1 above for the canonical format.

---

### ⬜ 2.15 Tests — Update mock fixtures

Files containing `gel_classic` / `gel_feet` in test fixtures:
- `tests/e2e/admin-render.spec.js` (line 28, 32) — 2 mock bookings
- `tests/e2e/admin-automation.spec.js` (line 27)
- `tests/e2e/admin-calendar-actions.spec.js` (lines 68, 81, 94, 107)
- `tests/e2e/admin-calendar-bugs.spec.js` (lines 62, 79)
- `tests/e2e/admin-calendar-clarity.spec.js` (lines 35, 266)
- `tests/e2e/admin-dashboard.spec.js` (lines 34, 40)
- `tests/e2e/admin-gestures.spec.js` (line 38)
- `tests/e2e/admin-sheet.spec.js` (line 49)
- `tests/e2e/admin-ux-polish.spec.js` (line 34)
- `tests/e2e/desktop-responsive.spec.js` (line 16)
- `tests/e2e/smart-scheduling.spec.js` (line 32)
- `tests/e2e/sms-delivery-status.spec.js` (lines 29, 35, 164)
- `tests/backend/booking.test.js` (lines 59, 98, 133)
- `tests/backend/change-status.test.js` (lines 55, 56)
- `tests/backend/check-active-booking.test.js` (line 70)
- `tests/backend/list-bookings.test.js` (lines 54, 62)
- `tests/backend/otp-and-booking.test.js` (lines 158, 207)
- `tests/unit/admin-render.test.js` (line 77)
- `tests/unit/gestures.test.js` (line 120)

**Strategy:** replace `gel_classic` → `gel_hands` and `gel_feet` → `gel_combo` in test fixtures.  
In `admin-render.spec.js` line 32, the `gel_feet` booking tests a second service — replace with `regular_feet`.  
Keep duration numbers consistent: `90` → `60` for `gel_hands`, `120` → `90` for `gel_combo`.

---

## 3. Documentation Files to Update

| File | What to change |
|---|---|
| `claude.md` §2 | "2 שירותים בלבד: gel_classic...gel_feet" → 3 services |
| `SYSTEM_MASTER_DOC.md` | Service table (lines 72-73), whitelist (line 933), examples |
| `SHEET_STRUCTURE.md` | Column D values |

---

## 4. Execution Order (critical)

```
1. config/studio.json         ← canonical, do first
2. supabase/functions/_shared/bot-config.ts
3. supabase/functions/get-slots/index.ts
4. supabase/functions/verify-and-book/index.ts
5. DB migration               ← before deploying functions
6. frontend/booking.js
7. frontend/index.html (meta)
8. frontend/admin-render.js
9. frontend/admin-sheet.js
10. frontend/admin.js
11. frontend/landing.html
12. backend/gas-backend.js
13. backend/Main.js           ← copy of gas-backend.js
14. backend/SupabaseLayer.js
15. nail-artist-landing-page/config/site-config.ts
16. tests/ (all fixtures)
17. docs (claude.md, SYSTEM_MASTER_DOC.md, SHEET_STRUCTURE.md)
```

---

## 5. Patch Tool Usage (mandatory for all JS/HTML edits)

```bash
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
BASE=$(git rev-parse --show-toplevel)

# Patch a file:
$PYTHON "$BASE/skills/utils/ai_tools.py" patch \
  "$BASE/path/to/file.js" \
  --old 'exact old string' --new 'exact new string'

# Verify a snippet exists in a file:
$PYTHON "$BASE/skills/utils/ai_tools.py" verify \
  "$BASE/path/to/file.js" 'expected snippet'
```

**Rules:**
- Never use Edit/Write tools for JS/HTML (U+200F path bug mis-resolves to wrong directory)
- Never use `sed -i` for multi-line patches (breaks template literals)
- PowerShell EPERM — use Bash only for file writes

---

## 6. Deploy After Changes

```bash
# Deploy all Supabase Edge Functions:
bash scripts/deploy-functions.sh

# Verify deployment:
npm run verify:deploy

# Run E2E suite (Frontend Deployment Gate):
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```

---

## 7. Backward Compatibility Rule

**Always keep legacy service IDs** (`gel_classic`, `gel_feet`) in:
- `SERVICE_NAME` / `_SVC_LABEL` / `_SVC_EMOJI` / `_SVC_DURATION` maps
- DB CHECK constraint
- `SERVICE_DURATION` in admin.js

This ensures existing `appointments` rows in Supabase still display correctly in the admin dashboard.  
**Do NOT include legacy IDs in `ALLOWED_SERVICES` / `VALID_TREATMENTS`** — those guard new bookings only.

---

## 8. Validation Checklist (run after every service change)

```bash
# 1. No old IDs left in active paths (allow in test fixtures and legacy maps):
grep -r "gel_classic\|gel_feet" frontend/booking.js
grep -r "gel_classic\|gel_feet" supabase/functions/verify-and-book/index.ts
grep -r "gel_classic\|gel_feet" supabase/functions/get-slots/index.ts
# Expected: 0 matches in active code paths

# 2. All 3 new IDs present in key files:
grep -c "gel_hands\|regular_feet\|gel_combo" config/studio.json
grep -c "gel_hands\|regular_feet\|gel_combo" frontend/booking.js

# 3. E2E gate:
npx playwright test tests/e2e/admin-dashboard.spec.js --headed

# 4. Booking flow smoke test (manual):
# Open index.html → verify 3 service cards appear with correct names/durations
# Open admin → verify old bookings still show display names (not blank)
```

---

## 9. Future Service Addition Template

When adding a 4th service (e.g., `pedicure_deluxe`):

1. Add to `config/studio.json` services array
2. Add `pedicure_deluxe` to every map in §2 above
3. Add `pedicure_deluxe` to `ALLOWED_SERVICES`, `VALID_TREATMENTS`
4. Add `SERVICE_DURATION['pedicure_deluxe'] = N`
5. Add new `[SVC:pedicure_deluxe]` chip to bot-config.ts
6. Write a new DB migration adding `'pedicure_deluxe'` to the CHECK constraint
7. Run the full checklist in §8
