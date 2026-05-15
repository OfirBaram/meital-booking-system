# 💅 Meital Boutique Booking - System Specification & Context

## 1. High-Level Vision
A premium, lightweight, and secure booking system for a boutique nail studio. 
Goal: Zero-cost backend maintenance, high-end UX, and total admin control.

## 2. Tech Stack (The "Lean" Stack)
- **Frontend:** Vanilla JS, Tailwind CSS, LocalStorage (Client-side).
- **Backend:** Google Apps Script (GAS) acting as a REST API.
- **Database:** Google Sheets.
- **Calendar:** Google Calendar API (Synced to Miital's Android Galaxy device).
- **Timezone:** Strict ISO 8601 (Asia/Jerusalem) to prevent DST drift.
- **SMS:** Twilio API (OTP verification & Admin links).

## 3. Core Logic & Safety Features
- **Race Condition Guard:** Instant `PENDING_LOCK` status in Sheets upon OTP success.
- **Security:** UUID v4 for all booking IDs (No sequential IDs).
- **Admin Approval:** Two-step confirmation (SMS Link -> Interactive Web Page with Approve/Reject buttons).
- **User Experience:** RTL support, Heebo font, Luxury Dust-Rose palette (#A67C8E, #DDC3A5, #FAF5F0).

## 4. Database Schema (Google Sheets)
- **Weekly_Slots:** Date, Day, Start_Time, End_Time, Status (Available/Pending_Lock/Blocked).
- **Bookings_Log:** UUID, Name, Phone, Service, Date, Time, Status (Pending/Approved/Rejected).

## 5. Development Guidelines
- Mobile-First design.
- Modular JavaScript.
- Feature-branch workflow (No direct commits to main).
- Continuous documentation in this file.

---

## 6. Changelog

### v0.1.0 — 2026-05-15 — Frontend Foundation
**Branch:** `feature/frontend-foundation`

#### Files Created
| File | Purpose |
|------|---------|
| `frontend/index.html` | Full booking UI — RTL, Heebo, Dust-Rose palette, 5-step wizard |
| `frontend/booking.js` | All booking logic — state, API stubs, OTP, LocalStorage, UUID |

#### Booking Flow (5 Steps)
1. **Service Selection** — Cards with dynamic duration badge (1.5h or 2h); click-to-select with visual feedback.
2. **Date & Time** — Hebrew calendar grid with month navigation; available days marked with dot indicators; time-slot grid shows start→end time based on selected service duration.
3. **Personal Details** — Name + phone form; returning-client auto-fill from LocalStorage; live phone validation (Israeli 05X format); "Not me" escape hatch clears saved data.
4. **OTP Verification** — 6-box input with auto-advance, backspace navigation, paste support, and auto-submit on last digit; 60-second resend timer.
5. **Confirmation** — Animated SVG checkmark; full booking summary card including UUID booking ID; "Book another" resets state cleanly.

#### Security Foundations Implemented
- `uuid4()` — uses `crypto.randomUUID()` with RFC 4122 v4 fallback for all booking IDs.
- `toISO8601Jerusalem()` — tags all timestamps with `+03:00` and `timezone: 'Asia/Jerusalem'`; GAS backend must validate DST via `Intl` or `Utilities.formatDate`.
- Booking payload sends `status: 'Pending'` — backend upgrades to `PENDING_LOCK` atomically on OTP success.
- No secrets or API keys in frontend code.

#### API Integration (Stubs — activate by setting `CONFIG.API_BASE`)
| Function | GAS Action | Mock Behaviour |
|----------|-----------|----------------|
| `apiGetSlots(year, month)` | `getSlots` | Generates random slots, skips Saturdays & past days |
| `apiSendOTP(phone)` | `sendOTP` | Logs to console, returns `{ success: true }` |
| `apiVerifyAndBook(otp)` | `verifyAndBook` | Accepts any OTP except `'000000'`; 750 ms simulated delay |

#### LocalStorage Keys (prefix: `meital_`)
| Key | Value |
|-----|-------|
| `client` | `{ name, phone }` — persisted after first booking for returning-client UX |
