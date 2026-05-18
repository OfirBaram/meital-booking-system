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
      var res  = UrlFetchApp.fetch(p.url + path, opts);
      var code = res.getResponseCode();
      var body = res.getContentText('UTF-8');
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
      if (upsertKey) {
        extra['Prefer']      += ',resolution=merge-duplicates';
        extra['On-Conflict']  = upsertKey;
      }
      return _call('POST', '/rest/v1/' + table, data, extra);
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
        sh.appendRow([
          b.id,
          b.client_name        || '',
          b.client_phone       || '',
          b.treatment_type     || '',
          b.treatment_name     || '',
          b.date_label         || '',
          b.time_label         || '',
          b.created_at         || Utilities.formatDate(new Date(), 'Asia/Jerusalem', "yyyy-MM-dd'T'HH:mm:ssXXX"),
          b.duration_min       || '',
          b.status             || 'Pending',
          b.calendar_event_id  || '',
          b.admin_token        || '',
        ]);
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
  var year  = parseInt(body.year,  10) || new Date().getFullYear();
  var month = parseInt(body.month, 10) || (new Date().getMonth() + 1);

  var from    = year + '-' + _sb_pad(month) + '-01T00:00:00+00:00';
  var lastDay = new Date(year, month, 0).getDate();
  var to      = year + '-' + _sb_pad(month) + '-' + _sb_pad(lastDay) + 'T23:59:59+00:00';

  var rows = SupabaseService.select('slots',
    'start_time=gte.' + from +
    '&start_time=lte.' + to +
    '&status=eq.available' +
    '&order=start_time.asc' +
    '&select=id,start_time');

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

  return { success: true, slots: grouped };
}

function _sb_pad(n) { return n < 10 ? '0' + n : '' + n; }

// Return a Jerusalem-local YYYY-MM-DDTHH:MM:SS+HH:MM ISO string.
// Probes DST offset via Utilities.formatDate (+02:00 winter / +03:00 summer).
function _sb_localToUtcIso(dateYmd, timeHm) {
  var noon = new Date(dateYmd + 'T12:00:00Z'); // noon UTC probes DST on this date
  var offX = Utilities.formatDate(noon, 'Asia/Jerusalem', 'XXX'); // '+03:00' or '+02:00'
  return dateYmd + 'T' + timeHm + ':00' + offX;
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
      calEventId = calResult && calResult.id ? calResult.id : null;
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

      var inserted = SupabaseService.insert('slots', {
        start_time:   _sb_localToUtcIso(date, sTime),
        end_time:     _sb_localToUtcIso(date, eTime || sTime),
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

      // Resolve slot by date + time
      var bDate = String(lrow[LOG_COL.DATE - 1] || '').trim();
      var bTime = String(lrow[LOG_COL.TIME - 1] || '').trim();
      var sRows = SupabaseService.select('slots',
        'start_time=gte.' + bDate + 'T' + bTime + ':00' +
        '&start_time=lt.'  + bDate + 'T' + bTime + ':59' +
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
