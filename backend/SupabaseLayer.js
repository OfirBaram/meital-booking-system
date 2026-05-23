// ══════════════════════════════════════════════════════════════
// SupabaseLayer.js — Supabase / PostgREST integration layer
// Loaded alongside Code.js in the same GAS project; all
// identifiers are global (GAS shares scope across all script files).
//
// Design rule: Supabase is the source of truth.
//   Google Sheets is a best-effort mirror for Meital's visibility.
//   A failed Sheet write is logged and silently discarded — it
//   never rolls back or prevents a successful Supabase operation.
//
// New Script Properties required:
//   SUPABASE_URL  — https://<project-ref>.supabase.co
//   SUPABASE_KEY  — service_role key (server-side only, never frontend)
// ══════════════════════════════════════════════════════════════════

// ─── SupabaseService ─────────────────────────────────────────────
// Low-level PostgREST REST client.  Returns parsed JSON or null on error.
var SupabaseService = (function () {

  function _props() {
    var p = PropertiesService.getScriptProperties();
    return { url: p.getProperty('SUPABASE_URL'), key: p.getProperty('SUPABASE_KEY') };
  }

  function _headers(extra) {
    var p = _props();
    var h = {
      'apikey':        p.key,
      'Authorization': 'Bearer ' + p.key,
      'Content-Type':  'application/json',
    };
    if (extra) {
      Object.keys(extra).forEach(function (k) { if (extra[k] != null) h[k] = extra[k]; });
    }
    return h;
  }

  function _call(method, path, payload, extraHeaders) {
    var p = _props();
    if (!p.url || !p.key) {
      Logger.log('[Supabase] SUPABASE_URL or SUPABASE_KEY not set — skipping ' + method + ' ' + path);
      return null;
    }
    var opts = { method: method, headers: _headers(extraHeaders), muteHttpExceptions: true };
    if (payload !== undefined && payload !== null) {
      opts.payload = JSON.stringify(payload);
    }
    try {
      var _tFetch = Date.now();
      var res  = UrlFetchApp.fetch(p.url + path, opts);
      var code = res.getResponseCode();
      var body = res.getContentText('UTF-8');
      Logger.log('[PERF][Supabase] ' + method + ' ' + path.split('?')[0] + ' HTTP=' + code + ' ' + (Date.now() - _tFetch) + 'ms');
      if (code >= 400) {
        Logger.log('[Supabase] ' + method + ' ' + path + ' → HTTP ' + code + ': ' + body.slice(0, 300));
        return null;
      }
      try { return body ? JSON.parse(body) : null; } catch (_) { return null; }
    } catch (e) {
      Logger.log('[Supabase] network error on ' + method + ' ' + path + ': ' + e.message);
      return null;
    }
  }

  return {
    /**
     * SELECT — GET /rest/v1/{table}?{query}
     * query: PostgREST filter string, e.g. 'status=eq.available&order=start_time.asc'
     */
    select: function (table, query) {
      return _call('GET', '/rest/v1/' + table + (query ? '?' + query : ''), null);
    },

    /**
     * INSERT — POST /rest/v1/{table}
     * upsertKey: column name for ON CONFLICT resolution (optional).
     * Returns inserted/upserted row(s).
     */
    insert: function (table, data, upsertKey) {
      var prefer = 'return=representation';
      var extra  = { 'Prefer': prefer };
      var path   = '/rest/v1/' + table;
      if (upsertKey) {
        extra['Prefer'] += ',resolution=merge-duplicates';
        path += '?on_conflict=' + encodeURIComponent(upsertKey);
      }
      return _call('POST', path, data, extra);
    },

    /**
     * UPDATE — PATCH /rest/v1/{table}?{match}
     * match: PostgREST filter string, e.g. 'id=eq.some-uuid'
     * Returns updated row(s).
     */
    update: function (table, match, data) {
      return _call('PATCH', '/rest/v1/' + table + '?' + match, data,
        { 'Prefer': 'return=representation' });
    },

    /** DELETE — DELETE /rest/v1/{table}?{match} */
    delete: function (table, match) {
      return _call('DELETE', '/rest/v1/' + table + '?' + match, null);
    },

    /**
     * RPC — POST /rest/v1/rpc/{fn}
     * Calls a PostgreSQL function.  Functions that use SELECT FOR UPDATE
     * run inside a single transaction, preventing race conditions.
     */
    rpc: function (fnName, params) {
      return _call('POST', '/rest/v1/rpc/' + fnName, params || {});
    },
  };
})();

