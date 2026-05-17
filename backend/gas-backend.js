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
  get WEB_APP_URL()   { try { return ScriptApp.getService().getUrl(); } catch (_) { return prop('WEB_APP_URL'); } },
  get TIMEZONE()      { return PropertiesService.getScriptProperties().getProperty('TIMEZONE') || 'Asia/Jerusalem'; },
};

function prop(key) {
  if (key === undefined || key === null) {
    throw new Error(
      'prop() called with undefined key — a CFG getter is referencing an undefined variable.'
    );
  }
  const val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    throw new Error(
      'Missing script property: "' + key + '"' +
      ' — go to Project Settings → Script Properties and add it.'
    );
  }
  return val;
}

// Expected Spreadsheet ID — must match the SPREADSHEET_ID script property.
// Run verifyConfig() from the GAS editor to confirm the property is correct.
const EXPECTED_SS_ID = '1T9B1_4WUYS7Iq1UXyEfnG3LyI0_XapxPH1Q2X-6vVbQ';

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
  SLOTS:   'Weekly_Slots',
  LOG:     'Bookings_Log',
  SMS_LOG: 'SMS_LOG',
  AUDIT:   'Audit_Log',
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

/**
 * Returns the SMS_LOG sheet, creating it with a header row if it does not exist.
 * Columns: Timestamp | To | Context | Status | Message | Detail
 */
function smsLogSheet() {
  const spreadsheet = ss();
  let sh = spreadsheet.getSheetByName(SHEETS.SMS_LOG);
  if (!sh) {
    sh = spreadsheet.insertSheet(SHEETS.SMS_LOG);
    sh.appendRow(['Timestamp', 'To', 'Context', 'Status', 'Message', 'Detail']);
    sh.setFrozenRows(1);
    sh.getRange('A1:F1').setFontWeight('bold');
    sh.setColumnWidth(5, 400); // Message column wider
  }
  return sh;
}

/**
 * Appends one row to SMS_LOG.
 * @param {string} to      - Recipient phone in E.164
 * @param {string} context - e.g. 'OTP', 'AdminNotify', 'ClientApproval', 'ClientRejection'
 * @param {string} status  - 'SENT' | 'MOCK' | 'ERROR'
 * @param {string} message - SMS body
 * @param {string} [detail] - Twilio SID on success, error message on failure
 */
