/**
 * Meital Boutique Booking — Google Apps Script Backend
 * =====================================================
 * Deploy as: Web App → Execute as: Me → Who has access: Anyone
 *
 * Script Properties required (set via Project Settings → Script Properties):
 *   TWILIO_ACCOUNT_SID   — Twilio Account SID
 *   TWILIO_AUTH_TOKEN    — Twilio Auth Token
 *   TWILIO_FROM_NUMBER   — Twilio sender phone number (+972...)
 *   ADMIN_PHONE          — Meital's phone number for admin SMS links
 *   HMAC_SECRET          — Random 32+ char secret for admin link signing
 *   SPREADSHEET_ID       — Google Sheets document ID
 *   CALENDAR_ID          — Google Calendar ID (or 'primary')
 *   WEB_APP_URL          — This script's deployed web app URL (for admin links)
 *   TIMEZONE             — 'Asia/Jerusalem'
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const CFG = {
  get TWILIO_SID()    { return prop('TWILIO_ACCOUNT_SID'); },
  get TWILIO_TOKEN()  { return prop('TWILIO_AUTH_TOKEN'); },
  get TWILIO_FROM()   { return prop('TWILIO_FROM_NUMBER'); },
  get ADMIN_PHONE()   { return prop('ADMIN_PHONE'); },
  get HMAC_SECRET()   { return prop('HMAC_SECRET'); },
  get SS_ID()         { return prop('SPREADSHEET_ID'); },
  get CAL_ID()        { return prop('CALENDAR_ID'); },
  get WEB_APP_URL()   { return prop('WEB_APP_URL'); },
  get TIMEZONE()      { return prop('TIMEZONE') || 'Asia/Jerusalem'; },
};

function prop(key) {
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) throw new Error(`Missing script property: ${key}`);
  return val;
}

// ═══════════════════════════════════════════════════════════════
// SHEET REFERENCES
// ═══════════════════════════════════════════════════════════════

/**
 * Weekly_Slots columns (1-indexed):
 *   A=Date (YYYY-MM-DD)  B=Day (Hebrew)  C=Start_Time  D=End_Time  E=Status
 *   Status values: Available | Pending_Lock | Blocked | Booked
 *
 * Bookings_Log columns (1-indexed):
 *   A=UUID  B=Name  C=Phone  D=Service  E=ServiceName  F=Date  G=Time
 *   H=Timestamp_ISO  I=Duration_Min  J=Status  K=CalendarEventId  L=AdminToken
 *   Status values: Pending | Approved | Rejected
 */

const SHEETS = {
  SLOTS: 'Weekly_Slots',
  LOG:   'Bookings_Log',
};

const SLOT_COL  = { DATE:1, DAY:2, START:3, END:4, STATUS:5 };
const LOG_COL   = { UUID:1, NAME:2, PHONE:3, SERVICE:4, SERVICE_NAME:5,
                    DATE:6, TIME:7, TIMESTAMP:8, DURATION:9, STATUS:10,
                    CAL_EVENT:11, ADMIN_TOKEN:12 };

function ss() {
  return SpreadsheetApp.openById(CFG.SS_ID);
}

function slotsSheet() {
  const sh = ss().getSheetByName(SHEETS.SLOTS);
  if (!sh) throw new Error('Sheet not found: ' + SHEETS.SLOTS);
  return sh;
}

function logSheet() {
  const sh = ss().getSheetByName(SHEETS.LOG);
  if (!sh) throw new Error('Sheet not found: ' + SHEETS.LOG);
  return sh;
}

// ═══════════════════════════════════════════════════════════════
// HTTP ENTRY POINTS
// ═══════════════════════════════════════════════════════════════