// ─── SheetMirrorService ───────────────────────────────────────────
// Best-effort Google Sheets mirror.
// Every public method catches all exceptions internally.
var SheetMirrorService = (function () {

  function safe(label, fn) {
    try { fn(); }
    catch (e) {
      Logger.log('[SheetMirror] ' + label + ' failed (non-fatal): ' + e.message);
    }
  }

  return {
    /** Write or overwrite a Bookings_Log row identified by UUID. */
    upsertBooking: function (b) {
      safe('upsertBooking', function () {
        var sh   = bookingsSheet();
        var data = sh.getDataRange().getValues();
        for (var r = 1; r < data.length; r++) {
          if (String(data[r][0]) === b.id) {
            sh.getRange(r + 1, LOG_COL.STATUS).setValue(b.status || '');
            if (b.calendar_event_id) {
              sh.getRange(r + 1, LOG_COL.CAL_EVENT).setValue(b.calendar_event_id);
            }
            SpreadsheetApp.flush();
            return;
          }
        }
        var _sbRow = sh.getLastRow() + 1;
        sh.getRange(_sbRow, LOG_COL.DATE, 1, 2).setNumberFormat('@');
        sh.getRange(_sbRow, 1, 1, 12).setValues([[
          b.id,
          b.client_name        || '',
          b.client_phone       || '',
          b.treatment_type     || '',
          b.treatment_name     || '',
          toDateStr(b.date_label  || ''),
          toTimeStr(b.time_label  || ''),
          b.created_at         || Utilities.formatDate(new Date(), 'Asia/Jerusalem', "yyyy-MM-dd'T'HH:mm:ssXXX"),
          b.duration_min       || '',
          b.status             || 'Pending',
          b.calendar_event_id  || '',
          b.admin_token        || '',
        ]]);
        SpreadsheetApp.flush();
      });
    },

    /** Mirror a slot status change to Weekly_Slots by matching date+time. */
    updateSlotStatus: function (startTimeISO, newStatus) {
      safe('updateSlotStatus', function () {
        var sh   = slotsSheet();
        var data = sh.getDataRange().getValues();
        // Convert incoming ISO (may be UTC from Supabase) to Jerusalem local for matching
        var dt = new Date(startTimeISO);
        var targetPrefix = Utilities.formatDate(dt, 'Asia/Jerusalem', 'yyyy-MM-dd') + 'T' +
                           Utilities.formatDate(dt, 'Asia/Jerusalem', 'HH:mm');
        for (var r = 1; r < data.length; r++) {
          var d = _isoDate(data[r][SLOT_COL.DATE  - 1]);
          var t = _fmtTime(data[r][SLOT_COL.START - 1]);
          if ((d + 'T' + t) === targetPrefix) {
            sh.getRange(r + 1, SLOT_COL.STATUS).setValue(newStatus);
            SpreadsheetApp.flush();
            return;
          }
        }
        Logger.log('[SheetMirror] updateSlotStatus: no Sheet row matched ' + startTimeISO);
      });
    },

    /**
     * Mirror a new (or status-changed) slot into Weekly_Slots.
     * Idempotent: if a row for the same date+time already exists, only the
     * status is updated; the Day column is preserved.  If no row exists, a
     * new one is appended with all five columns populated.
     *
     * Uses getDisplayValues() per the documented Date Reading Rule to avoid
     * the 1899-epoch issue when scanning the date/time columns.
     *
     * @param {string} startTimeISO  UTC ISO from Supabase slots.start_time
     * @param {string} endTimeISO    UTC ISO from Supabase slots.end_time
     * @param {string} sbStatus      Supabase status: available|booked|pending|locked
     */
    upsertSlot: function (startTimeISO, endTimeISO, sbStatus) {
      safe('upsertSlot', function () {
        var TZ = 'Asia/Jerusalem';
        var dt = new Date(startTimeISO);
        var dateStr = Utilities.formatDate(dt, TZ, 'yyyy-MM-dd');
        var timeStr = Utilities.formatDate(dt, TZ, 'HH:mm');
        var endStr  = Utilities.formatDate(new Date(endTimeISO), TZ, 'HH:mm');
        var dayHe   = ['\u05E8\u05D0\u05E9\u05D5\u05DF','\u05E9\u05E0\u05D9','\u05E9\u05DC\u05D9\u05E9\u05D9','\u05E8\u05D1\u05D9\u05E2\u05D9','\u05D7\u05DE\u05D9\u05E9\u05D9','\u05E9\u05D9\u05E9\u05D9','\u05E9\u05D1\u05EA'][dt.getDay()];
        var sheetStatus = ({
          available: 'Available',
          booked:    'Booked',
          pending:   'Pending_Lock',
          locked:    'Blocked',
        })[sbStatus] || 'Available';

        var sh   = slotsSheet();
        var data = sh.getDataRange().getDisplayValues();
        for (var r = 1; r < data.length; r++) {
          var d = String(data[r][SLOT_COL.DATE  - 1]).trim();
          var t = String(data[r][SLOT_COL.START - 1]).trim();
          if (d === dateStr && t === timeStr) {
            sh.getRange(r + 1, SLOT_COL.STATUS).setValue(sheetStatus);
            SpreadsheetApp.flush();
            Logger.log('[SheetMirror] upsertSlot: updated row ' + (r + 1) +
                       ' (' + dateStr + ' ' + timeStr + ') -> ' + sheetStatus);
            return;
          }
        }
        var newRow = sh.getLastRow() + 1;
        var rng    = sh.getRange(newRow, 1, 1, 5);
        rng.setNumberFormat('@');
        rng.setValues([[dateStr, dayHe, timeStr, endStr, sheetStatus]]);
        SpreadsheetApp.flush();
        Logger.log('[SheetMirror] upsertSlot: appended ' + dateStr + ' ' + timeStr +
                   ' ' + sheetStatus + ' (row ' + newRow + ')');
      });
    },

    /** Mirror an SMS event to the SMS_LOG sheet. */
    logSms: function (entry) {
      safe('logSms', function () {
        smsLogSheet().appendRow([
          new Date(),
          entry.recipient_phone || '',
          entry.context         || '',
          entry.status          || '',
          entry.message_body    || '',
          entry.detail          || '',
        ]);
        SpreadsheetApp.flush();
      });
    },
  };
})();

// ─── CommunicationLogService ──────────────────────────────────────
// Writes to Supabase communication_logs AND mirrors to SMS_LOG sheet.
// Call this instead of logSMS() when IS_SUPABASE_ENABLED = true.
var CommunicationLogService = (function () {
  return {
    log: function (entry) {
      // 1. Supabase write (non-fatal)
      try {
        SupabaseService.insert('communication_logs', {
          appointment_id:  entry.appointment_id || null,
          channel:         entry.channel        || 'sms',
          recipient_phone: entry.recipient_phone,
          context:         entry.context,
          status:          entry.status,
          message_body:    String(entry.message_body || '').slice(0, 2000),
          detail:          String(entry.detail       || '').slice(0, 500),
        });
      } catch (e) {
        Logger.log('[CommLog] Supabase insert failed (non-fatal): ' + e.message);
      }
      // 2. Sheet mirror (always)
      SheetMirrorService.logSms(entry);
    },
  };
})();

