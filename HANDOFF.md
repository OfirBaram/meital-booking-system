<!-- This file lives at C:/tmp/HANDOFF.md — copy content into the chat to resume tomorrow -->

# Frontend Premium UI — Handoff Document
**Branch:** `feature/design-system-phase1`  
**Session ended:** 2026-06-04  
**Status:** Phase 1 COMPLETE ✅ / Phase 2 partially applied, blocked on failing E2E (1 known bug to fix)

---

## 1. What This Branch Is

A step-by-step UI premium upgrade on the Meital booking system, living on the `feature/design-system-phase1` branch (off `main`). The work is NOT committed yet — all changes are in the working tree.

---

## 2. Files Created/Modified (working tree, not committed)

### New files
| Path | What it is |
|---|---|
| `frontend/styles/tokens.css` | ALL CSS custom properties (colors, shadows, motion, geometry) — single source of truth |
| `frontend/styles/animations.css` | ALL @keyframes + animation utility classes extracted from inline HTML |
| `frontend/styles/components.css` | ALL component styles (.btn-primary, .service-card, .otp-input, .cal-cell, .swipe-card, etc.) using var() |
| `frontend/lib/motion.js` | Thin wrapper around Motion One CDN — exports animate, spring, stagger |

### Modified files
| Path | Change |
|---|---|
| `frontend/index.html` | 146-line inline `<style>` → 3-line body rule; 3 new `<link>` tags + importmap |
| `frontend/admin.html` | 222-line inline `<style>` → 3-line body rule; 3 new `<link>` tags; motion added to importmap |
| `frontend/styles/input.css` | Added `@import` for tokens/animations/components |
| `tailwind.config.js` | Extended: semantic status colors (pending/approved/rejected), 3 new shadows, 3 easing functions, duration tokens |
| `frontend/booking.js` | Import motion, spring animations for: step transitions, service card tap, OTP shake, calendar stagger |
| `frontend/admin.js` | Import motion, spring animations for: tab entrance, card list stagger, approve/reject fly-out |

---

## 3. Current E2E Status

**Admin suite:** 3/15 passing (12 failing)  
**Booking suite:** ~26 failures (likely same root cause)  

The 3 tests that DO pass: load safety, no white screen, client management.  
The 12 that fail: ALL require login — because the crash banner fires on page load and intercepts clicks.

---

## 4. Root Cause of Failures (KNOWN, FIX IS CLEAR)

**Error:** `TypeError: Cannot read properties of undefined (reading '0')` inside `motion-dom@12.40.0/es2022/motion-dom.mjs`

**Why it happens:** `motion@12` on esm.sh is actually the merged framer-motion package. In this version, `spring()` is NOT a standalone callable easing generator (that was Motion One v10 API). It's a physics simulation driver used as `{ type: spring, stiffness: X, damping: Y }`. Calling `spring({ stiffness: 300, damping: 25 })` at module initialization (in the `springs` presets) crashes immediately.

**Two wrong things:**

1. `frontend/lib/motion.js` lines 11-14 — calls `spring()` at module load time:
   ```js
   // BROKEN (old Motion One v10 API):
   export const springs = {
     enter: { easing: spring({ stiffness: 300, damping: 25 }) },  // ← crashes
     ...
   };
   ```

2. Every animation call in `booking.js` and `admin.js` uses `{ easing: spring({...}) }` — the v10 API. In `motion@12`, the correct syntax is `{ type: spring, stiffness: X, damping: Y }`.

---

## 5. The Complete Fix for Tomorrow (READY TO APPLY)

### Step 1 — Fix `frontend/lib/motion.js`

Replace entire file with:
```js
// Thin wrapper around Motion One (https://motion.dev).
// Import from here throughout the app.
// motion@12 uses framer-motion spring API: { type: spring, stiffness, damping }
// NOT the old easing API: { easing: spring({ stiffness, damping }) }

import { animate, spring, stagger } from 'motion';
export { animate, spring, stagger };
```
(Remove the presets — they called spring() at module load which crashes.)

### Step 2 — Fix spring calls in `booking.js` (4 locations)

Old → New:

**showStep (booking.js ~line 665):**
```js
// OLD:
animate(el, { opacity: [0, 1], y: [16, 0] },
  { easing: spring({ stiffness: 300, damping: 25 }) });
// NEW:
animate(el, { opacity: [0, 1], y: [16, 0] },
  { type: spring, stiffness: 300, damping: 25 });
```

**service card (booking.js ~line 357):**
```js
// OLD:
animate(btn, { scale: [0.97, 1.03, 1] },
  { duration: 0.4, easing: spring({ stiffness: 500, damping: 18 }) });
// NEW (spring overshoots naturally — no need for 3 keyframes):
animate(btn, { scale: [0.97, 1] },
  { type: spring, stiffness: 500, damping: 18 });
```

**calendar stagger (booking.js ~line 450):**
```js
// OLD:
animate(_days, { opacity: [0, 1], scale: [0.88, 1] },
  { delay: stagger(0.015), easing: spring({ stiffness: 400, damping: 28 }) });
// NEW:
animate(_days, { opacity: [0, 1], scale: [0.88, 1] },
  { delay: stagger(0.015), type: spring, stiffness: 400, damping: 28 });
```

(OTP shake is `{ duration: 0.35, easing: 'ease-out' }` — NOT a spring, leave as-is ✅)

### Step 3 — Fix spring calls in `admin.js` (3 locations)