function doPost(e) {
  // Split try-catch: parse errors and handler errors logged separately
  Logger.log('[doPost] Invoked');

  let body;
  try {
    if (!e.postData || !e.postData.contents) {
      Logger.log('[doPost] ERROR: e.postData is ' + (e.postData ? 'present but empty' : 'null/undefined'));
      return jsonErr('No request body. Send Content-Type: text/plain with a JSON body.', 400);
    }
    Logger.log('[doPost] Raw body (' + e.postData.contents.length + ' chars): ' + e.postData.contents.substring(0, 200));
    body = JSON.parse(e.postData.contents);
    Logger.log('[doPost] Parsed OK. action=' + body.action);
  } catch (parseErr) {
    Logger.log('[doPost] JSON parse error: ' + parseErr.message);
    return jsonErr('Invalid JSON body: ' + parseErr.message, 400);
  }

  try {
    switch (body.action) {
      case 'getSlots':      return jsonOk(handleGetSlots(body));
      case 'sendOTP':       return jsonOk(handleSendOTP(body));
      case 'verifyAndBook': return jsonOk(handleVerifyAndBook(body));
      case 'adminAction':   return jsonOk(handleAdminAction(body));
      default:
        Logger.log('[doPost] Unknown action: ' + body.action);
        return jsonErr('Unknown action: ' + body.action, 400);
    }
  } catch (err) {
    Logger.log('[doPost] Handler error [' + body.action + ']: ' + err.message);
    Logger.log('[doPost] Stack: ' + err.stack);
    return jsonErr(err.message, 500);
  }
}