// ══════════════════════════════════════════════════════════════════
// V2 HANDLER FUNCTIONS  (active when IS_SUPABASE_ENABLED = true)
// ══════════════════════════════════════════════════════════════════

// ─── handleGetSlotsV2 ─────────────────────────────────────────────
function handleGetSlotsV2(body) {
  if (!body) { Logger.log('[ERROR] handleGetSlotsV2: body is undefined'); return { success: false, error: 'missing_payload' }; }
  var _tV2 = Date.now();
  var year  = parseInt(body.year,  10) || new Date().getFullYear();
  var month = parseInt(body.month, 10) || (new Date().getMonth() + 1);

  var from    = year + '-' + _sb_pad(month) + '-01T00:00:00+00:00';
  var lastDay = new Date(year, month, 0).getDate();
  var to      = year + '-' + _sb_pad(month) + '-' + _sb_pad(lastDay) + 'T23:59:59+00:00';

  var _tSBSelect = Date.now();
  var rows = SupabaseService.select('slots',
    'start_time=gte.' + from +
    '&start_time=lte.' + to +
    '&status=eq.available' +
    '&order=start_time.asc' +
    '&select=id,start_time');
  Logger.log('[PERF][getSlotsV2] Supabase select=' + (Date.now() - _tSBSelect) + 'ms, rows=' + (rows ? rows.length : 'null'));

  if (!rows) return { success: false, error: 'supabase_unavailable' };

  var grouped = {};
  rows.forEach(function (row) {
    var dt  = new Date(row.start_time);
    var dow = dt.getDay();
    if (dow === 5 || dow === 6) return; // Fri / Sat — never show
    var date = Utilities.formatDate(dt, 'Asia/Jerusalem', 'yyyy-MM-dd');
    var time = Utilities.formatDate(dt, 'Asia/Jerusalem', 'HH:mm');
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(time);
  });

  Logger.log('[PERF][getSlotsV2] total=' + (Date.now() - _tV2) + 'ms');
  return { success: true, slots: grouped };
}

function _sb_pad(n) { return n < 10 ? '0' + n : '' + n; }

// Convert a Jerusalem-local date+time to a UTC ISO 8601 string (.toISOString()).
// Uses Utilities.formatDate to probe the DST offset (+02:00 winter / +03:00 summer)
// then subtracts the offset to get the true UTC milliseconds before calling toISOString().
// This guarantees a format like '2026-05-24T06:00:00.000Z' that PostgreSQL always accepts.
function _sb_localToUtcIso(dateYmd, timeHm) {
  var noon = new Date(dateYmd + 'T12:00:00Z'); // probe DST offset on this specific date
  var offStr = Utilities.formatDate(noon, 'Asia/Jerusalem', 'Z'); // '+0300' or '+0200'
  var sign = offStr.charAt(0) === '-' ? -1 : 1;
  var offsetMins = sign * (parseInt(offStr.slice(1, 3), 10) * 60 + parseInt(offStr.slice(3, 5), 10));
  var hm = timeHm.split(':');
  var utcMs = Date.UTC(
    parseInt(dateYmd.slice(0, 4), 10),
    parseInt(dateYmd.slice(5, 7), 10) - 1,
    parseInt(dateYmd.slice(8, 10), 10),
    parseInt(hm[0], 10),
    parseInt(hm[1] || '0', 10)
  ) - offsetMins * 60000;
  return new Date(utcMs).toISOString();
}

// ─── handleSendOTPV2 ──────────────────────────────────────────────
function handleSendOTPV2(body) {
  var rawPhone = String(body.phone || '').trim();
  var phone    = normalizePhone(rawPhone);
  if (!phone) return { success: false, error: 'invalid_phone' };
  if (!checkSmsQuota()) return { success: false, error: 'rate_limited' };

  var clientName = String(body.name || '').trim();

  // Upsert client record (phone is the unique key)
  SupabaseService.insert('clients', { phone: phone, full_name: clientName || '' }, 'phone');

  var otp = _sb_otp();
  CacheService.getScriptCache().put('otp_' + phone, JSON.stringify({
    otp: otp, name: clientName, phone: phone,
  }), 300);

  SmsService.send(phone, 'קוד האימות שלך: ' + otp, 'OTP');
  return { success: true };
}