function logSMS(to, context, status, message, detail) {
  try {
    smsLogSheet().appendRow([
      new Date(),
      to,
      context,
      status,
      message.slice(0, 500), // truncate for cell safety
      detail || '',
    ]);
  } catch (e) {
    // Never let SMS_LOG failure break the main flow
    Logger.log('[logSMS] Sheet write failed: ' + e.message);
  }
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
      case 'listBookings':  return jsonOk(handleListBookings(body));
      case 'changeStatus':  return jsonOk(handleChangeStatus(body));
      case 'createBooking': return jsonOk(handleCreateBooking(body));
      case 'runFlowTest':   return jsonOk(handleRunFlowTest(body));
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
    const ERR_HE = {
      invalid_token:    'קישור לא תקין או פג תוקף.',
      booking_not_found:'הזמנה לא נמצאה.',
      already_processed:'הזמנה זו כבר טופלה.',
      lock_timeout:     'המערכת עמוסה. נסה שוב בעוד שניות ספורות.',
    };
    const msg = ERR_HE[result.error] || ('שגיאה: ' + result.error);
    return HtmlService.createHtmlOutput('<h2>' + msg + '</h2>');
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
// Cache TTL for slot data (seconds).  10 min = fast reads, low staleness.
const SLOTS_CACHE_TTL = 600;

/** Returns the CacheService key for a given year/month. */
function _slotsCacheKey(year, month) {
  return 'slots_' + year + '_' + month;
}

/**
 * Invalidates the cached slots for a given date string ('YYYY-MM-DD').
 * Call this after any booking approval or rejection so the next getSlots
 * request re-reads from the Sheet and sees the updated status.
 */
function invalidateSlotsCache(dateStr) {
  try {
    const parts = String(dateStr).split('-');
    const key   = _slotsCacheKey(parseInt(parts[0], 10), parseInt(parts[1], 10));
    CacheService.getScriptCache().remove(key);
    Logger.log('[cache] Invalidated slots cache key: ' + key);
  } catch (e) {
    Logger.log('[cache] invalidateSlotsCache error: ' + e.message);
  }
}

function handleGetSlots(body) {
  const TZ = 'Asia/Jerusalem';

  Logger.log('[getSlots] START — body: ' + JSON.stringify(body));

  const year  = parseInt(body.year,  10);
  const month = parseInt(body.month, 10);
  Logger.log('[getSlots] Requested year=' + year + ', month=' + month);

  if (!year || !month || year < 2020 || month < 1 || month > 12) {
    throw new Error('Invalid year/month. Got: year=' + body.year + ', month=' + body.month);
  }

  // ── Cache check (avoids Spreadsheet I/O on warm requests) ──
  const cacheKey = _slotsCacheKey(year, month);
  try {
    const cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      Logger.log('[getSlots] CACHE HIT — returning cached slots for ' + cacheKey);
      return { success: true, slots: JSON.parse(cached), fromCache: true };
    }
    Logger.log('[getSlots] CACHE MISS — reading from Spreadsheet');
  } catch (cacheErr) {
    Logger.log('[getSlots] Cache read error (non-fatal): ' + cacheErr.message);
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

  // ── Store in cache for future requests ──
  try {
    CacheService.getScriptCache().put(cacheKey, JSON.stringify(slots), SLOTS_CACHE_TTL);
    Logger.log('[getSlots] CACHED under key: ' + cacheKey + ' (TTL ' + SLOTS_CACHE_TTL + 's)');
  } catch (cacheErr) {
    Logger.log('[getSlots] Cache write error (non-fatal): ' + cacheErr.message);
  }

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
// QA bypass: 0500000000 normalises to QA_MOCK_PHONE.
// Caches a fixed OTP and skips Twilio so tests never consume SMS quota.
const QA_MOCK_PHONE = '+972500000000';
const QA_MOCK_OTP   = '123456';

function handleSendOTP(body) {
  Logger.log('[sendOTP] Raw phone from request: "' + body.phone + '"');
  const phone = normalizePhone(body.phone);
  Logger.log('[sendOTP] Normalized phone: "' + phone + '" (05X→+972 conversion applied if needed)');
  if (!phone) {
    throw new Error(
      'Invalid phone: "' + body.phone + '" — expected 05XXXXXXXX (10 digits) or E.164 (+972...)');
  }

  // Mock mode: fixed OTP, no Twilio call
  if (phone === QA_MOCK_PHONE) {
    Logger.log('[sendOTP] MOCK MODE — caching fixed OTP ' + QA_MOCK_OTP + ', skipping Twilio');
    CacheService.getScriptCache().put('otp_' + phone, QA_MOCK_OTP, 300);
    return { success: true };
  }

  // Rate-limit: one real OTP request per phone per 30 seconds.
  // Prevents a direct-API caller from draining the Twilio trial quota.
  const rateLimitKey = 'otp_ratelimit_' + phone;
  const cache = CacheService.getScriptCache();
  if (cache.get(rateLimitKey)) {
    Logger.log('[sendOTP] Rate limit hit for ' + phone + ' — retry in 30 s');
    return { success: false, error: 'rate_limited', retryAfterSecs: 30 };
  }
  cache.put(rateLimitKey, '1', 30); // block repeat for 30 s

  const otp = generateOTP();
  cache.put('otp_' + phone, otp, 300); // 5-minute TTL

  Logger.log('[sendOTP] OTP cached for ' + phone + ', calling Twilio...');
  try {
    sendSMS._context = 'OTP';
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
    // ── 3. Integrity gate — slot MUST exist in Weekly_Slots with status Available ──
    // Rejects any booking that has no backing row in the slots DB ("floating booking" prevention).
    if (CFG.SS_ID !== EXPECTED_SS_ID) {
      Logger.log('[verifyAndBook] ABORT: SPREADSHEET_ID mismatch. Expected ' +
                 EXPECTED_SS_ID + ', got ' + CFG.SS_ID);
      return { success: false, error: 'configuration_error' };
    }
    Logger.log('[verifyAndBook] Integrity gate — checking slot: ' + booking.date + ' ' + booking.time);
    const slotRow = findSlotRow(booking.date, booking.time);
    if (!slotRow) {
      Logger.log('[verifyAndBook] REJECTED: slot not found in Weekly_Slots');
      return { success: false, error: 'slot_not_available' };
    }
    const currentStatus = String(slotRow.row[SLOT_COL.STATUS - 1]).trim();
    if (currentStatus !== 'Available') {
      Logger.log('[verifyAndBook] REJECTED: slot status is "' + currentStatus + '" (not Available)');
      return { success: false, error: 'slot_not_available' };
    }
    Logger.log('[verifyAndBook] Integrity gate PASSED — slot confirmed Available at row ' + slotRow.rowIndex);

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
    if (phone !== QA_MOCK_PHONE) {
      sendSMS._context = 'AdminNotify';
      sendSMS(CFG.ADMIN_PHONE, adminMsg);
    } else {
      Logger.log('[verifyAndBook] MOCK MODE — admin SMS suppressed. Copy links from log:');
      Logger.log('────────────────────────────────────────────────────');
      Logger.log(adminMsg);
      Logger.log('────────────────────────────────────────────────────');
      Logger.log('[verifyAndBook] bookingId=' + bookingId + ' | adminToken=' + adminToken);
    }

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

  // ── 2. Acquire distributed lock — prevents duplicate-approval race between
  //       the SMS link and Admin Dashboard acting on the same booking concurrently. ──
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (_) {
    Logger.log('[adminAction] Lock timeout for booking ' + bookingId);
    return { success: false, error: 'lock_timeout' };
  }

  try {
    // ── 3. Find booking row ──
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
  } finally {
    lock.releaseLock();
  }
}

function processApproval(logSh, row, rowIdx, bookingId) {
  const date        = String(row[LOG_COL.DATE - 1]).trim();
  const time        = String(row[LOG_COL.TIME - 1]).trim();
  const duration    = parseInt(row[LOG_COL.DURATION - 1], 10) || 90;
  const clientName  = String(row[LOG_COL.NAME - 1]).trim();
  const clientPhone = normalizePhone(String(row[LOG_COL.PHONE - 1]).trim());
  const serviceName = String(row[LOG_COL.SERVICE_NAME - 1]).trim();

  // ── Create Google Calendar event ──
  const calEventId = CalService.createEvent({
    date, time, duration, clientName, serviceName, bookingId,
  });

  // ── Update Bookings_Log: status → Approved, store calendar event ID ──
  logSh.getRange(rowIdx, LOG_COL.STATUS).setValue('Approved');
  logSh.getRange(rowIdx, LOG_COL.CAL_EVENT).setValue(calEventId);
  SpreadsheetApp.flush();

  // ── Update Weekly_Slots: mark slot as Booked ──
  updateSlotStatus(date, time, 'Booked');
  invalidateSlotsCache(date);

  // ── Notify client ──
  const clientMsg = [
    `✅ ההזמנה שלך אושרה!`,
    `שירות: ${serviceName}`,
    `תאריך: ${date} בשעה ${time}`,
    ``,
    `מחכה לך! 💅`,
  ].join('\n');
  SmsService.send(clientPhone, clientMsg, 'ClientApproval');

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
  invalidateSlotsCache(date); // bust cache so rejected slot reappears immediately

  // ── Notify client ──
  const clientMsg = [
    `❌ לצערנו, הבקשה לתור ב-${date} שעה ${time} לא אושרה.`,
    `ניתן להזמין תור חלופי דרך האפליקציה.`,
  ].join('\n');
  SmsService.send(clientPhone, clientMsg, 'ClientRejection');

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
 *
 * Also performs two maintenance passes each run:
 *   1. Orphaned Pending_Lock cleanup — resets any Pending_Lock slot with no
 *      matching Pending booking row (guards against mid-booking GAS crashes).
 *   2. TZ-safe date/time parsing via Utilities.formatDate (fixes UTC-midnight
 *      drift that occurs when Sheets Date cells are read as JS Date objects).
 *   3. Cache invalidation for every date whose slot status changed so clients
 *      see the update within the next request rather than waiting up to 10 min.
 */
function syncCalendarToSlots() {
  const TZ   = 'Asia/Jerusalem';
  const cal  = CalendarApp.getCalendarById(CFG.CAL_ID);
  const sh   = slotsSheet();
  const data = sh.getDataRange().getValues();
  const now  = new Date();
  const end  = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day window

  const events       = cal.getEvents(now, end);
  const changedDates = new Set();

  // ── Pass 1: Orphaned Pending_Lock cleanup ─────────────────────────────────
  // Build a key-set of date|time for all currently-Pending bookings.
  // A slot in Pending_Lock with no matching row was orphaned by a GAS crash
  // mid-booking and must be released so clients can book that slot again.
  const logData    = logSheet().getDataRange().getValues();
  const pendingKeys = new Set();
  for (let r = 1; r < logData.length; r++) {
    if (String(logData[r][LOG_COL.STATUS - 1]).trim() !== 'Pending') continue;
    const ld = logData[r][LOG_COL.DATE - 1];
    const lt = logData[r][LOG_COL.TIME - 1];
    const ds = (ld instanceof Date) ? Utilities.formatDate(ld, TZ, 'yyyy-MM-dd') : String(ld).trim();
    const ts = (lt instanceof Date) ? Utilities.formatDate(lt, TZ, 'HH:mm')     : String(lt).trim();
    pendingKeys.add(ds + '|' + ts);
  }

  for (let r = 1; r < data.length; r++) {
    if (String(data[r][SLOT_COL.STATUS - 1]).trim() !== 'Pending_Lock') continue;
    const rd = data[r][SLOT_COL.DATE  - 1];
    const rs = data[r][SLOT_COL.START - 1];
    const ds = (rd instanceof Date) ? Utilities.formatDate(rd, TZ, 'yyyy-MM-dd') : String(rd).trim();
    const ts = (rs instanceof Date) ? Utilities.formatDate(rs, TZ, 'HH:mm')     : String(rs).trim();
    if (!pendingKeys.has(ds + '|' + ts)) {
      sh.getRange(r + 1, SLOT_COL.STATUS).setValue('Available');
      changedDates.add(ds);
      Logger.log('[syncCalendarToSlots] Orphaned Pending_Lock reset -> Available: ' + ds + ' ' + ts);
    }
  }

  // ── Pass 2: Calendar overlap sync (TZ-safe parsing) ───────────────────────
  for (let r = 1; r < data.length; r++) {
    const row    = data[r];
    const status = String(row[SLOT_COL.STATUS - 1]).trim();

    if (status === 'Booked' || status === 'Pending_Lock') continue;

    const rawDate  = row[SLOT_COL.DATE  - 1];
    const rawStart = row[SLOT_COL.START - 1];
    const rawEnd   = row[SLOT_COL.END   - 1];

    // Utilities.formatDate prevents the UTC-midnight off-by-one that happens
    // when Sheets returns Date cells and JS Date methods use the local timezone.
    const dateStr  = (rawDate  instanceof Date) ? Utilities.formatDate(rawDate,  TZ, 'yyyy-MM-dd') : String(rawDate  || '').trim();
    const startStr = (rawStart instanceof Date) ? Utilities.formatDate(rawStart, TZ, 'HH:mm')      : String(rawStart || '').trim();
    const endStr   = (rawEnd   instanceof Date) ? Utilities.formatDate(rawEnd,   TZ, 'HH:mm')      : String(rawEnd   || '').trim();

    if (!dateStr || !startStr) continue;

    const [yr, mo, da] = dateStr.split('-').map(Number);
    const [sh_, sm_]   = startStr.split(':').map(Number);
    const endParts     = endStr.split(':').map(Number);
    const slotStart    = new Date(yr, mo - 1, da, sh_, sm_);
    const slotEnd      = new Date(yr, mo - 1, da,
      isNaN(endParts[0]) ? sh_ + 2 : endParts[0],
      isNaN(endParts[1]) ? 0       : endParts[1]);

    const overlaps = events.some(ev =>
      ev.getStartTime() < slotEnd && ev.getEndTime() > slotStart
    );

    if (overlaps && status === 'Available') {
      sh.getRange(r + 1, SLOT_COL.STATUS).setValue('Blocked');
      changedDates.add(dateStr);
    } else if (!overlaps && status === 'Blocked') {
      sh.getRange(r + 1, SLOT_COL.STATUS).setValue('Available');
      changedDates.add(dateStr);
    }
  }

  SpreadsheetApp.flush();

  // Bust the slot cache for every date that changed so the next getSlots
  // request returns fresh data instead of stale cache (up to 10-min old).
  changedDates.forEach(invalidateSlotsCache);

  Logger.log('[syncCalendarToSlots] Done. Changed dates: ' + [...changedDates].join(', '));
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

  const _smsCtx = sendSMS._context || 'Unknown';
  delete sendSMS._context;

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
    logSMS(to, _smsCtx, 'ERROR', body, 'network: ' + fetchErr.message);
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
    logSMS(to, _smsCtx, 'ERROR', body, detail);
    const err = new Error('Twilio SMS failed: ' + detail);
    err.debugInfo = dbg;
    throw err;
  }

  let sid = '';
  try { sid = JSON.parse(respText).sid || ''; } catch (_) {}
  logSMS(to, _smsCtx, 'SENT', body, sid);
  Logger.log('[sendSMS] SMS sent OK to ' + to + ' | SID: ' + sid);
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
  const TZ   = 'Asia/Jerusalem';
  const sh   = slotsSheet();
  const data = sh.getDataRange().getValues();

  Logger.log('[findSlotRow] Searching for date="' + date + '" time="' + time +
             '" across ' + (data.length - 1) + ' data rows');

  for (let r = 1; r < data.length; r++) {
    const rawDate  = data[r][SLOT_COL.DATE  - 1];
    const rawStart = data[r][SLOT_COL.START - 1];

    // ── Date: Utilities.formatDate avoids UTC-midnight drift when cell is a Date ──
    const rowDate = (rawDate instanceof Date)
      ? Utilities.formatDate(rawDate, TZ, 'yyyy-MM-dd')
      : String(rawDate).trim();

    // ── BUG FIX: Sheets time columns arrive as Date objects (base date Jan 1 1900).
    //    String(Date) → "Sat Dec 30 1899 10:00:00 GMT+..." — never matches "HH:MM".
    //    Must use Utilities.formatDate to extract just the HH:mm part. ──
    const rowStart = (rawStart instanceof Date)
      ? Utilities.formatDate(rawStart, TZ, 'HH:mm')
      : String(rawStart).trim();

    Logger.log('[findSlotRow] r=' + r +
               ' | date: "' + rowDate  + '" vs "' + date + '" → ' + (rowDate  === date  ? 'OK' : 'NO') +
               ' | time: "' + rowStart + '" vs "' + time + '" → ' + (rowStart === time ? 'OK' : 'NO') +
               (rawStart instanceof Date ? ' (Date→formatted)' : ' (string)'));

    if (rowDate === date && rowStart === time) {
      Logger.log('[findSlotRow] ✅ MATCH at sheet row ' + (r + 1));
      return { row: data[r], rowIndex: r + 1 };
    }
  }

  Logger.log('[findSlotRow] ❌ No match found for ' + date + ' ' + time);
  return null;
}

function updateSlotStatus(date, time, newStatus) {
  Logger.log('[updateSlotStatus] Updating ' + date + ' ' + time + ' → "' + newStatus + '"');
  const found = findSlotRow(date, time);
  if (!found) {
    Logger.log('[updateSlotStatus] ❌ Slot not found — status NOT updated! Check date/time format in Weekly_Slots.');
    return;
  }
  const prevStatus = String(found.row[SLOT_COL.STATUS - 1]).trim();
  Logger.log('[updateSlotStatus] Row ' + found.rowIndex + ': "' + prevStatus + '" → "' + newStatus + '"');
  slotsSheet().getRange(found.rowIndex, SLOT_COL.STATUS).setValue(newStatus);
  SpreadsheetApp.flush();
  Logger.log('[updateSlotStatus] ✅ Done');
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
/**
 * Run from the GAS editor to generate admin Approve/Reject links for the
 * most recent booking in Bookings_Log. Paste either URL in a browser to
 * test the admin-approval flow without an SMS being sent.
 */
function simulateAdminSMS() {
  Logger.log('');
  Logger.log('══════════════ simulateAdminSMS START ══════════════');

  const sh      = logSheet();
  const lastRow = sh.getLastRow();

  if (lastRow < 2) {
    Logger.log('[simulateAdminSMS] Bookings_Log is empty — submit a booking first.');
    return;
  }

  const data = sh.getRange(lastRow, 1, 1, 12).getValues()[0];

  // Columns: A=UUID B=Name C=Phone D=Service E=ServiceName
  //          F=Date G=Time H=Timestamp I=Duration J=Status K=CalEventId L=AdminToken
  const bookingId   = String(data[0]).trim();
  const name        = String(data[1]).trim();
  const phone       = String(data[2]).trim();
  const serviceName = String(data[4]).trim();
  const status      = String(data[9]).trim();
  const adminToken  = String(data[11]).trim();

  // Date/Time cells may arrive as Date objects depending on Sheet column format
  let date = data[5];
  date = (date instanceof Date)
    ? Utilities.formatDate(date, CFG.TIMEZONE, 'yyyy-MM-dd')
    : String(date).trim();

  let time = data[6];
  time = (time instanceof Date)
    ? Utilities.formatDate(time, CFG.TIMEZONE, 'HH:mm')
    : String(time).trim();

  Logger.log('[simulateAdminSMS] Row ' + lastRow + ':');
  Logger.log('  bookingId:  ' + bookingId);
  Logger.log('  name:       ' + name);
  Logger.log('  phone:      ' + phone);
  Logger.log('  service:    ' + serviceName);
  Logger.log('  date/time:  ' + date + ' ' + time);
  Logger.log('  status:     ' + status);
  Logger.log('  adminToken: ' + adminToken);

  if (!bookingId || !adminToken) {
    Logger.log('[simulateAdminSMS] ERROR: bookingId or adminToken empty — check Bookings_Log columns A and L.');
    return;
  }

  const approveUrl = buildAdminUrl('APPROVE', bookingId, adminToken);
  const rejectUrl  = buildAdminUrl('REJECT',  bookingId, adminToken);

  Logger.log('');
  Logger.log('══════════════ ADMIN LINKS (paste in browser) ══════════════');
  Logger.log('');
  Logger.log('✅ APPROVE:');
  Logger.log(approveUrl);
  Logger.log('');
  Logger.log('❌ REJECT:');
  Logger.log(rejectUrl);
  Logger.log('');
  Logger.log('════════════════════════════════════════════════════════════');
  Logger.log('[simulateAdminSMS] Open either URL in a browser to run the approval flow.');
  Logger.log('[simulateAdminSMS] Expected: status in Bookings_Log changes to Approved/Rejected + Calendar event created.');
  Logger.log('══════════════ simulateAdminSMS END ══════════════');
}
// ═══════════════════════════════════════════════════════════════
// UNIT TESTS — run from GAS editor, no deployment needed
// ═══════════════════════════════════════════════════════════════

/**
 * Unit tests for pure functions: normalizePhone, signAdminToken, timingSafeEqual.
 * Safe to run at any time — touches no Sheet, Calendar, or Twilio.
 */
function runBackendTests() {
  let passed = 0, failed = 0;
  function assert(label, actual, expected) {
    const ok = (String(actual) === String(expected));
    Logger.log((ok ? '✅ PASS' : '❌ FAIL') + ' — ' + label +
               (ok ? ' | got: "' + actual + '"'
                   : '\n    expected: "' + expected + '"\n    got:      "' + actual + '"'));
    ok ? passed++ : failed++;
  }

  Logger.log('');
  Logger.log('══════════════ runBackendTests START ══════════════');

  // ── normalizePhone ────────────────────────────────────────────
  Logger.log('\n[ normalizePhone ]');
  assert('0541234567',        normalizePhone('0541234567'),    '+972541234567');
  assert('0501234567',        normalizePhone('0501234567'),    '+972501234567');
  assert('dashes 050-123-4567',  normalizePhone('050-123-4567'), '+972501234567');
  assert('spaces 050 123 4567',  normalizePhone('050 123 4567'), '+972501234567');
  assert('+972501234567 passthrough', normalizePhone('+972501234567'), '+972501234567');
  assert('bare 972501234567', normalizePhone('972501234567'),  '+972501234567');
  assert('landline 02 → null', normalizePhone('0212345678'),   null);
  assert('too short → null',   normalizePhone('0501234'),      null);
  assert('empty → null',       normalizePhone(''),             null);
  assert('null → null',        normalizePhone(null),           null);

  // ── signAdminToken + timingSafeEqual ─────────────────────────
  Logger.log('\n[ signAdminToken + timingSafeEqual ]');
  try {
    const t1 = signAdminToken('test-booking-aaa');
    const t2 = signAdminToken('test-booking-aaa');
    const t3 = signAdminToken('test-booking-bbb');
    assert('deterministic (same input → same token)', t1 === t2 ? 'yes' : 'no', 'yes');
    assert('different input → different token',        t1 !== t3 ? 'yes' : 'no', 'yes');
    assert('token length is 64 hex chars',             String(t1.length), '64');
    assert('token is lowercase hex',                   /^[0-9a-f]{64}$/.test(t1) ? 'yes' : 'no', 'yes');
    assert('timingSafeEqual: matching',                timingSafeEqual(t1, t2) ? 'yes' : 'no', 'yes');
    assert('timingSafeEqual: non-matching',            timingSafeEqual(t1, t3) ? 'yes' : 'no', 'no');
    assert('timingSafeEqual: length mismatch → false', timingSafeEqual('abc', 'ab') ? 'yes' : 'no', 'no');
  } catch (e) {
    Logger.log('⚠️  signAdminToken skipped: ' + e.message + ' (HMAC_SECRET property missing?)');
    failed++;
  }

  Logger.log('\n══════════════ RESULTS: ' + passed + ' passed, ' + failed + ' failed ══════════════');
  failed === 0 ? Logger.log('🎉 All tests passed!') : Logger.log('⚠️  ' + failed + ' test(s) FAILED');
}

/**
 * End-to-end "golden path" integration test.
 * Creates a fictional slot, runs verifyAndBook + adminAction APPROVE,
 * asserts slot and log status at each step, then cleans up all test data.
 *
 * IMPORTANT: uses QA_MOCK_PHONE (0500000000) so NO Twilio SMS is sent.
 * Run from the GAS editor — do NOT deploy as a web-app endpoint.
 */
function testFullBookingFlow() {
  const TZ = 'Asia/Jerusalem';
  let passed = 0, failed = 0;
  function assert(label, actual, expected) {
    const ok = (String(actual) === String(expected));
    Logger.log((ok ? '✅ PASS' : '❌ FAIL') + ' — ' + label +
               (ok ? ' | got: "' + actual + '"'
                   : '\n    expected: "' + expected + '"\n    got:      "' + actual + '"'));
    ok ? passed++ : failed++;
  }

  Logger.log('');
  Logger.log('══════════════ testFullBookingFlow START ══════════════');

  // Use a date far enough in the future that no real slot collision is likely
  const testDay   = new Date(); testDay.setDate(testDay.getDate() + 60);
  const testDate  = Utilities.formatDate(testDay, TZ, 'yyyy-MM-dd');
  const testTime  = '08:00';
  const testEnd   = '09:30';
  const testId    = 'TEST-' + Utilities.formatDate(new Date(), TZ, 'HHmmss');

  Logger.log('[testFlow] testDate=' + testDate + ' testTime=' + testTime + ' testId=' + testId);

  const slotSh = slotsSheet();
  const logSh  = logSheet();
  let calEventId = null;

  try {
    // ── Step 1: insert a test slot ────────────────────────────────
    Logger.log('\n[Step 1] Inserting test slot into Weekly_Slots...');
    slotSh.appendRow([testDate, 'TEST', testTime, testEnd, 'Available']);
    SpreadsheetApp.flush();
    const slot1 = findSlotRow(testDate, testTime);
    assert('1a: slot found in sheet',    slot1 !== null ? 'found' : 'not found', 'found');
    assert('1b: slot status=Available',  slot1 ? String(slot1.row[SLOT_COL.STATUS - 1]).trim() : '', 'Available');

    // ── Step 2: cache OTP + call handleVerifyAndBook ──────────────
    Logger.log('\n[Step 2] Calling handleVerifyAndBook (mock phone, no SMS)...');
    CacheService.getScriptCache().put('otp_' + QA_MOCK_PHONE, QA_MOCK_OTP, 60);
    const vRes = handleVerifyAndBook({
      otp: QA_MOCK_OTP,
      booking: {
        id: testId, name: 'AUTO-TEST', phone: '0500000000',
        service: 'gel_classic', serviceName: "Test Service",
        date: testDate, time: testTime,
        timestamp: testDate + 'T' + testTime + ':00+03:00',
        timezone: TZ, duration: 90, status: 'Pending',
      },
    });
    Logger.log('[Step 2] Result: ' + JSON.stringify(vRes));
    assert('2: verifyAndBook success', String(vRes.success), 'true');

    // ── Step 3: slot must be Pending_Lock ─────────────────────────
    Logger.log('\n[Step 3] Verifying slot → Pending_Lock...');
    const slot2 = findSlotRow(testDate, testTime);
    assert('3: slot status=Pending_Lock',
      slot2 ? String(slot2.row[SLOT_COL.STATUS - 1]).trim() : 'missing', 'Pending_Lock');

    // ── Step 4: booking must appear as Pending in Bookings_Log ───
    Logger.log('\n[Step 4] Verifying booking row in Bookings_Log...');
    const logData1 = logSh.getDataRange().getValues();
    let bRow1 = null;
    for (let r = 1; r < logData1.length; r++) {
      if (String(logData1[r][LOG_COL.UUID - 1]).trim() === testId) { bRow1 = logData1[r]; break; }
    }
    assert('4a: booking found in log',   bRow1 !== null ? 'found' : 'not found', 'found');
    assert('4b: booking status=Pending', bRow1 ? String(bRow1[LOG_COL.STATUS - 1]).trim() : '', 'Pending');

    // ── Step 5: adminAction APPROVE ───────────────────────────────
    Logger.log('\n[Step 5] Calling handleAdminAction APPROVE...');
    const tok  = signAdminToken(testId);
    const aRes = handleAdminAction({ action: 'APPROVE', token: tok, bookingId: testId });
    Logger.log('[Step 5] Result: ' + JSON.stringify(aRes));
    assert('5: adminAction APPROVE success', String(aRes.success), 'true');
    calEventId = aRes.calEventId || null;

    // ── Step 6: slot must be Booked (THE KEY ASSERTION) ──────────
    Logger.log('\n[Step 6] Verifying slot → Booked (the slot-sync fix)...');
    const slot3 = findSlotRow(testDate, testTime);
    assert('6: slot status=Booked',
      slot3 ? String(slot3.row[SLOT_COL.STATUS - 1]).trim() : 'missing', 'Booked');

    // ── Step 7: booking must be Approved with a CalendarEventId ──
    Logger.log('\n[Step 7] Verifying booking → Approved + CalendarEventId set...');
    const logData2 = logSh.getDataRange().getValues();
    let bRow2 = null;
    for (let r = 1; r < logData2.length; r++) {
      if (String(logData2[r][LOG_COL.UUID - 1]).trim() === testId) { bRow2 = logData2[r]; break; }
    }
    assert('7a: booking status=Approved',    bRow2 ? String(bRow2[LOG_COL.STATUS - 1]).trim() : '', 'Approved');
    assert('7b: CalendarEventId is set',
      (bRow2 && String(bRow2[LOG_COL.CAL_EVENT - 1]).trim().length > 0) ? 'yes' : 'no', 'yes');

  } catch (e) {
    Logger.log('💥 UNCAUGHT EXCEPTION: ' + e.message);
    Logger.log(e.stack);
    failed++;
  } finally {
    // ── Cleanup: remove test calendar event, log row, slot row ───
    Logger.log('\n[Cleanup] Removing test data...');
    try {
      if (calEventId) {
        const cal = CalendarApp.getCalendarById(CFG.CAL_ID);
        const ev  = cal ? cal.getEventById(calEventId) : null;
        if (ev) { ev.deleteEvent(); Logger.log('[Cleanup] Calendar event deleted: ' + calEventId); }
      }

      const logData = logSh.getDataRange().getValues();
      for (let r = logData.length - 1; r >= 1; r--) {
        if (String(logData[r][LOG_COL.UUID - 1]).trim() === testId) {
          logSh.deleteRow(r + 1);
          Logger.log('[Cleanup] Deleted log row ' + (r + 1));
          break;
        }
      }

      const TZ2      = 'Asia/Jerusalem';
      const slotData = slotSh.getDataRange().getValues();
      for (let r = slotData.length - 1; r >= 1; r--) {
        const rd = slotData[r][SLOT_COL.DATE  - 1];
        const rs = slotData[r][SLOT_COL.START - 1];
        const d  = (rd instanceof Date) ? Utilities.formatDate(rd, TZ2, 'yyyy-MM-dd') : String(rd).trim();
        const s  = (rs instanceof Date) ? Utilities.formatDate(rs, TZ2, 'HH:mm')     : String(rs).trim();
        if (d === testDate && s === testTime) {
          slotSh.deleteRow(r + 1);
          Logger.log('[Cleanup] Deleted test slot row ' + (r + 1));
          break;
        }
      }
      SpreadsheetApp.flush();
      Logger.log('[Cleanup] Done');
    } catch (ce) {
      Logger.log('[Cleanup] ERROR: ' + ce.message);
    }
  }

  Logger.log('\n══════════════ RESULTS: ' + passed + ' passed, ' + failed + ' failed ══════════════');
  failed === 0 ? Logger.log('🎉 Golden path PASSED!') : Logger.log('⚠️  ' + failed + ' step(s) FAILED — see ❌ above');
  Logger.log('══════════════ testFullBookingFlow END ══════════════');
}
/**
 * Run once from the GAS editor to verify all script properties are configured
 * correctly and the SPREADSHEET_ID matches the expected value.
 * Safe to run at any time — reads only, no writes, no SMS, no Calendar.
 */
function verifyConfig() {
  Logger.log('');
  Logger.log('══════════════ verifyConfig START ══════════════');
  let allOk = true;

  // ── Spreadsheet ID ──
  try {
    const actual = CFG.SS_ID;
    if (actual === EXPECTED_SS_ID) {
      Logger.log('[verifyConfig] SPREADSHEET_ID: OK — ' + actual);
    } else {
      Logger.log('[verifyConfig] SPREADSHEET_ID MISMATCH');
      Logger.log('  expected: ' + EXPECTED_SS_ID);
      Logger.log('  actual:   ' + actual);
      allOk = false;
    }
  } catch (e) {
    Logger.log('[verifyConfig] SPREADSHEET_ID: MISSING — ' + e.message);
    allOk = false;
  }

  // ── Required properties ──
  const REQUIRED = [
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER',
    'ADMIN_PHONE', 'HMAC_SECRET', 'CALENDAR_ID', 'ADMIN_TOKEN',
  ];
  REQUIRED.forEach(function(key) {
    const val = PropertiesService.getScriptProperties().getProperty(key);
    if (val) {
      Logger.log('[verifyConfig] ' + key + ': OK');
    } else {
      Logger.log('[verifyConfig] ' + key + ': MISSING');
      allOk = false;
    }
  });

  // ── Sheet access ──
  try {
    const sh = slotsSheet();
    Logger.log('[verifyConfig] Weekly_Slots: OK (lastRow=' + sh.getLastRow() + ')');
  } catch (e) {
    Logger.log('[verifyConfig] Weekly_Slots: ERROR — ' + e.message);
    allOk = false;
  }
  try {
    const sh = logSheet();
    Logger.log('[verifyConfig] Bookings_Log: OK (lastRow=' + sh.getLastRow() + ')');
  } catch (e) {
    Logger.log('[verifyConfig] Bookings_Log: ERROR — ' + e.message);
    allOk = false;
  }

  Logger.log('');
  Logger.log(allOk
    ? '[verifyConfig] All checks PASSED'
    : '[verifyConfig] FAILED — fix issues above before taking live bookings');
  Logger.log('══════════════ verifyConfig END ══════════════');
}

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

// ═══════════════════════════════════════════════════════════════
// ADMIN DASHBOARD API  (v3.0)
// ═══════════════════════════════════════════════════════════════

function validateAdmin(token) {
  if (!token) return false;
  const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!stored) throw new Error('ADMIN_TOKEN script property not set');
  return timingSafeEqual(String(token), stored);
}

function auditSheet() {
  const spreadsheet = ss();
  let sh = spreadsheet.getSheetByName(SHEETS.AUDIT);
  if (!sh) {
    sh = spreadsheet.insertSheet(SHEETS.AUDIT);
    sh.appendRow(['Timestamp', 'Admin', 'Action', 'BookingId', 'PrevStatus', 'NewStatus', 'Detail']);
    sh.setFrozenRows(1);
    sh.getRange('A1:G1').setFontWeight('bold');
    sh.setColumnWidth(4, 280);
    sh.setColumnWidth(7, 250);
  }
  return sh;
}

function writeAuditLog(admin, action, bookingId, prevStatus, newStatus, detail) {
  try {
    auditSheet().appendRow([
      new Date(), admin || 'dashboard', action, bookingId,
      prevStatus || '', newStatus || '', (detail || '').slice(0, 300),
    ]);
  } catch (e) {
    Logger.log('[auditLog] Write failed: ' + e.message);
  }
}

function handleListBookings(body) {
  if (!validateAdmin(body.token)) {
    return { success: false, error: 'unauthorized', code: 403 };
  }
  const sh   = logSheet();
  const data = sh.getDataRange().getValues();
  const TZ   = 'Asia/Jerusalem';
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!row || row.length < 10) continue;
    const rawDate = row[LOG_COL.DATE - 1];
    const rawTime = row[LOG_COL.TIME - 1];
    rows.push({
      id:          String(row[LOG_COL.UUID         - 1] || '').trim(),
      name:        String(row[LOG_COL.NAME         - 1] || '').trim(),
      phone:       String(row[LOG_COL.PHONE        - 1] || '').trim(),
      service:     String(row[LOG_COL.SERVICE      - 1] || '').trim(),
      serviceName: String(row[LOG_COL.SERVICE_NAME - 1] || '').trim(),
      date:        (rawDate instanceof Date) ? Utilities.formatDate(rawDate, TZ, 'yyyy-MM-dd') : String(rawDate || '').trim(),
      time:        (rawTime instanceof Date) ? Utilities.formatDate(rawTime, TZ, 'HH:mm')     : String(rawTime || '').trim(),
      timestamp:   String(row[LOG_COL.TIMESTAMP    - 1] || '').trim(),
      duration:    parseInt(row[LOG_COL.DURATION   - 1], 10) || 90,
      status:      String(row[LOG_COL.STATUS       - 1] || '').trim(),
      calEventId:  String(row[LOG_COL.CAL_EVENT    - 1] || '').trim(),
    });
  }
  rows.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));
  Logger.log('[listBookings] Returned ' + rows.length + ' bookings');
  return { success: true, bookings: rows };
}