function doGet(e) {
  Logger.log('[doGet] params: ' + JSON.stringify(e.parameter));
  try {
    const action    = e.parameter.action;
    const token     = e.parameter.token;
    const bookingId = e.parameter.id;

    // getSlots: inner try-catch guarantees JSON is always returned, even on crash.
    // Without this, GAS would fall through to the outer catch which returns HTML —
    // the browser then fails to parse JSON and misreports it as a CORS error.
    if (action === 'getSlots') {
      Logger.log('[doGet] Routing getSlots GET request');
      try {
        const result = handleGetSlots({ year: e.parameter.year, month: e.parameter.month });
        return ContentService
          .createTextOutput(JSON.stringify(result))
          .setMimeType(ContentService.MimeType.JSON);
      } catch (slotsErr) {
        Logger.log('[doGet/getSlots] CRASH: ' + slotsErr.message + '\n' + slotsErr.stack);
        return ContentService
          .createTextOutput(JSON.stringify({ success: false, error: slotsErr.message }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Admin approve/reject — requires token + bookingId
    if (!action || !token || !bookingId) {
      Logger.log('[doGet] Missing params. action=' + action + ', token=' + !!token + ', id=' + bookingId);
      return HtmlService.createHtmlOutput('<h2>קישור לא תקין.</h2>');
    }

    const result = handleAdminAction({ action, token, bookingId });
    if (result.success) {
      return HtmlService.createHtmlOutput(buildAdminConfirmPage(action, result));
    }
    return HtmlService.createHtmlOutput('<h2>שגיאה: ' + result.error + '</h2>');
  } catch (err) {
    Logger.log('[doGet] Error: ' + err.message + '\n' + err.stack);
    return HtmlService.createHtmlOutput('<h2>שגיאה פנימית: ' + err.message + '</h2>');
  }
}

// ═══════════════════════════════════════════════════════════════
// ACTION: getSlots
// ═══════════════════════════════════════════════════════════════

/**
 * Returns available time slots for a given year/month.
 * Handles three bugs in the original:
 *   1. Date cells arrive as Date objects in UTC — use Utilities.formatDate for correct Israel tz
 *   2. Time cells arrive as Date objects (Jan 1 1900 HH:MM) — use Utilities.formatDate
 *   3. Short/empty rows would cause index-out-of-bounds — guarded explicitly
 */
function handleGetSlots(body) {
  const TZ = 'Asia/Jerusalem';

  Logger.log('[getSlots] START — body: ' + JSON.stringify(body));

  const year  = parseInt(body.year,  10);
  const month = parseInt(body.month, 10);
  Logger.log('[getSlots] Requested year=' + year + ', month=' + month);

  if (!year || !month || year < 2020 || month < 1 || month > 12) {
    throw new Error('Invalid year/month. Got: year=' + body.year + ', month=' + body.month);
  }

  // ── Sheet access ──
  let sh;
  try {
    sh = slotsSheet();
  } catch (shErr) {
    Logger.log('[getSlots] SHEET ERROR: ' + shErr.message);
    throw shErr;
  }
  const lastRow = sh.getLastRow();
  Logger.log('[getSlots] Sheet "' + sh.getName() + '" lastRow=' + lastRow);

  if (lastRow < 2) {
    Logger.log('[getSlots] Sheet has no data rows. Returning empty slots.');
    return { success: true, slots: {} };
  }

  const data = sh.getDataRange().getValues();
  Logger.log('[getSlots] getDataRange rows=' + data.length + ', cols=' + (data[0] ? data[0].length : 0));
  Logger.log('[getSlots] Header: ' + JSON.stringify(data[0]));

  const slots = {};

  for (let r = 1; r < data.length; r++) {
    const row = data[r];

    // Guard: skip short or completely empty rows
    if (!row || row.length < 5) {
      Logger.log('[getSlots] Row ' + r + ': too short (' + (row ? row.length : 0) + ' cols), skip');
      continue;
    }
    if (row.every(cell => cell === '' || cell === null || cell === undefined)) {
      Logger.log('[getSlots] Row ' + r + ': fully empty, skip');
      continue;
    }

    const dateRaw  = row[SLOT_COL.DATE   - 1]; // col A
    const startRaw = row[SLOT_COL.START  - 1]; // col C
    const statusRaw = row[SLOT_COL.STATUS - 1]; // col E
    const status = String(statusRaw === null || statusRaw === undefined ? '' : statusRaw).trim();

    Logger.log('[getSlots] Row ' + r + ': dateRaw=' + dateRaw +
               ' (type=' + typeof dateRaw + ', isDate=' + (dateRaw instanceof Date) + ')' +
               ', startRaw=' + startRaw +
               ' (type=' + typeof startRaw + ', isDate=' + (startRaw instanceof Date) + ')' +
               ', status="' + status + '"');

    // ── Skip non-available ──
    if (status !== 'Available') {
      Logger.log('[getSlots] Row ' + r + ': status="' + status + '", skip');
      continue;
    }

    // ── Parse date (Fix #1: timezone-safe via Utilities.formatDate) ──
    if (!dateRaw) { Logger.log('[getSlots] Row ' + r + ': empty date, skip'); continue; }
    let dateStr;
    try {
      const d = (dateRaw instanceof Date) ? dateRaw : new Date(dateRaw);
      if (isNaN(d.getTime())) {
        Logger.log('[getSlots] Row ' + r + ': unparseable date "' + dateRaw + '", skip');
        continue;
      }
      dateStr = Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
    } catch (dateErr) {
      Logger.log('[getSlots] Row ' + r + ': date error: ' + dateErr.message + ', skip');
      continue;
    }

    // ── Month filter (compare string parts — avoids all JS Date timezone traps) ──
    const parts    = dateStr.split('-');
    const rowYear  = parseInt(parts[0], 10);
    const rowMonth = parseInt(parts[1], 10);
    if (rowYear !== year || rowMonth !== month) {
      Logger.log('[getSlots] Row ' + r + ': ' + dateStr + ' outside ' + year + '-' + month + ', skip');
      continue;
    }

    // ── Parse time (Fix #2: Sheets Time cells arrive as Date objects) ──
    if (!startRaw && startRaw !== 0) {
      Logger.log('[getSlots] Row ' + r + ': empty start time, skip');
      continue;
    }
    let startStr;
    try {
      if (startRaw instanceof Date) {
        startStr = Utilities.formatDate(startRaw, TZ, 'HH:mm');
      } else {
        startStr = String(startRaw).trim();
      }
    } catch (timeErr) {
      Logger.log('[getSlots] Row ' + r + ': time error: ' + timeErr.message + ', skip');
      continue;
    }

    if (!startStr || !/^\d{1,2}:\d{2}$/.test(startStr)) {
      Logger.log('[getSlots] Row ' + r + ': invalid time format "' + startStr + '", skip');
      continue;
    }

    if (!slots[dateStr]) slots[dateStr] = [];
    slots[dateStr].push(startStr);
    Logger.log('[getSlots] Row ' + r + ': ADDED ' + dateStr + ' ' + startStr);
  }

  // Sort times within each day
  Object.keys(slots).forEach(k => slots[k].sort());
  Logger.log('[getSlots] DONE. Days with slots: ' + Object.keys(slots).length);
  Logger.log('[getSlots] Result: ' + JSON.stringify(slots));
  return { success: true, slots };
}
// ═══════════════════════════════════════════════════════════════
// ACTION: sendOTP
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a 6-digit OTP, stores it in Script Cache (5-minute TTL),
 * and sends it via Twilio SMS.
 * Body: { phone: '05XXXXXXXX' }
 */
function handleSendOTP(body) {
  Logger.log('[sendOTP] Raw phone from request: "' + body.phone + '"');
  const phone = normalizePhone(body.phone);
  Logger.log('[sendOTP] Normalized phone: "' + phone + '" (05X→+972 conversion applied if needed)');
  if (!phone) {
    throw new Error(
      'Invalid phone: "' + body.phone + '" — expected 05XXXXXXXX (10 digits) or E.164 (+972...)');
  }

  const otp   = generateOTP();
  const cache = CacheService.getScriptCache();
  cache.put('otp_' + phone, otp, 300); // 5-minute TTL

  Logger.log('[sendOTP] OTP cached for ' + phone + ', calling Twilio...');
  try {
    sendSMS(phone, `קוד האימות שלך להזמנת תור: ${otp}\nתקף ל-5 דקות.`);
  } catch (smsErr) {
    Logger.log('[sendOTP] SMS FAILED: ' + smsErr.message);
    // Return debugInfo so the browser Console shows the exact Twilio reason.
    return { success: false, error: smsErr.message, debugInfo: smsErr.debugInfo || {} };
  }
  Logger.log('[sendOTP] SMS dispatched successfully to ' + phone);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// ACTION: verifyAndBook
// ═══════════════════════════════════════════════════════════════

/**
 * Verifies OTP, atomically locks the slot, writes to Bookings_Log,
 * and sends admin SMS for approval.
 *
 * Body: { otp, booking: { id, name, phone, service, serviceName,
 *                          date, time, timestamp, timezone, duration } }
 *
 * Race-condition guard: uses LockService + double-check of slot status.
 */
function handleVerifyAndBook(body) {
  const { otp, booking } = body;
  if (!otp || !booking) throw new Error('otp and booking are required');

  const phone = normalizePhone(booking.phone);

  // ── 1. Validate OTP ──
  const cache    = CacheService.getScriptCache();
  const cacheKey = 'otp_' + phone;
  const stored   = cache.get(cacheKey);

  if (!stored || stored !== String(otp)) {
    return { success: false, error: 'invalid_otp' };
  }
  cache.remove(cacheKey); // single-use

  // ── 2. Acquire distributed lock (30-second window) ──
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 10-second wait; throws if unavailable
  } catch (_) {
    return { success: false, error: 'slot_locked' };
  }

  try {
    // ── 3. Race-condition check: verify slot is still Available ──
    const slotRow = findSlotRow(booking.date, booking.time);
    if (!slotRow) {
      return { success: false, error: 'slot_not_found' };
    }
    const currentStatus = String(slotRow.row[SLOT_COL.STATUS - 1]).trim();
    if (currentStatus !== 'Available') {
      return { success: false, error: 'slot_unavailable' };
    }

    // ── 4. Atomically mark slot as Pending_Lock ──
    slotsSheet().getRange(slotRow.rowIndex, SLOT_COL.STATUS).setValue('Pending_Lock');
    SpreadsheetApp.flush();

    // ── 5. Generate admin HMAC token ──
    const bookingId  = booking.id || uuid4();
    const adminToken = signAdminToken(bookingId);

    // ── 6. Write Bookings_Log row ──
    const now = nowISO();
    logSheet().appendRow([
      bookingId,
      booking.name,
      phone,
      booking.service,
      booking.serviceName,
      booking.date,
      booking.time,
      now,
      booking.duration,
      'Pending',
      '',              // CalendarEventId — filled on approval
      adminToken,
    ]);
    SpreadsheetApp.flush();

    // ── 7. Send admin SMS with approve / reject links ──
    const approveUrl = buildAdminUrl('APPROVE', bookingId, adminToken);
    const rejectUrl  = buildAdminUrl('REJECT',  bookingId, adminToken);
    const adminMsg   = [
      `📅 הזמנה חדשה ממתינה לאישור:`,
      `שם: ${booking.name}`,
      `טלפון: ${formatPhone(phone)}`,
      `שירות: ${booking.serviceName}`,
      `תאריך: ${booking.date} בשעה ${booking.time}`,
      ``,
      `✅ אישור: ${approveUrl}`,
      `❌ דחייה: ${rejectUrl}`,
    ].join('\n');
    sendSMS(CFG.ADMIN_PHONE, adminMsg);

    Logger.log('[verifyAndBook] Booking created: ' + bookingId);
    return { success: true, bookingId, status: 'Pending' };

  } finally {
    lock.releaseLock();
  }
}

// ═══════════════════════════════════════════════════════════════
// ACTION: adminAction
// ═══════════════════════════════════════════════════════════════

/**
 * Handles APPROVE or REJECT from the admin SMS link.
 * Body / GET params: { action: 'APPROVE'|'REJECT', token, bookingId }
 *
 * Security: verifies HMAC token before mutating any data.
 */
function handleAdminAction(body) {
  const { action, token, bookingId } = body;
  if (!action || !token || !bookingId) throw new Error('action, token, and bookingId required');

  // ── 1. Verify HMAC signature ──
  const expected = signAdminToken(bookingId);
  if (!timingSafeEqual(expected, token)) {
    Logger.log('[adminAction] Invalid token for booking ' + bookingId);
    return { success: false, error: 'invalid_token' };
  }

  // ── 2. Find booking row ──
  const logSh  = logSheet();
  const data   = logSh.getDataRange().getValues();
  let bookingRow = null, bookingIdx = -1;

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][LOG_COL.UUID - 1]).trim() === bookingId) {
      bookingRow = data[r];
      bookingIdx = r + 1; // 1-indexed
      break;
    }
  }

  if (!bookingRow) return { success: false, error: 'booking_not_found' };

  const currentStatus = String(bookingRow[LOG_COL.STATUS - 1]).trim();
  if (currentStatus !== 'Pending') {
    return { success: false, error: 'already_processed', currentStatus };
  }

  if (action === 'APPROVE') {
    return processApproval(logSh, bookingRow, bookingIdx, bookingId);
  } else if (action === 'REJECT') {
    return processRejection(logSh, bookingRow, bookingIdx, bookingId);
  }

  throw new Error('Unknown adminAction: ' + action);
}