function _sb_otp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── handleVerifyAndBookV2 ────────────────────────────────────────
// Verifies OTP then calls lock_slot_for_booking RPC (atomic PostgreSQL
// SELECT FOR UPDATE transaction — exactly one winner per slot).
function handleVerifyAndBookV2(body) {
  var otp       = String(body.otp       || '').trim();
  var slotId    = parseInt(body.slotId, 10); // Supabase slots.id (int8)
  var service   = String(body.service   || '').trim();
  var bookingId = String(body.bookingId || uuid4());
  var rawPhone  = String(body.phone     || '').trim();
  var phone     = normalizePhone(rawPhone);

  if (!otp || !slotId || !service || !phone) {
    return { success: false, error: 'missing_params' };
  }

  var VALID_SERVICES = { gel_classic: { name: "לק ג'ל קלאסי", duration: 90 },
                         gel_feet:    { name: "לק ג'ל רגליים", duration: 120 } };
  var svc = VALID_SERVICES[service];
  if (!svc) return { success: false, error: 'invalid_service' };

  // Validate OTP (single-use; deleted from cache immediately)
  var cacheKey = 'otp_' + phone;
  var cached   = CacheService.getScriptCache().get(cacheKey);
  if (!cached) return { success: false, error: 'otp_expired' };
  var otpData  = JSON.parse(cached);
  if (otpData.otp !== otp) return { success: false, error: 'invalid_otp' };
  CacheService.getScriptCache().remove(cacheKey);

  // Look up client
  var clients = SupabaseService.select('clients',
    'phone=eq.' + encodeURIComponent(phone) + '&select=id');
  if (!clients || !clients.length) return { success: false, error: 'client_not_found' };

  var props      = PropertiesService.getScriptProperties();
  var hmacSecret = props.getProperty('HMAC_SECRET');
  var adminToken = _sb_hmac(bookingId, hmacSecret);

  // ── Atomic booking ────────────────────────────────────────────
  var result = SupabaseService.rpc('lock_slot_for_booking', {
    p_slot_id:        slotId,
    p_client_id:      clients[0].id,
    p_booking_id:     bookingId,
    p_treatment_type: service,
    p_treatment_name: svc.name,
    p_duration_min:   svc.duration,
    p_admin_token:    adminToken,
  });

  if (!result || !result.success) {
    var err = result ? (result.error || 'booking_failed') : 'supabase_unavailable';
    return { success: false, error: err };
  }

  // Fetch slot start time for labels
  var slotRows  = SupabaseService.select('slots', 'id=eq.' + slotId + '&select=start_time');
  var startDt   = slotRows && slotRows[0] ? new Date(slotRows[0].start_time) : new Date();
  var dateLabel = Utilities.formatDate(startDt, 'Asia/Jerusalem', 'yyyy-MM-dd');
  var timeLabel = Utilities.formatDate(startDt, 'Asia/Jerusalem', 'HH:mm');

  // Mirror to Bookings_Log sheet
  SheetMirrorService.upsertBooking({
    id:             bookingId,
    client_name:    otpData.name  || '',
    client_phone:   phone,
    treatment_type: service,
    treatment_name: svc.name,
    date_label:     dateLabel,
    time_label:     timeLabel,
    duration_min:   svc.duration,
    status:         'Pending',
    admin_token:    adminToken,
  });

  // Admin notification SMS
  var adminPhone = props.getProperty('ADMIN_PHONE');
  var webUrl     = props.getProperty('WEB_APP_URL') || '';
  var approveUrl = webUrl + '?action=adminAction&bookingId=' + bookingId + '&decision=Approved&token=' + adminToken;
  var rejectUrl  = webUrl + '?action=adminAction&bookingId=' + bookingId + '&decision=Rejected&token='  + adminToken;
  var adminMsg   = [
    '\u{1F4C5} בקשת תור חדשה!',
    (otpData.name || '') + ' | ' + phone,
    dateLabel.replace(/-/g, '/') + ' ב-' + timeLabel,
    '✅ אשר: ' + approveUrl,
    '❌ דחה: ' + rejectUrl,
  ].join('\n');
  if (adminPhone) SmsService.send(adminPhone, adminMsg, 'AdminNotify');

  log(LOG_LEVEL.INFO, ACTION.CREATE_BOOKING, 'הזמנה נוצרה (Supabase)',
      { phone: phone, bookingId: bookingId });

  return {
    success:   true,
    bookingId: bookingId,
    date:      dateLabel,
    time:      timeLabel,
    name:      otpData.name || '',
    service:   svc.name,
  };
}

// ─── handleAdminActionV2 ─────────────────────────────────────────
// Approve or reject a booking: updates Supabase + mirrors to Sheets.
function handleAdminActionV2(body) {
  var bookingId = String(body.bookingId || body.id || '').trim();
  var decision  = String(body.decision  || '').trim(); // 'Approved' | 'Rejected'
  var token     = String(body.token     || '').trim();

  if (!bookingId || !token) return { success: false, error: 'missing_params' };

  var hmacSecret = PropertiesService.getScriptProperties().getProperty('HMAC_SECRET');
  if (!_sb_verifyHmac(bookingId, token, hmacSecret)) {
    return { success: false, error: 'invalid_token' };
  }
  if (decision !== 'Approved' && decision !== 'Rejected') {
    return { success: false, error: 'invalid_decision' };
  }

  var appts = SupabaseService.select('appointments', 'id=eq.' + bookingId + '&select=*');
  if (!appts || !appts.length) return { success: false, error: 'booking_not_found' };
  var appt = appts[0];

  if (appt.status !== 'pending') {
    return { success: false, error: 'already_processed', current_status: appt.status };
  }

  var clientRows = SupabaseService.select('clients',
    'id=eq.' + appt.client_id + '&select=phone,full_name');
  var client = clientRows && clientRows[0];

  var slotRows = SupabaseService.select('slots',
    'id=eq.' + appt.slot_id + '&select=start_time,end_time');
  var slot    = slotRows && slotRows[0];
  var startDt = slot ? new Date(slot.start_time) : new Date();
  var endDt   = slot ? new Date(slot.end_time)   : new Date();

  var newApptStatus = decision === 'Approved' ? 'approved' : 'rejected';
  var newSlotStatus = decision === 'Approved' ? 'booked'   : 'available';
  var calEventId    = null;

  if (decision === 'Approved') {
    try {
      var calResult = CalService.createEvent({
        summary:     (client ? client.full_name : '') + ' — ' + appt.treatment_name,
        description: 'טלפון: ' + (client ? client.phone : '') +
                     '\nשירות: ' + appt.treatment_name +
                     '\nID: ' + bookingId,
        startTime:   startDt,
        endTime:     endDt,
      });
      // createCalendarEvent returns the event ID as a string (or throws).
      calEventId = calResult || null;
    } catch (e) {
      Logger.log('[handleAdminActionV2] Calendar error (non-fatal): ' + e.message);
    }
  }

  // Update appointment in Supabase
  SupabaseService.update('appointments', 'id=eq.' + bookingId, {
    status:            newApptStatus,
    calendar_event_id: calEventId || null,
  });

  // Update slot in Supabase
  SupabaseService.update('slots', 'id=eq.' + appt.slot_id, {
    status:       newSlotStatus,
    last_updated: new Date().toISOString(),
  });

  // Mirror to Sheets
  if (slot) SheetMirrorService.updateSlotStatus(slot.start_time,
    decision === 'Approved' ? 'Booked' : 'Available');

  SheetMirrorService.upsertBooking({
    id:                bookingId,
    client_name:       client ? client.full_name : '',
    client_phone:      client ? client.phone     : '',
    treatment_type:    appt.treatment_type,
    treatment_name:    appt.treatment_name,
    date_label:        Utilities.formatDate(startDt, 'Asia/Jerusalem', 'yyyy-MM-dd'),
    time_label:        Utilities.formatDate(startDt, 'Asia/Jerusalem', 'HH:mm'),
    duration_min:      appt.duration_min,
    status:            decision,
    calendar_event_id: calEventId || '',
    admin_token:       token,
  });

  // Client SMS
  if (client && isAutoSmsEnabled()) {
    var dateStr = Utilities.formatDate(startDt, 'Asia/Jerusalem', 'dd/MM/yyyy');
    var timeStr = Utilities.formatDate(startDt, 'Asia/Jerusalem', 'HH:mm');
    var clientMsg = decision === 'Approved'
      ? 'שלום ' + client.full_name + '! התור שלך ב-' +
        dateStr + ' בשעה ' + timeStr + ' אושר ✅'
      : 'שלום ' + client.full_name + ', לצערנו התור שלך נדחה.';
    SmsService.send(client.phone, clientMsg,
      decision === 'Approved' ? 'ClientApproval' : 'ClientRejection');
  } else if (client) {
    Logger.log('[handleAdminActionV2] Auto-SMS disabled or no client phone');
  }

  log(LOG_LEVEL.INFO,
      decision === 'Approved' ? ACTION.APPROVED : ACTION.REJECTED,
      decision === 'Approved' ? 'הזמנה אושרה' : 'הזמנה נדחתה',
      { bookingId: bookingId, phone: client ? client.phone : '' });

  return { success: true, decision: decision, bookingId: bookingId };
}