function handleChangeStatus(body) {
  if (!validateAdmin(body.token)) {
    return { success: false, error: 'unauthorized', code: 403 };
  }
  const { bookingId, targetStatus } = body;
  if (!bookingId || !targetStatus) {
    return { success: false, error: 'bookingId and targetStatus are required' };
  }
  const ALLOWED = ['Approved', 'Rejected', 'Cancelled'];
  if (!ALLOWED.includes(targetStatus)) {
    return { success: false, error: 'invalid targetStatus: ' + targetStatus };
  }

  // ── Acquire lock — prevents concurrent SMS-link + dashboard race on same booking. ──
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (_) {
    Logger.log('[changeStatus] Lock timeout for booking ' + bookingId);
    return { success: false, error: 'lock_timeout' };
  }

  try {
    const sh   = logSheet();
    const data = sh.getDataRange().getValues();
    let bookingRow = null, bookingIdx = -1;
    for (let r = 1; r < data.length; r++) {
      if (String(data[r][LOG_COL.UUID - 1]).trim() === bookingId) {
        bookingRow = data[r]; bookingIdx = r + 1; break;
      }
    }
    if (!bookingRow) return { success: false, error: 'booking_not_found' };
    const currentStatus = String(bookingRow[LOG_COL.STATUS - 1]).trim();
    const VALID = { Pending: ['Approved', 'Rejected'], Approved: ['Cancelled'] };
    if (!VALID[currentStatus] || !VALID[currentStatus].includes(targetStatus)) {
      return { success: false, error: 'invalid_transition', from: currentStatus, to: targetStatus };
    }
    let result;
    if (targetStatus === 'Approved')      result = processApproval(sh, bookingRow, bookingIdx, bookingId);
    else if (targetStatus === 'Rejected') result = processRejection(sh, bookingRow, bookingIdx, bookingId);
    else                                  result = processCancellation(sh, bookingRow, bookingIdx, bookingId);
    writeAuditLog('dashboard', targetStatus, bookingId, currentStatus, targetStatus, '');
    return result;
  } finally {
    lock.releaseLock();
  }
}