function processApproval(logSh, row, rowIdx, bookingId) {
  const date        = String(row[LOG_COL.DATE - 1]).trim();
  const time        = String(row[LOG_COL.TIME - 1]).trim();
  const duration    = parseInt(row[LOG_COL.DURATION - 1], 10) || 90;
  const clientName  = String(row[LOG_COL.NAME - 1]).trim();
  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());
  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();

  // ── Create Google Calendar event ──
  const calEventId = createCalendarEvent({
    date, time, duration, clientName, serviceName, bookingId,
  });

  // ── Update Bookings_Log: status → Approved, store calendar event ID ──
  logSh.getRange(rowIdx, LOG_COL.STATUS).setValue('Approved');
  logSh.getRange(rowIdx, LOG_COL.CAL_EVENT).setValue(calEventId);
  SpreadsheetApp.flush();

  // ── Update Weekly_Slots: mark slot as Booked ──
  updateSlotStatus(date, time, 'Booked');

  // ── Notify client ──
  const clientMsg = [
    `✅ ההזמנה שלך אושרה!`,
    `שירות: ${serviceName}`,
    `תאריך: ${date} בשעה ${time}`,
    ``,
    `מחכה לך! 💅`,
  ].join('\n');
  sendSMS(clientPhone, clientMsg);

  Logger.log('[adminAction] Approved: ' + bookingId);
  return { success: true, action: 'APPROVE', bookingId, calEventId };
}