// ─── handleMigrateToSupabase ─────────────────────────────────────
// One-time migration: seeds Supabase from the existing Google Sheets.
// Idempotent — slots use ON CONFLICT on start_time; clients on phone;
// appointments on their UUID primary key.
function handleMigrateToSupabase(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized', code: 403 };

  var report = { slotsInserted: 0, clientsInserted: 0, appointmentsInserted: 0, errors: [] };
  var TZ = 'Asia/Jerusalem';

  // ── 1. Migrate Weekly_Slots ──────────────────────────────────
  try {
    var slotData = slotsSheet().getDataRange().getValues();
    var STATUS_MAP = {
      available: 'available', blocked: 'blocked', booked: 'booked',
      pending_lock: 'locked', cancelled: 'available',
    };
    for (var r = 1; r < slotData.length; r++) {
      var row    = slotData[r];
      var date   = _isoDate(row[SLOT_COL.DATE  - 1]);
      var sTime  = _fmtTime(row[SLOT_COL.START - 1]);
      var eTime  = _fmtTime(row[SLOT_COL.END   - 1]);
      var status = String(row[SLOT_COL.STATUS  - 1] || '').trim().toLowerCase();
      if (!date || !sTime) continue;
      // Default end_time to start + 90 min when End_Time column is absent or equal to start
      if (!eTime || eTime === sTime) {
        var _hm = sTime.split(':');
        var _mins = parseInt(_hm[0], 10) * 60 + parseInt(_hm[1], 10) + 90;
        eTime = _sb_pad(Math.floor(_mins / 60) % 24) + ':' + _sb_pad(_mins % 60);
      }

      var inserted = SupabaseService.insert('slots', {
        start_time:   _sb_localToUtcIso(date, sTime),
        end_time:     _sb_localToUtcIso(date, eTime),
        status:       STATUS_MAP[status] || 'available',
        last_updated: new Date().toISOString(),
      });
      if (inserted) report.slotsInserted++;
    }
  } catch (e) { report.errors.push('slots: ' + e.message); }

  // ── 2. Migrate Bookings_Log (clients + appointments) ────────
  try {
    var logData = logSheet().getDataRange().getValues();
    var BSTATUS = { pending: 'pending', approved: 'approved', rejected: 'rejected', cancelled: 'cancelled' };

    for (var lr = 1; lr < logData.length; lr++) {
      var lrow  = logData[lr];
      var bId   = String(lrow[LOG_COL.UUID  - 1] || '').trim();
      var bName = String(lrow[LOG_COL.NAME  - 1] || '').trim();
      var bPhone = normalizePhone(String(lrow[LOG_COL.PHONE - 1] || '').trim());
      if (!bId || !bPhone) continue;

      // Upsert client
      var cInserted = SupabaseService.insert('clients',
        { phone: bPhone, full_name: bName || '' }, 'phone');
      if (cInserted) report.clientsInserted++;

      // Resolve client ID
      var cRows = SupabaseService.select('clients',
        'phone=eq.' + encodeURIComponent(bPhone) + '&select=id');
      if (!cRows || !cRows.length) continue;

      // Resolve slot by date + time — use _isoDate/_fmtTime to handle GAS Date objects,
      // then _sb_localToUtcIso so the filter matches UTC-stored start_times.
      var bDate = _isoDate(lrow[LOG_COL.DATE - 1]);
      var bTime = _fmtTime(lrow[LOG_COL.TIME - 1]);
      var slotIso = _sb_localToUtcIso(bDate, bTime);
      var sRows = SupabaseService.select('slots',
        'start_time=eq.' + encodeURIComponent(slotIso) +
        '&select=id&limit=1');
      if (!sRows || !sRows.length) continue;

      var bStatus = String(lrow[LOG_COL.STATUS - 1] || 'pending').trim().toLowerCase();
      var aInserted = SupabaseService.insert('appointments', {
        id:                bId,
        client_id:         cRows[0].id,
        slot_id:           sRows[0].id,
        treatment_type:    String(lrow[LOG_COL.SERVICE      - 1] || '').trim(),
        treatment_name:    String(lrow[LOG_COL.SERVICE_NAME - 1] || '').trim(),
        duration_min:      parseInt(lrow[LOG_COL.DURATION   - 1], 10) || 90,
        is_verified:       true,
        status:            BSTATUS[bStatus] || 'pending',
        admin_token:       String(lrow[LOG_COL.ADMIN_TOKEN  - 1] || '').trim() || null,
        calendar_event_id: String(lrow[LOG_COL.CAL_EVENT    - 1] || '').trim() || null,
      }, 'id');
      if (aInserted) report.appointmentsInserted++;
    }
  } catch (e) { report.errors.push('appointments: ' + e.message); }

  log(LOG_LEVEL.INFO, ACTION.MANUAL_SMS, 'מיגרציה ל-Supabase הושלמה',
      { detail: JSON.stringify(report) });
  return { success: true, report: report };
}