function processCancellation(logSh, row, rowIdx, bookingId) {
  const TZ_     = 'Asia/Jerusalem';
  const rawDate = row[LOG_COL.DATE - 1];
  const rawTime = row[LOG_COL.TIME - 1];
  const date    = (rawDate instanceof Date)
    ? Utilities.formatDate(rawDate, TZ_, 'yyyy-MM-dd') : String(rawDate || '').trim();
  const time    = (rawTime instanceof Date)
    ? Utilities.formatDate(rawTime, TZ_, 'HH:mm') : String(rawTime || '').trim();
  const phone      = normalizePhone(String(row[LOG_COL.PHONE        - 1] || '').trim());
  const svcName    = String(row[LOG_COL.SERVICE_NAME - 1] || '').trim();
  const calEventId = String(row[LOG_COL.CAL_EVENT    - 1] || '').trim();

  if (calEventId) CalService.deleteEvent(CFG.CAL_ID, calEventId);

  logSh.getRange(rowIdx, LOG_COL.STATUS).setValue('Cancelled');
  SpreadsheetApp.flush();
  updateSlotStatus(date, time, 'Available');
  invalidateSlotsCache(date);

  const msg = [
    '❌ התור שלך ב-' + date + ' בשעה ' + time + ' בוטל.',
    'שירות: ' + svcName, '',
    'ניתן לתאם תור חדש דרך האפליקציה.',
  ].join('\n');

  SmsService.send(phone, msg, 'ClientCancellation');

  Logger.log('[processCancellation] Cancelled: ' + bookingId);
  return { success: true, action: 'CANCEL', bookingId };
}