function processRejection(logSh, row, rowIdx, bookingId) {
  const date        = String(row[LOG_COL.DATE - 1]).trim();
  const time        = String(row[LOG_COL.TIME - 1]).trim();
  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());
  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();

  // ── Update Bookings_Log: status → Rejected ──
  logSh.getRange(rowIdx, LOG_COL.STATUS).setValue('Rejected');
  SpreadsheetApp.flush();

  // ── Release slot back to Available ──
  updateSlotStatus(date, time, 'Available');

  // ── Notify client ──
  const clientMsg = [
    `❌ לצערנו, הבקשה לתור ב-${date} שעה ${time} לא אושרה.`,
    `ניתן להזמין תור חלופי דרך האפליקציה.`,
  ].join('\n');
  sendSMS(clientPhone, clientMsg);

  Logger.log('[adminAction] Rejected: ' + bookingId);
  return { success: true, action: 'REJECT', bookingId };
}

// ═══════════════════════════════════════════════════════════════
// GOOGLE CALENDAR INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a calendar event on approval.
 * Returns the event ID (stored in Bookings_Log for later management).
 */
function createCalendarEvent({ date, time, duration, clientName, serviceName, bookingId }) {
  const cal = CalendarApp.getCalendarById(CFG.CAL_ID);
  if (!cal) throw new Error('Calendar not found: ' + CFG.CAL_ID);

  const [year, month, day] = date.split('-').map(Number);
  const [hour, min]        = time.split(':').map(Number);

  const start = new Date(year, month - 1, day, hour, min, 0);
  const end   = new Date(start.getTime() + duration * 60 * 1000);

  const event = cal.createEvent(
    `💅 ${serviceName} — ${clientName}`,
    start,
    end,
    {
      description: `הזמנה #${bookingId}\nלקוחה: ${clientName}\nשירות: ${serviceName}`,
      status: 'confirmed',
    }
  );

  Logger.log('[createCalendarEvent] Created event: ' + event.getId());
  return event.getId();
}