**setTab (admin.js ~line 304):**
```js
// OLD:
animate(_tabEl, { opacity: [0, 1], y: [4, 0] },
  { easing: spring({ stiffness: 350, damping: 28 }) });
// NEW:
animate(_tabEl, { opacity: [0, 1], y: [4, 0] },
  { type: spring, stiffness: 350, damping: 28 });
```

**render() stagger (admin.js ~line 398):**
```js
// OLD:
animate(_wrappers, { opacity: [0, 1], y: [8, 0] },
  { delay: stagger(0.04), easing: spring({ stiffness: 400, damping: 30 }) });
// NEW:
animate(_wrappers, { opacity: [0, 1], y: [8, 0] },
  { delay: stagger(0.04), type: spring, stiffness: 400, damping: 30 });
```

**_commitCardAction fly-out (admin.js ~line 1215):**
```js
// OLD:
animate(card, { x: `${dir * 115}%`, opacity: [1, 0] },
  { duration: 0.22, easing: spring({ stiffness: 450, damping: 32 }) });
// NEW:
animate(card, { x: `${dir * 115}%`, opacity: [1, 0] },
  { type: spring, stiffness: 450, damping: 32 });
```
(wrapper collapse uses `{ duration: 0.32, delay: 0.08 }` — NOT a spring, leave as-is ✅)

### Step 4 — Run E2E gate (expect green)
```bash
npx playwright test tests/e2e/admin-dashboard.spec.js --headed
```

---

## 6. After the Fix: Remaining Phase 2 Work

The fixes above are the ONLY blocker. Once E2E is green, Phase 2 is complete.

**Optional Phase 2 additions (nice-to-have, not blocking):**
- Bottom sheet spring: Replace `admin-sheet.js` CSS animation with Motion One (risky — the sheet has complex drag state; skip unless explicitly requested)
- Admin calendar cell stagger: The admin page uses `.cal-entering` CSS stagger (admin-calendar.js). Could replace with Motion One but low priority.

---

## 7. Phase 3 Plan — Skeleton Loading (next after Phase 2)

**Goal:** UI never goes blank. Every load state shows shimmer skeletons.

### Files to create
- `frontend/lib/skeleton.js` — `createSkeleton(lines, className)` factory

### Files to modify
1. **`frontend/booking.js`** — `renderCalendarSkeleton()` already exists (35 shimmering `.cal-day.disabled.animate-pulse` cells). Upgrade: add proper shimmer keyframe via CSS.
2. **`frontend/admin.js`** — `render()` when `S.bookings` is empty/loading: show 4 skeleton swipe card outlines instead of blank.
3. **`frontend/admin.js`** — `renderPulse()` KPI tiles: show 4 shimmer rectangles before data arrives.

### CSS to add in `components.css`
```css
.skeleton-line {
  height: 1em; border-radius: 0.4em;
  background: linear-gradient(90deg, var(--color-cream) 25%, var(--color-secondary) 50%, var(--color-cream) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }
```

---

## 8. Phase 4 Plan — Component Architecture (after Phase 3)

**Goal:** Render functions become composable, testable building blocks.

### Core pattern
Replace 200-line `buildCard()` / `buildSwipeCard()` in `admin-render.js` with smaller pure functions:
```
frontend/components/
  BookingCard.js     — booking card HTML factory
  SlotRow.js         — slot row HTML factory  
  StatusBadge.js     — status chip
  ActionButtons.js   — approve/reject/cancel buttons
  SkeletonCard.js    — shimmer card for loading state
```

**Principle:** Plain functions returning HTML strings. No framework. Same import pattern as existing `admin-render.js`.

---

## 9. How to Resume Tomorrow

1. Open this document
2. Apply the 3-step fix in section 5 (use Python patch tool via Bash — see CLAUDE.md §12)
3. Run E2E gate — should go green
4. Commit Phase 1 + Phase 2 together
5. Proceed to Phase 3 (skeleton loading)

**Python patch command pattern:**
```bash
REPO=$(git rev-parse --show-toplevel)
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
$PYTHON skills/utils/ai_tools.py patch frontend/booking.js \
  --old "old string" --new "new string"
# NOTE: ai_tools.py resolves paths relative to skills/ dir, which is wrong.
# Use direct Python instead:
$PYTHON -c "
import sys; sys.stdout.reconfigure(encoding='utf-8')
path = '$REPO/frontend/booking.js'
with open(path, encoding='utf-8') as f: c = f.read()
c = c.replace('OLD', 'NEW', 1)
with open(path, 'w', encoding='utf-8') as f: f.write(c)
print('done')
"
```

---

## 10. Key Facts to Remember

- **Branch:** `feature/design-system-phase1` (all 3 design phases live here)
- **No commits yet** — everything is in the working tree
- **E2E test command:** `npx playwright test tests/e2e/admin-dashboard.spec.js --headed`
- **The U+200F path issue:** NEVER use Edit/Write tools on existing JS/HTML files — use Python via Bash
- **motion@12 spring API:** `{ type: spring, stiffness: 300, damping: 25 }` NOT `{ easing: spring({...}) }`
- **motion@12 CDN:** `https://esm.sh/motion@12` (the jsdelivr URL was UMD, not ESM)
- **3 tests always pass** regardless (load safety, no white screen, client management) — these are the baseline

---

*Document created 2026-06-04. Paste this into Claude Code chat to resume.*