// ═══════════════════════════════════════════════════════════════
// SERVICE INTERFACES  (IS_TEST_MODE = true → no Twilio / Calendar)
// ═══════════════════════════════════════════════════════════════

/**
 * Flip to true in the GAS editor to run end-to-end test flows
 * without touching real Twilio or Google Calendar.
 * Flip back to false before every production deployment.
 */
const IS_TEST_MODE = true;

const CalService = {
  createEvent(params) {
    if (IS_TEST_MODE) {
      const id = 'MOCK_CAL_' + Date.now();
      Logger.log('[CalService MOCK] createEvent id=' + id + ' params=' + JSON.stringify(params));
      return id;
    }
    return createCalendarEvent(params);
  },
  deleteEvent(calId, eventId) {
    if (IS_TEST_MODE) {
      Logger.log('[CalService MOCK] deleteEvent id=' + eventId);
      return true;
    }
    try {
      const cal = CalendarApp.getCalendarById(calId);
      const ev  = cal ? cal.getEventById(eventId) : null;
      if (ev) { ev.deleteEvent(); Logger.log('[CalService] Deleted: ' + eventId); return true; }
      Logger.log('[CalService] Event not found (already deleted?): ' + eventId);
      return false;
    } catch (e) {
      Logger.log('[CalService] deleteEvent error: ' + e.message);
      return false;
    }
  },
};