/**
 * Blocks personal time in Weekly_Slots based on non-booking calendar events.
 * Intended to be run as a time-driven trigger (e.g., daily at 01:00).
 * Marks any slot overlapping a calendar event as 'Blocked'.
 */
function syncCalendarToSlots() {
  const cal   = CalendarApp.getCalendarById(CFG.CAL_ID);
  const sh    = slotsSheet();
  const data  = sh.getDataRange().getValues();
  const now   = new Date();
  const end   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day window

  const events = cal.getEvents(now, end);

  for (let r = 1; r < data.length; r++) {
    const row       = data[r];
    const dateStr   = formatSheetDate(row[SLOT_COL.DATE - 1]);
    const startStr  = String(row[SLOT_COL.START - 1]).trim();
    const endStr    = String(row[SLOT_COL.END   - 1]).trim();
    const status    = String(row[SLOT_COL.STATUS - 1]).trim();

    if (status === 'Booked' || !dateStr || !startStr) continue;

    const [yr, mo, da] = dateStr.split('-').map(Number);
    const [sh_, sm_]   = startStr.split(':').map(Number);
    const [eh_, em_]   = endStr  .split(':').map(Number);
    const slotStart = new Date(yr, mo - 1, da, sh_, sm_);
    const slotEnd   = new Date(yr, mo - 1, da, eh_, em_);

    const overlaps = events.some(ev =>
      ev.getStartTime() < slotEnd && ev.getEndTime() > slotStart
    );

    if (overlaps && status === 'Available') {
      sh.getRange(r + 1, SLOT_COL.STATUS).setValue('Blocked');
    } else if (!overlaps && status === 'Blocked') {
      // Re-open if personal event was deleted
      sh.getRange(r + 1, SLOT_COL.STATUS).setValue('Available');
    }
  }

  SpreadsheetApp.flush();
  Logger.log('[syncCalendarToSlots] Sync complete');
}

// ═══════════════════════════════════════════════════════════════
// TWILIO SMS
// ═══════════════════════════════════════════════════════════════

function sendSMS(to, body) {
  // Log the EXACT values sent to Twilio — reveals whitespace/formatting issues
  // that would not appear in a summary log line.
  const fromNum = CFG.TWILIO_FROM;
  Logger.log('[sendSMS] Payload → To: "' + to + '" | From: "' + fromNum +
             '" | To.length: ' + to.length + ' | From.length: ' + fromNum.length);

  const url     = `https://api.twilio.com/2010-04-01/Accounts/${CFG.TWILIO_SID}/Messages.json`;
  const options = {
    method:  'post',
    payload: { To: to, From: fromNum, Body: body },
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(CFG.TWILIO_SID + ':' + CFG.TWILIO_TOKEN),
    },
    muteHttpExceptions: true,
  };

  let resp;
  try {
    resp = UrlFetchApp.fetch(url, options);
  } catch (fetchErr) {
    Logger.log('[sendSMS] Network error: ' + fetchErr.message);
    const err = new Error('SMS network error: ' + fetchErr.message);
    err.debugInfo = { stage: 'network', to, from: fromNum, message: fetchErr.message };
    throw err;
  }

  const code     = resp.getResponseCode();
  const respText = resp.getContentText();
  Logger.log('[sendSMS] Twilio HTTP ' + code + ': ' + respText.slice(0, 500));

  if (code < 200 || code >= 300) {
    let detail    = 'HTTP ' + code;
    const dbg     = { stage: 'twilio', to, from: fromNum, httpStatus: code, raw: respText.slice(0, 500) };
    try {
      const tw = JSON.parse(respText);
      detail          = 'HTTP ' + code + ' | Twilio ' + tw.code + ': ' + tw.message;
      dbg.twilioCode    = tw.code;
      dbg.twilioMessage = tw.message;
      if (tw.more_info) { detail += ' — ' + tw.more_info; dbg.moreInfo = tw.more_info; }
    } catch (_) { detail += ' | ' + respText.slice(0, 200); }
    const err = new Error('Twilio SMS failed: ' + detail);
    err.debugInfo = dbg;
    throw err;
  }

  Logger.log('[sendSMS] SMS sent OK to ' + to);
}