// ─── Internal helpers (prefixed _sb_ to avoid name collisions) ────

function _sb_hmac(str, secret) {
  var sig = Utilities.computeHmacSha256Signature(str, secret);
  return sig.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function _sb_verifyHmac(str, token, secret) {
  try {
    var expected = _sb_hmac(str, secret);
    if (expected.length !== token.length) return false;
    var diff = 0;
    for (var i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  } catch (_) { return false; }
}


// ══════════════════════════════════════════════════════════════════
// ADMIN HANDLER FUNCTIONS  (Supabase-native; require ADMIN_TOKEN)
// All 6 functions bypass IS_SUPABASE_ENABLED — they always use
// SupabaseService directly.  Authentication: validateAdmin(body.token).
// ══════════════════════════════════════════════════════════════════

// ─── handleAdminGetSlotsV2 ───────────────────────────────────────
// Returns all slots (any status) for a Jerusalem-local date range.
// Input: { token, dateFrom:'YYYY-MM-DD', dateTo:'YYYY-MM-DD' }
function handleAdminGetSlotsV2(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var dateFrom = String(body.dateFrom || '').trim();
  var dateTo   = String(body.dateTo   || '').trim();
  if (!dateFrom || !dateTo) return { success: false, error: 'missing_params' };

  var fromUtc = _sb_localToUtcIso(dateFrom, '00:00');
  var toUtc   = _sb_localToUtcIso(dateTo,   '23:59');

  var rows = SupabaseService.select('slots',
    'start_time=gte.' + fromUtc +
    '&start_time=lte.' + toUtc +
    '&order=start_time.asc' +
    '&select=id,start_time,end_time,status');

  if (!rows) return { success: false, error: 'supabase_unavailable' };

  var TZ = 'Asia/Jerusalem';
  var slots = rows.map(function (row) {
    var dt = new Date(row.start_time);
    return {
      id:     row.id,
      date:   Utilities.formatDate(dt, TZ, 'yyyy-MM-dd'),
      time:   Utilities.formatDate(dt, TZ, 'HH:mm'),
      status: row.status,
    };
  });

  return { success: true, slots: slots };
}

// ─── handleAdminAddSlotV2 ────────────────────────────────────────
// Adds a single available slot.  Idempotent: ON CONFLICT(start_time).
// Input: { token, date:'YYYY-MM-DD', time:'HH:MM' }
function handleAdminAddSlotV2(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var date = String(body.date || '').trim();
  var time = String(body.time || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return { success: false, error: 'invalid_params' };
  }

  var startUtc = _sb_localToUtcIso(date, time);
  var endUtc   = new Date(new Date(startUtc).getTime() + 120 * 60 * 1000).toISOString();

  // Check before insert — merge-duplicates would reset status on booked/pending slots
  var existing = SupabaseService.select('slots',
    'start_time=eq.' + encodeURIComponent(startUtc) + '&select=id,status&limit=1');
  if (existing && existing.length > 0) {
    SheetMirrorService.upsertSlot(startUtc, endUtc, existing[0].status);
    return {
      success: true,
      already_exists: true,
      slot: { id: existing[0].id, date: date, time: time, status: existing[0].status },
    };
  }

  var inserted = SupabaseService.insert('slots', {
    start_time:   startUtc,
    end_time:     endUtc,
    status:       'available',
    last_updated: new Date().toISOString(),
  });

  if (!inserted || !inserted[0]) return { success: false, error: 'insert_failed' };

  SheetMirrorService.upsertSlot(startUtc, endUtc, 'available');

  return {
    success: true,
    slot: { id: inserted[0].id, date: date, time: time, status: 'available' },
  };
}

// ─── handleAdminDeleteSlotV2 ─────────────────────────────────────
// Deletes a slot by id.  Refuses if status is 'booked' or 'pending'.
// Input: { token, slotId }
function handleAdminDeleteSlotV2(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var id = parseInt(body.slotId, 10);
  if (!id) return { success: false, error: 'missing_params' };

  var rows = SupabaseService.select('slots', 'id=eq.' + id + '&select=id,status');
  if (!rows || !rows.length) return { success: false, error: 'slot_not_found' };
  var slot = rows[0];

  if (slot.status === 'booked' || slot.status === 'pending') {
    return { success: false, error: 'cannot_delete_active', status: slot.status };
  }

  var result = SupabaseService.delete('slots', 'id=eq.' + id);
  if (result === null) return { success: false, error: 'delete_blocked_by_fk' };

  return { success: true, slotId: id };
}

// ─── handleAdminToggleSlotV2 ─────────────────────────────────────
// Toggles a slot between 'available' and 'locked'.
// Input: { token, slotId }
function handleAdminToggleSlotV2(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var id = parseInt(body.slotId, 10);
  if (!id) return { success: false, error: 'missing_params' };

  var rows = SupabaseService.select('slots', 'id=eq.' + id + '&select=id,status');
  if (!rows || !rows.length) return { success: false, error: 'slot_not_found' };
  var status = rows[0].status;

  var newStatus;
  if      (status === 'available') newStatus = 'locked';
  else if (status === 'locked')    newStatus = 'available';
  else return { success: false, error: 'cannot_toggle', status: status };

  SupabaseService.update('slots', 'id=eq.' + id, {
    status:       newStatus,
    last_updated: new Date().toISOString(),
  });

  return { success: true, slotId: id, prevStatus: status, newStatus: newStatus };
}

// ─── handleAdminGetClientsV2 ─────────────────────────────────────
// Returns up to 50 clients, optionally filtered by name/phone (ilike).
// Input: { token, search:'' }
function handleAdminGetClientsV2(body) {
  if (!body) { Logger.log('[ERROR] handleAdminGetClientsV2: body is undefined'); return { success: false, error: 'missing_payload' }; }
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var search = String(body.search || '').trim();
  var q;
  if (search.length >= 2) {
    var enc = encodeURIComponent(search);
    q = 'or=(full_name.ilike.*' + enc + '*,phone.ilike.*' + enc + '*)' +
        '&order=created_at.desc&limit=50&select=id,phone,full_name,created_at';
  } else {
    q = 'order=created_at.desc&limit=50&select=id,phone,full_name,created_at';
  }

  var rows = SupabaseService.select('clients', q);
  if (!rows) return { success: false, error: 'supabase_unavailable' };

  return { success: true, clients: rows };
}

// ─── handleAdminGetClientHistoryV2 ──────────────────────────────
// Returns a client profile + all appointments with slot times.
// Slot data is batch-fetched in ONE query to avoid N+1 HTTP calls.
// admin_token included per appointment for approve/reject via adminAction.
// Input: { token, clientPhone }
function handleAdminGetClientHistoryV2(body) {
  if (!validateAdmin(body.token)) return { success: false, error: 'unauthorized' };

  var phone = normalizePhone(String(body.clientPhone || '').trim());
  if (!phone) return { success: false, error: 'invalid_phone' };

  var clientRows = SupabaseService.select('clients',
    'phone=eq.' + encodeURIComponent(phone) +
    '&select=id,phone,full_name,created_at');
  if (!clientRows || !clientRows.length) return { success: false, error: 'client_not_found' };
  var client = clientRows[0];

  var appts = SupabaseService.select('appointments',
    'client_id=eq.' + client.id +
    '&select=id,treatment_name,status,admin_token,calendar_event_id,created_at,slot_id,duration_min' +
    '&order=created_at.desc');
  if (!appts) appts = [];

  // Batch-fetch all slot start_times in ONE query (no N+1)
  var slotsMap = {};
  var slotIds  = appts
    .map(function (a) { return a.slot_id; })
    .filter(function (id) { return !!id; });

  if (slotIds.length > 0) {
    var slotRows = SupabaseService.select('slots',
      'id=in.(' + slotIds.join(',') + ')&select=id,start_time');
    if (slotRows) {
      slotRows.forEach(function (s) { slotsMap[s.id] = s; });
    }
  }

  var TZ = 'Asia/Jerusalem';
  var appointments = appts.map(function (a) {
    var slot = slotsMap[a.slot_id];
    var dt   = slot ? new Date(slot.start_time) : null;
    return {
      id:                a.id,
      treatment_name:    a.treatment_name,
      status:            a.status,
      admin_token:       a.admin_token,
      calendar_event_id: a.calendar_event_id || null,
      created_at:        a.created_at,
      date: dt ? Utilities.formatDate(dt, TZ, 'yyyy-MM-dd') : null,
      time: dt ? Utilities.formatDate(dt, TZ, 'HH:mm')      : null,
    };
  });

  return {
    success: true,
    client: {
      phone:      client.phone,
      full_name:  client.full_name,
      created_at: client.created_at,
    },
    appointments: appointments,
  };
}

// ─── sendDailyRemindersV2 ─────────────────────────────────────────
// Supabase-backed daily reminder. Queries appointments+slots+clients
// directly — never reads Google Sheets (Sheets is best-effort mirror only).
// Returns the same shape as sendDailyReminders():
//   { success, sent, errors, skippedQuota, date }  — on success/quota
//   { skipped, reason, date }                       — if already ran today
//   null                                            — if Supabase unavailable
//                                                     (caller must fall back)
function sendDailyRemindersV2() {
  var _t0 = Date.now();
  var TZ  = 'Asia/Jerusalem';
  var now = new Date();
  var today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');

  // Idempotency guard — shared with Sheets path via same property key
  var props   = PropertiesService.getScriptProperties();
  var lastRun = props.getProperty('REMINDER_LAST_RUN') || '';
  if (lastRun === today) {
    Logger.log('[sendDailyRemindersV2] Already ran today (' + today + '), skipping.');
    return { skipped: true, reason: 'already_ran_today', date: today };
  }

  var tomorrowDate = new Date(now);
  tomorrowDate.setDate(now.getDate() + 1);
  var tomorrowStr = Utilities.formatDate(tomorrowDate, TZ, 'yyyy-MM-dd');
  Logger.log('[sendDailyRemindersV2] Looking for Approved appointments on ' + tomorrowStr);

  // Build a UTC pre-filter window that safely covers tomorrowStr in Jerusalem
  // regardless of DST (Jerusalem = UTC+2 winter / UTC+3 summer).
  // A slot at midnight Jerusalem could be as early as 21:00 UTC the prior day;
  // a slot at 23:59 Jerusalem could be as late as 21:59 UTC that same calendar day.
  // Window: [tomorrowStr-1 day at 20:00 UTC, tomorrowStr at 22:00 UTC]
  var parts    = tomorrowStr.split('-').map(Number); // [yyyy, mm, dd]
  var rangeGte = new Date(Date.UTC(parts[0], parts[1]-1, parts[2]-1, 20, 0, 0, 0)).toISOString();
  var rangeLt  = new Date(Date.UTC(parts[0], parts[1]-1, parts[2],   22, 0, 0, 0)).toISOString();

  // 1. Slots within the UTC window
  var slotRows = SupabaseService.select('slots',
    'start_time=gte.' + encodeURIComponent(rangeGte) +
    '&start_time=lt.'  + encodeURIComponent(rangeLt) +
    '&select=id,start_time');
  if (!slotRows) {
    Logger.log('[sendDailyRemindersV2] Supabase slots query failed — caller will fall back to Sheets.');
    return null;
  }

  // Post-filter: keep only slots whose Jerusalem-local date is exactly tomorrow
  var tomorrowSlots = slotRows.filter(function (s) {
    return Utilities.formatDate(new Date(s.start_time), TZ, 'yyyy-MM-dd') === tomorrowStr;
  });

  if (tomorrowSlots.length === 0) {
    Logger.log('[sendDailyRemindersV2] No slots for ' + tomorrowStr + ' — nothing to remind.');
    props.setProperty('REMINDER_LAST_RUN', today);
    return { success: true, sent: 0, errors: 0, skippedQuota: 0, date: tomorrowStr };
  }

  // Build id -> start_time map for later SMS text
  var slotsMap   = {};
  var slotIdList = tomorrowSlots.map(function (s) { slotsMap[s.id] = s.start_time; return s.id; });

  // 2. Approved appointments for these slots (single query, no N+1)
  var appts = SupabaseService.select('appointments',
    'slot_id=in.(' + slotIdList.join(',') + ')' +
    '&status=eq.approved' +
    '&select=id,treatment_name,slot_id,client_id');
  if (!appts) {
    Logger.log('[sendDailyRemindersV2] Supabase appointments query failed — caller will fall back to Sheets.');
    return null;
  }

  if (appts.length === 0) {
    Logger.log('[sendDailyRemindersV2] No approved appointments for ' + tomorrowStr + '.');
    props.setProperty('REMINDER_LAST_RUN', today);
    return { success: true, sent: 0, errors: 0, skippedQuota: 0, date: tomorrowStr };
  }

  // 3. Batch-fetch client data (single query, no N+1)
  var clientIdList = appts.map(function (a) { return a.client_id; });
  var clientRows   = SupabaseService.select('clients',
    'id=in.(' + clientIdList.join(',') + ')&select=id,phone,full_name');
  if (!clientRows) {
    Logger.log('[sendDailyRemindersV2] Supabase clients query failed — caller will fall back to Sheets.');
    return null;
  }
  var clientsMap = {};
  clientRows.forEach(function (c) { clientsMap[c.id] = c; });

  // 4. Send reminder SMS to each client
  var sent = 0, skippedQuota = 0, errors = 0;

  for (var i = 0; i < appts.length; i++) {
    var appt   = appts[i];
    var client = clientsMap[appt.client_id];
    if (!client || !client.phone) {
      Logger.log('[sendDailyRemindersV2] Missing client data for appointment ' + appt.id);
      continue;
    }

    var timeStr = Utilities.formatDate(new Date(slotsMap[appt.slot_id]), TZ, 'HH:mm');

    try {
      checkSmsQuota(ACTION.SEND_REMINDER);
    } catch (quotaErr) {
      skippedQuota++;
      Logger.log('[sendDailyRemindersV2] Quota reached: ' + quotaErr.message);
      log(LOG_LEVEL.ERROR, ACTION.SEND_REMINDER, 'מכסת SMS מלאה — תזכורות נעצרו', { detail: 'שנשלחו: ' + sent });
      break;
    }

    var msg = ('תזכורת: מחר יש לך תור! ' +
      'שירות: ' + appt.treatment_name + '. ' +
      'תאריך: ' + tomorrowStr.replace(/-/g, '/') + ' בשעה ' + timeStr + '. ' +
      'לביטול יש לפנות למיטל.');

    try {
      SmsService.send(client.phone, msg, 'Reminder');
      sent++;
      log(LOG_LEVEL.SUCCESS, ACTION.SEND_REMINDER, 'תזכורת נשלחה ל-' + client.full_name,
          { phone: client.phone, bookingId: appt.id,
            detail: appt.treatment_name + ' | ' + tomorrowStr + ' ' + timeStr });
    } catch (smsErr) {
      errors++;
      Logger.log('[sendDailyRemindersV2] SMS error for ' + client.phone + ': ' + smsErr.message);
      log(LOG_LEVEL.ERROR, ACTION.SEND_REMINDER, 'שגיאה בשליחת תזכורת ל-' + client.full_name,
          { phone: client.phone, bookingId: appt.id, detail: smsErr.message });
    }
  }

  if (skippedQuota === 0) {
    props.setProperty('REMINDER_LAST_RUN', today);
  }

  var elapsed = Date.now() - _t0;
  var summary = 'תזכורות יומיות (Supabase): שנשלחו ' + sent + ', שגיאות ' + errors + ', מכסה ' + skippedQuota + ' (' + elapsed + 'ms)';
  Logger.log('[sendDailyRemindersV2] ' + summary);
  log(LOG_LEVEL.INFO, ACTION.SEND_REMINDER, summary, { detail: 'תאריך תור: ' + tomorrowStr });

  return { success: true, sent: sent, errors: errors, skippedQuota: skippedQuota, date: tomorrowStr };
}