const SmsService = {
  send(to, message, context) {
    if (IS_TEST_MODE) {
      Logger.log('[SmsService MOCK] ctx=' + context + ' to=' + to + ' | ' + message.slice(0, 80));
      logSMS(to, context, 'MOCK', message, 'IS_TEST_MODE');
      return;
    }
    if (to === QA_MOCK_PHONE) {
      logSMS(to, context, 'MOCK', message, 'QA mock phone');
      Logger.log('[SmsService] QA phone — logged to SMS_LOG, no Twilio');
      return;
    }
    sendSMS._context = context;
    sendSMS(to, message);
  },
};

// ═══════════════════════════════════════════════════════════════
// ACTION: createBooking  (admin/test — bypasses OTP requirement)
// ═══════════════════════════════════════════════════════════════

/**
 * Creates a Pending booking directly from the admin dashboard or
 * internal test page. Requires a valid ADMIN_TOKEN.
 *
 * Body: { token, name, phone, service, serviceName, date, time, duration? }
 * The slot must exist in Weekly_Slots with status Available.
 */
function handleCreateBooking(body) {
  Logger.log('[createBooking] Invoked — name=' + body.name +
             ' date=' + body.date + ' time=' + body.time);

  if (!validateAdmin(body.token)) {
    Logger.log('[createBooking] REJECTED: unauthorized');
    return { success: false, error: 'unauthorized', code: 403 };
  }

  const required = ['name', 'phone', 'service', 'serviceName', 'date', 'time'];
  const missing  = required.filter(k => !body[k]);
  if (missing.length) {
    Logger.log('[createBooking] Missing fields: ' + missing.join(', '));
    return { success: false, error: 'missing_fields', fields: missing };
  }

  const phone = normalizePhone(body.phone);
  if (!phone) {
    Logger.log('[createBooking] Invalid phone: ' + body.phone);
    return { success: false, error: 'invalid_phone', raw: body.phone };
  }

  const dur  = parseInt(body.duration, 10) || 90;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (_) {
    Logger.log('[createBooking] Lock timeout — slot contested');
    return { success: false, error: 'slot_locked' };
  }

  try {
    Logger.log('[createBooking] Checking slot: ' + body.date + ' ' + body.time);
    const slotRow = findSlotRow(body.date, body.time);
    if (!slotRow) {
      Logger.log('[createBooking] REJECTED: slot not found in Weekly_Slots');
      return { success: false, error: 'slot_not_found', date: body.date, time: body.time };
    }

    const slotStatus = String(slotRow.row[SLOT_COL.STATUS - 1]).trim();
    if (slotStatus !== 'Available') {
      Logger.log('[createBooking] REJECTED: slot status = ' + slotStatus);
      return { success: false, error: 'slot_not_available', currentStatus: slotStatus };
    }

    // Atomically lock slot
    slotsSheet().getRange(slotRow.rowIndex, SLOT_COL.STATUS).setValue('Pending_Lock');
    SpreadsheetApp.flush();
    Logger.log('[createBooking] Slot locked: ' + body.date + ' ' + body.time);

    const bookingId  = uuid4();
    const adminToken = signAdminToken(bookingId);
    const now        = nowISO();

    logSheet().appendRow([
      bookingId, body.name, phone,
      body.service, body.serviceName,
      body.date, body.time, now, dur,
      'Pending', '', adminToken,
    ]);
    SpreadsheetApp.flush();
    Logger.log('[createBooking] Row written — id=' + bookingId);

    writeAuditLog('admin', 'CreateBooking', bookingId, '', 'Pending',
                  body.name + ' | ' + body.date + ' ' + body.time);

    // In test mode, simulate the admin-notification SMS so the QA console
    // shows a full flow (booking + notification) without touching Twilio.
    if (IS_TEST_MODE) {
      let adminTo;
      try { adminTo = CFG.ADMIN_PHONE; } catch (_) { adminTo = 'ADMIN_TEST'; }
      const adminMsg = [
        '📅 [TEST] הזמנה חדשה ממתינה לאישור:',
        'שם: ' + body.name,
        'טלפון: ' + formatPhone(phone),
        'שירות: ' + body.serviceName,
        'תאריך: ' + body.date + ' בשעה ' + body.time,
        'מזהה: ' + bookingId,
      ].join('\n');
      SmsService.send(adminTo, adminMsg, 'AdminNotify');
      Logger.log('[createBooking] TEST MODE - admin notification simulated to SMS_LOG');
    }

    return {
      success: true, bookingId, status: 'Pending',
      name: body.name, date: body.date, time: body.time,
    };

  } finally {
    lock.releaseLock();
  }
}