// ═══════════════════════════════════════════════════════════════
// SECURITY — HMAC ADMIN TOKENS
// ═══════════════════════════════════════════════════════════════

/**
 * Signs a bookingId with HMAC-SHA256 using the HMAC_SECRET property.
 * Returns a hex string used as the admin link token.
 */
function signAdminToken(bookingId) {
  const secret  = CFG.HMAC_SECRET;
  const bytes   = Utilities.computeHmacSha256Signature(bookingId, secret);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/**
 * Timing-safe string comparison to prevent timing attacks on token validation.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function buildAdminUrl(action, bookingId, token) {
  return `${CFG.WEB_APP_URL}?action=${action}&id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** RFC 4122 UUID v4 in GAS (no crypto.randomUUID available) */
function uuid4() {
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return [
    rand() + rand(),
    rand(),
    '4' + rand().slice(1),
    (8 + Math.floor(Math.random() * 4)).toString(16) + rand().slice(1),
    rand() + rand() + rand(),
  ].join('-');
}

/**
 * Returns current time as ISO 8601 with Israel offset (+02:00 or +03:00).
 * Uses GAS Utilities.formatDate with IANA timezone for correct DST resolution.
 */
function nowISO() {
  const tz   = CFG.TIMEZONE;
  const now  = new Date();
  const fmt  = Utilities.formatDate(now, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
  return fmt;
}

/**
 * Converts a Sheets date cell value (Date object or string) to 'YYYY-MM-DD'.
 */
function formatSheetDate(val) {
  if (!val) return '';
  const d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('05')) return '+972' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  return null;
}

function formatPhone(e164) {
  if (!e164) return e164;
  const local = e164.replace('+972', '0');
  return local.slice(0,3) + '-' + local.slice(3);
}

/**
 * Finds the row in Weekly_Slots matching the given date and start time.
 * Returns { row, rowIndex } (rowIndex is 1-based) or null if not found.
 */
function findSlotRow(date, time) {
  const sh   = slotsSheet();
  const data = sh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    const rowDate  = formatSheetDate(data[r][SLOT_COL.DATE  - 1]);
    const rowStart = String(data[r][SLOT_COL.START - 1]).trim();
    if (rowDate === date && rowStart === time) {
      return { row: data[r], rowIndex: r + 1 };
    }
  }
  return null;
}

function updateSlotStatus(date, time, newStatus) {
  const found = findSlotRow(date, time);
  if (!found) {
    Logger.log('[updateSlotStatus] Slot not found: ' + date + ' ' + time);
    return;
  }
  slotsSheet().getRange(found.rowIndex, SLOT_COL.STATUS).setValue(newStatus);
  SpreadsheetApp.flush();
}

// ═══════════════════════════════════════════════════════════════
// HTTP RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════

function jsonOk(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg, _code) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN CONFIRMATION PAGE (HTML)
// ═══════════════════════════════════════════════════════════════

function buildAdminConfirmPage(action, result) {
  const isApprove = action === 'APPROVE';
  const emoji     = isApprove ? '✅' : '❌';
  const title     = isApprove ? 'תור אושר בהצלחה' : 'תור נדחה';
  const color     = isApprove ? '#A67C8E' : '#EF4444';
  return `<!DOCTYPE html><html lang="he" dir="rtl">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:sans-serif;background:#FAF5F0;display:flex;align-items:center;
       justify-content:center;min-height:100vh;margin:0;padding:1rem;}
  .card{background:#fff;border-radius:1rem;padding:2rem;max-width:360px;width:100%;
        text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);}
  h1{color:${color};font-size:1.4rem;margin:.5rem 0;}
  p{color:#9B8090;font-size:.9rem;line-height:1.6;}
</style></head>
<body><div class="card">
  <div style="font-size:3rem">${emoji}</div>
  <h1>${title}</h1>
  <p>מזהה הזמנה: ${result.bookingId || ''}</p>
  <p>ניתן לסגור חלון זה.</p>
</div></body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL TESTS  (run from GAS Editor — never deploy)
// ═══════════════════════════════════════════════════════════════

/**
 * Unit-test suite for pure/logic functions.
 * Run via GAS Editor → Run → runInternalTests → View Execution Log.
 * No Twilio SMS is sent. No Sheet is written.
 *
 * Test cases:
 *   1. normalizePhone: Israeli 05X formats (digits, dashes, spaces)
 *   2. normalizePhone: E.164 and bare 972 prefix
 *   3. normalizePhone: invalid inputs → null
 *   4. generateOTP: correct length and digit-only
 */
function runInternalTests() {
  let passed = 0, failed = 0;

  function assert(label, actual, expected) {
    const ok = (actual === expected);
    Logger.log((ok ? '✅ PASS' : '❌ FAIL') + ' — ' + label +
               (ok ? ' | got: "' + actual + '"'
                   : ' | expected: "' + expected + '" | got: "' + actual + '"'));
    ok ? passed++ : failed++;
  }

  Logger.log('══════════════ runInternalTests START ══════════════');

  // ── normalizePhone: valid Israeli mobile numbers ──────────────────────────
  Logger.log('\n[ normalizePhone — valid Israeli mobile ]');
  assert('054 ten digits',           normalizePhone('0541234567'),    '+972541234567');
  assert('050 ten digits',           normalizePhone('0501234567'),    '+972501234567');
  assert('052 ten digits',           normalizePhone('0521234567'),    '+972521234567');
  assert('dashes 050-123-4567',      normalizePhone('050-123-4567'), '+972501234567');
  assert('spaces "050 123 4567"',    normalizePhone('050 123 4567'), '+972501234567');
  assert('mixed "054-234 5678"',     normalizePhone('054-234 5678'), '+972542345678');

  // ── normalizePhone: E.164 and bare 972 inputs ─────────────────────────────
  Logger.log('\n[ normalizePhone — E.164 / 972 prefix ]');
  assert('E.164 +972501234567',      normalizePhone('+972501234567'), '+972501234567');
  assert('bare 972 (12 digits)',     normalizePhone('972501234567'),  '+972501234567');

  // ── normalizePhone: invalid inputs → null ────────────────────────────────
  Logger.log('\n[ normalizePhone — invalid inputs ]');
  assert('landline 02',              normalizePhone('0212345678'),   null);
  assert('landline 03',              normalizePhone('0312345678'),   null);
  assert('too short 0501234',        normalizePhone('0501234'),      null);
  assert('empty string',             normalizePhone(''),             null);
  assert('null',                     normalizePhone(null),           null);
  assert('letters only',             normalizePhone('abcdef'),       null);

  // ── generateOTP: format validation ───────────────────────────────────────
  Logger.log('\n[ generateOTP ]');
  const otp = generateOTP();
  assert('length is 6',              String(otp).length === 6   ? '6'    : String(otp).length, '6');
  assert('digits only',              /^\d{6}$/.test(String(otp)) ? 'yes' : 'no', 'yes');
  assert('value >= 100000',          parseInt(otp) >= 100000    ? 'yes' : 'no', 'yes');
  assert('value <= 999999',          parseInt(otp) <= 999999    ? 'yes' : 'no', 'yes');

  // ── normalizePhone consistency: same number via sendOTP path ─────────────
  Logger.log('\n[ handleSendOTP phone path (no Twilio call) ]');
  const cases = [
    { input: '0541234567',    label: 'raw 054 format',   expected: '+972541234567' },
    { input: '+972501234567', label: 'E.164 format',     expected: '+972501234567' },
    { input: '050-123-4567',  label: 'dashes',           expected: '+972501234567' },
    { input: '050 123 4567',  label: 'spaces',           expected: '+972501234567' },
  ];
  cases.forEach(tc => assert(tc.label, normalizePhone(tc.input), tc.expected));

  Logger.log('\n══════════════ RESULTS: ' + passed + ' passed, ' + failed + ' failed ══════════════');
  if (failed === 0) {
    Logger.log('🎉 All tests passed!');
  } else {
    Logger.log('⚠️  ' + failed + ' test(s) FAILED — see ❌ lines above.');
  }
}

// ═══════════════════════════════════════════════════════════════
// TIME-DRIVEN TRIGGER SETUP
// ═══════════════════════════════════════════════════════════════

/**
 * Run once from the GAS editor to install the daily calendar-sync trigger.
 * Do NOT deploy this function as part of the web app.
 */
function installTriggers() {
  // Remove any existing syncCalendarToSlots triggers first
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncCalendarToSlots')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('syncCalendarToSlots')
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .create();

  Logger.log('[installTriggers] syncCalendarToSlots trigger installed.');
}