/**
 * doPost endpoint wrapper for runFullFlowTest.
 * Requires ADMIN_TOKEN — cannot be triggered anonymously.
 */
function handleRunFlowTest(body) {
  if (!validateAdmin(body.token)) {
    return { success: false, error: 'unauthorized', code: 403 };
  }
  return runFullFlowTest();
}

// ===============================================================
// COLUMN-MAPPING UNIT TEST  (run from the GAS editor)
// ===============================================================

/**
 * Verifies the LOG_COL / SLOT_COL mapping objects are internally
 * consistent (no gaps, no duplicate indices) and that the live sheets
 * are at least as wide as the mapping expects. Touches no Twilio/Calendar.
 */
function testColumnMapping() {
  let passed = 0, failed = 0;
  function assert(label, cond, detail) {
    cond ? passed++ : failed++;
    Logger.log((cond ? 'PASS' : 'FAIL') + ' - ' + label + (detail ? ' | ' + detail : ''));
  }

  Logger.log('');
  Logger.log('============== testColumnMapping START ==============');

  // -- LOG_COL integrity --
  const logVals = Object.keys(LOG_COL).map(function (k) { return LOG_COL[k]; });
  assert('LOG_COL has 12 entries', logVals.length === 12, 'got ' + logVals.length);
  assert('LOG_COL indices are unique', new Set(logVals).size === logVals.length);
  assert('LOG_COL covers 1..12',
    logVals.slice().sort(function (a, b) { return a - b; }).join(',') === '1,2,3,4,5,6,7,8,9,10,11,12');
  assert('LOG_COL.UUID = 1',         LOG_COL.UUID === 1);
  assert('LOG_COL.STATUS = 10',      LOG_COL.STATUS === 10);
  assert('LOG_COL.CAL_EVENT = 11',   LOG_COL.CAL_EVENT === 11);
  assert('LOG_COL.ADMIN_TOKEN = 12', LOG_COL.ADMIN_TOKEN === 12);

  // -- SLOT_COL integrity --
  const slotVals = Object.keys(SLOT_COL).map(function (k) { return SLOT_COL[k]; });
  assert('SLOT_COL has 5 entries', slotVals.length === 5, 'got ' + slotVals.length);
  assert('SLOT_COL indices are unique', new Set(slotVals).size === slotVals.length);
  assert('SLOT_COL covers 1..5',
    slotVals.slice().sort(function (a, b) { return a - b; }).join(',') === '1,2,3,4,5');
  assert('SLOT_COL.STATUS = 5', SLOT_COL.STATUS === 5);

  // -- Live sheet width --
  try {
    const logSh = logSheet();
    Logger.log('[testColumnMapping] Bookings_Log headers: ' +
               JSON.stringify(logSh.getRange(1, 1, 1, logSh.getLastColumn()).getValues()[0]));
    assert('Bookings_Log has >= 12 columns', logSh.getLastColumn() >= 12,
           'lastColumn=' + logSh.getLastColumn());

    const slotSh = slotsSheet();
    Logger.log('[testColumnMapping] Weekly_Slots headers: ' +
               JSON.stringify(slotSh.getRange(1, 1, 1, slotSh.getLastColumn()).getValues()[0]));
    assert('Weekly_Slots has >= 5 columns', slotSh.getLastColumn() >= 5,
           'lastColumn=' + slotSh.getLastColumn());
  } catch (e) {
    Logger.log('Live sheet width check skipped: ' + e.message);
    failed++;
  }

  Logger.log('');
  Logger.log('============== RESULTS: ' + passed + ' passed, ' + failed + ' failed ==============');
  return { passed: passed, failed: failed };
}

// ===============================================================
// END-TO-END FLOW TEST  (create -> approve -> cancel -> verify)
// ===============================================================

/** Finds a Bookings_Log row by UUID. Returns { row, rowIndex } or null. */
function findBookingRow(logSh, bookingId) {
  const data = logSh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][LOG_COL.UUID - 1]).trim() === bookingId) {
      return { row: data[r], rowIndex: r + 1 };
    }
  }
  return null;
}

/**
 * Runs a complete booking lifecycle end-to-end and returns a step-by-step
 * report. Seeds its own Weekly_Slots row, so it needs no pre-existing data.
 *
 *   create  -> Pending   + slot Pending_Lock
 *   approve -> Approved  + slot Booked      + CalendarEventId stored
 *   cancel  -> Cancelled + slot Available
 *   audit   -> Audit_Log holds all three actions for the booking
 *
 * All test data is removed in the finally block. Safe to run repeatedly.
 * Returns { passed, failed, sheetsOk, steps: [{ label, ok, detail }] }.
 */
function runFullFlowTest() {
  const TZ     = 'Asia/Jerusalem';
  const report = { passed: 0, failed: 0, sheetsOk: false, steps: [] };
  function step(label, ok, detail) {
    ok = !!ok;
    ok ? report.passed++ : report.failed++;
    report.steps.push({ label: label, ok: ok, detail: detail || '' });
    Logger.log((ok ? 'PASS' : 'FAIL') + ' - ' + label + (detail ? ' | ' + detail : ''));
  }

  Logger.log('');
  Logger.log('============== runFullFlowTest START (IS_TEST_MODE=' + IS_TEST_MODE + ') ==============');

  const adminToken = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!adminToken) {
    step('ADMIN_TOKEN script property is set', false,
         'add it in Project Settings -> Script Properties');
    Logger.log('============== runFullFlowTest ABORTED ==============');
    return report;
  }

  const day      = new Date(); day.setDate(day.getDate() + 75);
  const testDate = Utilities.formatDate(day, TZ, 'yyyy-MM-dd');
  const testTime = '07:30';
  const slotSh   = slotsSheet();
  const logSh    = logSheet();
  let bookingId  = null;

  try {
    // -- Step 1: seed an Available slot --
    slotSh.appendRow([testDate, 'TEST', testTime, '09:00', 'Available']);
    SpreadsheetApp.flush();
    step('1. Test slot seeded (Available)', findSlotRow(testDate, testTime) !== null,
         testDate + ' ' + testTime);

    // -- Step 2: createBooking --
    const cRes = handleCreateBooking({
      token: adminToken, name: 'E2E-FlowTest', phone: '0500000000',
      service: 'gel_classic', serviceName: 'E2E Test',
      date: testDate, time: testTime, duration: 90,
    });
    bookingId = cRes.bookingId || null;
    step('2. createBooking -> Pending',
         cRes.success === true && cRes.status === 'Pending', 'id=' + bookingId);

    const s2 = findSlotRow(testDate, testTime);
    step('2b. Slot locked -> Pending_Lock',
         !!s2 && String(s2.row[SLOT_COL.STATUS - 1]).trim() === 'Pending_Lock',
         s2 ? String(s2.row[SLOT_COL.STATUS - 1]).trim() : 'slot missing');

    // -- Step 3: approve --
    const aRes = handleChangeStatus({ token: adminToken, bookingId: bookingId, targetStatus: 'Approved' });
    step('3. changeStatus -> Approved', aRes.success === true,
         aRes.error || ('cal=' + aRes.calEventId));

    const bA = findBookingRow(logSh, bookingId);
    step('3b. Bookings_Log row -> Approved',
         !!bA && String(bA.row[LOG_COL.STATUS - 1]).trim() === 'Approved');
    step('3c. CalendarEventId stored',
         !!bA && String(bA.row[LOG_COL.CAL_EVENT - 1]).trim().length > 0,
         bA ? String(bA.row[LOG_COL.CAL_EVENT - 1]).trim() : '');

    const s3 = findSlotRow(testDate, testTime);
    step('3d. Slot -> Booked',
         !!s3 && String(s3.row[SLOT_COL.STATUS - 1]).trim() === 'Booked',
         s3 ? String(s3.row[SLOT_COL.STATUS - 1]).trim() : 'slot missing');

    // -- Step 4: cancel --
    const xRes = handleChangeStatus({ token: adminToken, bookingId: bookingId, targetStatus: 'Cancelled' });
    step('4. changeStatus -> Cancelled', xRes.success === true, xRes.error || '');

    const bX = findBookingRow(logSh, bookingId);
    step('4b. Bookings_Log row -> Cancelled',
         !!bX && String(bX.row[LOG_COL.STATUS - 1]).trim() === 'Cancelled');

    const s4 = findSlotRow(testDate, testTime);
    step('4c. Slot released -> Available',
         !!s4 && String(s4.row[SLOT_COL.STATUS - 1]).trim() === 'Available',
         s4 ? String(s4.row[SLOT_COL.STATUS - 1]).trim() : 'slot missing');

    // -- Step 5: audit trail --
    const auditData = auditSheet().getDataRange().getValues();
    const actions   = [];
    for (let r = 1; r < auditData.length; r++) {
      if (String(auditData[r][3]).trim() === bookingId) actions.push(String(auditData[r][2]).trim());
    }
    step('5. Audit_Log: CreateBooking logged', actions.indexOf('CreateBooking') !== -1, actions.join(', '));
    step('5b. Audit_Log: Approved logged',     actions.indexOf('Approved') !== -1);
    step('5c. Audit_Log: Cancelled logged',    actions.indexOf('Cancelled') !== -1);

  } catch (e) {
    step('UNCAUGHT EXCEPTION', false, e.message);
    Logger.log(e.stack);
  } finally {
    // -- Cleanup: remove the test booking + slot rows --
    try {
      if (bookingId) {
        const ld = logSh.getDataRange().getValues();
        for (let r = ld.length - 1; r >= 1; r--) {
          if (String(ld[r][LOG_COL.UUID - 1]).trim() === bookingId) { logSh.deleteRow(r + 1); break; }
        }
      }
      const sd = slotSh.getDataRange().getValues();
      for (let r = sd.length - 1; r >= 1; r--) {
        const rd = sd[r][SLOT_COL.DATE - 1];
        const rs = sd[r][SLOT_COL.START - 1];
        const d  = (rd instanceof Date) ? Utilities.formatDate(rd, TZ, 'yyyy-MM-dd') : String(rd).trim();
        const s  = (rs instanceof Date) ? Utilities.formatDate(rs, TZ, 'HH:mm')      : String(rs).trim();
        if (d === testDate && s === testTime) { slotSh.deleteRow(r + 1); break; }
      }
      SpreadsheetApp.flush();
      Logger.log('[runFullFlowTest] Cleanup complete');
    } catch (ce) {
      Logger.log('[runFullFlowTest] Cleanup error: ' + ce.message);
    }
  }

  report.sheetsOk = report.failed === 0;
  Logger.log('');
  Logger.log('============== FLOW REPORT ==============');
  Logger.log('Passed: ' + report.passed + '  |  Failed: ' + report.failed);
  Logger.log(report.sheetsOk
    ? 'ALL SHEETS UPDATED CORRECTLY'
    : 'SHEET MISMATCH - see FAIL lines above');
  Logger.log('============== runFullFlowTest END ==============');
  return report;
}

/**
 * doPost wrapper for runFullFlowTest - lets the QA console trigger the full
 * lifecycle test over HTTP. Admin-token guarded; refuses to run when
 * IS_TEST_MODE is false so production Twilio/Calendar are never touched.
 * Body: { token }
 */
function handleRunFlowTest(body) {
  if (!validateAdmin(body.token)) {
    return { success: false, error: 'unauthorized', code: 403 };
  }
  if (!IS_TEST_MODE) {
    return {
      success: false, error: 'flow_test_disabled',
      detail: 'Set IS_TEST_MODE = true in Code.gs to enable the E2E flow test.',
    };
  }
  const report = runFullFlowTest();
  return { success: report.sheetsOk, report: report };
}
