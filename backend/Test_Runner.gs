/**
 * Meital Boutique — Admin System Test Suite
 * ==========================================
 * Run from the GAS Editor: select a function and click Run.
 * Never deploy these functions as web-app endpoints.
 *
 * Entry point: runAllTests()
 *
 * Suites:
 *   testValidateAdmin           — unit: token validation
 *   testStatusTransitions       — unit: state-machine guards
 *   testListBookingsAuth        — unit: auth on listBookings
 *   testAdversarial             — security edge cases
 *   testIdempotencyAndConcurrency — duplicate / invalid transitions
 *   testAdminDashboardE2E       — full lifecycle: approve → cancel
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// TEST HARNESS
// ═══════════════════════════════════════════════════════════════

let _passed = 0;
let _failed = 0;

function _assert(label, actual, expected) {
  const ok = (String(actual) === String(expected));
  Logger.log((ok ? '✅ PASS' : '❌ FAIL') + ' — ' + label +
    (ok ? ' | got: "' + actual + '"'
        : '\n    expected: "' + expected + '"\n    got:      "' + actual + '"'));
  ok ? _passed++ : _failed++;
}

function _suite(name) {
  Logger.log('\n══════════════ ' + name + ' ══════════════');
}

// ═══════════════════════════════════════════════════════════════
// SUITE 1 — validateAdmin
// ═══════════════════════════════════════════════════════════════

function testValidateAdmin() {
  _suite('UNIT: validateAdmin');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!real) { Logger.log('⚠️  ADMIN_TOKEN not set — skipping'); return; }

  _assert('valid token → true',        validateAdmin(real) ? 'true' : 'false',            'true');
  _assert('wrong token → false',       validateAdmin('WRONG_TOKEN_XYZ') ? 'true' : 'false', 'false');
  _assert('empty string → false',      validateAdmin('') ? 'true' : 'false',              'false');
  _assert('null → false',              validateAdmin(null) ? 'true' : 'false',             'false');
  _assert('token + extra char → false',validateAdmin(real + 'X') ? 'true' : 'false',       'false');
  _assert('whitespace → false',        validateAdmin('   ') ? 'true' : 'false',            'false');
}

// ═══════════════════════════════════════════════════════════════
// SUITE 2 — State-machine transition guards
// ═══════════════════════════════════════════════════════════════

function testStatusTransitions() {
  _suite('UNIT: Status Transitions');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!real) { Logger.log('⚠️  ADMIN_TOKEN not set — skipping'); return; }

  // 'Pending' is not a valid targetStatus (it's a source, not a destination)
  const r1 = handleChangeStatus({ token: real, bookingId: 'fake-id', targetStatus: 'Pending' });
  _assert('Pending as target rejected',     r1.success ? 'true' : 'false', 'false');

  const r2 = handleChangeStatus({ token: real, bookingId: 'fake-id', targetStatus: 'InvalidStatus' });
  _assert('unknown targetStatus rejected',  r2.success ? 'true' : 'false', 'false');

  // Non-existent booking
  const r3 = handleChangeStatus({ token: real, bookingId: 'non-existent-uuid-00000000', targetStatus: 'Approved' });
  _assert('non-existent id → booking_not_found', r3.error, 'booking_not_found');
}

// ═══════════════════════════════════════════════════════════════
// SUITE 3 — listBookings auth
// ═══════════════════════════════════════════════════════════════

function testListBookingsAuth() {
  _suite('UNIT: listBookings Authentication');

  const r1 = handleListBookings({ token: 'bad-token-xyz' });
  _assert('invalid token → success=false',  String(r1.success), 'false');
  _assert('invalid token → unauthorized',   r1.error,           'unauthorized');

  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (real) {
    const r2 = handleListBookings({ token: real });
    _assert('valid token → success',        String(r2.success), 'true');
    _assert('returns bookings array',       Array.isArray(r2.bookings) ? 'yes' : 'no', 'yes');
  }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 4 — Adversarial / security
// ═══════════════════════════════════════════════════════════════

function testAdversarial() {
  _suite('ADVERSARIAL: Security & Edge Cases');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');

  // Missing token
  const r1 = handleChangeStatus({ bookingId: 'some-id', targetStatus: 'Approved' });
  _assert('missing token → unauthorized',   r1.error, 'unauthorized');

  // Missing bookingId
  if (real) {
    const r2 = handleChangeStatus({ token: real, targetStatus: 'Approved' });
    _assert('missing bookingId → error',    r2.success ? 'true' : 'false', 'false');
  }

  // Missing targetStatus
  if (real) {
    const r3 = handleChangeStatus({ token: real, bookingId: 'some-id' });
    _assert('missing targetStatus → error', r3.success ? 'true' : 'false', 'false');
  }

  // Very short token (must not crash, must return false)
  const r4 = handleListBookings({ token: 'x' });
  _assert('1-char token → false',           r4.success ? 'true' : 'false', 'false');

  // Very long token (must not crash)
  const r5 = handleListBookings({ token: 'x'.repeat(500) });
  _assert('500-char token → false',         r5.success ? 'true' : 'false', 'false');

  // SQL / formula injection in bookingId
  if (real) {
    const r6 = handleChangeStatus({
      token: real,
      bookingId: '"; DROP TABLE Bookings_Log; --',
      targetStatus: 'Approved',
    });
    _assert('injection in bookingId → booking_not_found', r6.error, 'booking_not_found');
  }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 5 — Idempotency & duplicate transitions
// ═══════════════════════════════════════════════════════════════

function testIdempotencyAndConcurrency() {
  _suite('ADVERSARIAL: Idempotency & Duplicate Transitions');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!real) { Logger.log('⚠️  ADMIN_TOKEN not set — skipping'); return; }

  const TZ      = 'Asia/Jerusalem';
  const testDay = new Date(); testDay.setDate(testDay.getDate() + 120);
  const testDate = Utilities.formatDate(testDay, TZ, 'yyyy-MM-dd');
  const testTime = '14:00';
  const testId   = 'TEST-IDEM-' + Utilities.formatDate(new Date(), TZ, 'HHmmssSSS');
  const slotSh   = slotsSheet();
  const logSh    = logSheet();

  try {
    slotSh.appendRow([testDate, 'TEST', testTime, '15:30', 'Available']);
    logSh.appendRow([
      testId, 'Idempotency Test', QA_MOCK_PHONE,
      'gel_classic', "לק ג'ל קלאסי", testDate, testTime,
      nowISO(), 90, 'Pending', '', signAdminToken(testId),
    ]);
    updateSlotStatus(testDate, testTime, 'Pending_Lock');
    SpreadsheetApp.flush();

    const r1 = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Approved' });
    _assert('first approval succeeds',          String(r1.success), 'true');

    const r2 = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Approved' });
    _assert('duplicate approval → false',       String(r2.success), 'false');
    _assert('duplicate → invalid_transition',   r2.error, 'invalid_transition');

    const r3 = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Rejected' });
    _assert('Approved→Rejected → false',        String(r3.success), 'false');

    const r4 = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Cancelled' });
    _assert('cancel succeeds',                  String(r4.success), 'true');

    const r5 = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Cancelled' });
    _assert('double cancel → false',            String(r5.success), 'false');
    _assert('double cancel → invalid_transition', r5.error, 'invalid_transition');

  } catch (e) {
    Logger.log('💥 ' + e.message);
    _failed++;
  } finally {
    _cleanupTest(testId, testDate, testTime, slotSh, logSh);
  }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 6 — E2E: full dashboard lifecycle
// ═══════════════════════════════════════════════════════════════

/**
 * Full lifecycle via handleChangeStatus:
 *   Insert slot + Pending booking
 *   → Approve  (Calendar event created, slot=Booked)
 *   → Verify invalid transition Approved→Rejected
 *   → Cancel   (Calendar event deleted, slot=Available)
 *   → Verify re-approve fails
 *   → Verify Audit_Log has ≥2 entries for this booking
 */
function testAdminDashboardE2E() {
  _suite('E2E: Admin Dashboard Full Lifecycle');
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!real) { Logger.log('⚠️  ADMIN_TOKEN not set — skipping'); return; }

  const TZ      = 'Asia/Jerusalem';
  const testDay = new Date(); testDay.setDate(testDay.getDate() + 90);
  const testDate = Utilities.formatDate(testDay, TZ, 'yyyy-MM-dd');
  const testTime = '11:00';
  const testId   = 'TEST-DASH-' + Utilities.formatDate(new Date(), TZ, 'HHmmssSSS');
  const slotSh   = slotsSheet();
  const logSh    = logSheet();
  let calEventId = null;

  Logger.log('[E2E] id=' + testId + '  date=' + testDate);

  try {
    // ── 1. Setup ──────────────────────────────────────────────────
    Logger.log('\n[E2E-1] Setup: insert slot + Pending booking');
    slotSh.appendRow([testDate, 'TEST', testTime, '12:30', 'Available']);
    logSh.appendRow([
      testId, 'לקוחת טסט', QA_MOCK_PHONE,
      'gel_classic', "לק ג'ל קלאסי", testDate, testTime,
      nowISO(), 90, 'Pending', '', signAdminToken(testId),
    ]);
    updateSlotStatus(testDate, testTime, 'Pending_Lock');
    SpreadsheetApp.flush();

    const slot1 = findSlotRow(testDate, testTime);
    _assert('1a: slot exists',         slot1 !== null ? 'found' : 'missing', 'found');
    _assert('1b: slot=Pending_Lock',   slot1 ? String(slot1.row[SLOT_COL.STATUS - 1]).trim() : '', 'Pending_Lock');

    // ── 2. Approve ────────────────────────────────────────────────
    Logger.log('\n[E2E-2] Approve via handleChangeStatus');
    const appRes = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Approved' });
    _assert('2a: approve success',     String(appRes.success), 'true');
    calEventId = appRes.calEventId || null;
    _assert('2b: calEventId returned', calEventId ? 'yes' : 'no', 'yes');

    // ── 3. Post-approval state ────────────────────────────────────
    Logger.log('\n[E2E-3] Verify post-approval state');
    const logRow1 = _findLogRow(logSh, testId);
    _assert('3a: booking=Approved',    logRow1 ? String(logRow1[LOG_COL.STATUS - 1]).trim() : '', 'Approved');
    _assert('3b: calEventId in sheet', (logRow1 && String(logRow1[LOG_COL.CAL_EVENT - 1]).trim().length > 0) ? 'yes' : 'no', 'yes');
    const slot2 = findSlotRow(testDate, testTime);
    _assert('3c: slot=Booked',         slot2 ? String(slot2.row[SLOT_COL.STATUS - 1]).trim() : 'missing', 'Booked');

    // ── 4. Invalid transition: Approved → Rejected ────────────────
    Logger.log('\n[E2E-4] Invalid: Approved → Rejected');
    const badTrans = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Rejected' });
    _assert('4a: rejected=false',      String(badTrans.success), 'false');
    _assert('4b: error=invalid_transition', badTrans.error, 'invalid_transition');

    // ── 5. Cancel ─────────────────────────────────────────────────
    Logger.log('\n[E2E-5] Cancel via handleChangeStatus');
    const canRes = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Cancelled' });
    _assert('5a: cancel success',      String(canRes.success), 'true');

    // ── 6. Post-cancel state ──────────────────────────────────────
    Logger.log('\n[E2E-6] Verify post-cancel state');
    const logRow2 = _findLogRow(logSh, testId);
    _assert('6a: booking=Cancelled',   logRow2 ? String(logRow2[LOG_COL.STATUS - 1]).trim() : '', 'Cancelled');
    const slot3 = findSlotRow(testDate, testTime);
    _assert('6b: slot=Available',      slot3 ? String(slot3.row[SLOT_COL.STATUS - 1]).trim() : 'missing', 'Available');

    // ── 7. Re-approve cancelled booking ───────────────────────────
    Logger.log('\n[E2E-7] Adversarial: re-approve cancelled booking');
    const reApp = handleChangeStatus({ token: real, bookingId: testId, targetStatus: 'Approved' });
    _assert('7a: re-approve → false',  String(reApp.success), 'false');
    _assert('7b: invalid_transition',  reApp.error, 'invalid_transition');

    // ── 8. Audit log ──────────────────────────────────────────────
    Logger.log('\n[E2E-8] Verify Audit_Log entries');
    const auditData = auditSheet().getDataRange().getValues();
    const auditRows = auditData.filter(row => String(row[3]).trim() === testId);
    _assert('8a: ≥2 audit entries',    auditRows.length >= 2 ? 'yes' : 'no', 'yes');

  } catch (e) {
    Logger.log('💥 E2E EXCEPTION: ' + e.message + '\n' + e.stack);
    _failed++;
  } finally {
    _cleanupTest(testId, testDate, testTime, slotSh, logSh, true);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function _findLogRow(logSh, testId) {
  const data = logSh.getDataRange().getValues();
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][LOG_COL.UUID - 1]).trim() === testId) return data[r];
  }
  return null;
}

function _cleanupTest(testId, testDate, testTime, slotSh, logSh, cleanAudit) {
  Logger.log('\n[Cleanup] Removing test data for ' + testId);
  try {
    const TZ = 'Asia/Jerusalem';

    const logData = logSh.getDataRange().getValues();
    for (let r = logData.length - 1; r >= 1; r--) {
      if (String(logData[r][LOG_COL.UUID - 1]).trim() === testId) {
        logSh.deleteRow(r + 1);
        Logger.log('[Cleanup] Log row deleted');
        break;
      }
    }

    const slotData = slotSh.getDataRange().getValues();
    for (let r = slotData.length - 1; r >= 1; r--) {
      const rd = slotData[r][SLOT_COL.DATE - 1];
      const rs = slotData[r][SLOT_COL.START - 1];
      const d  = (rd instanceof Date) ? Utilities.formatDate(rd, TZ, 'yyyy-MM-dd') : String(rd).trim();
      const s  = (rs instanceof Date) ? Utilities.formatDate(rs, TZ, 'HH:mm')     : String(rs).trim();
      if (d === testDate && s === testTime) {
        slotSh.deleteRow(r + 1);
        Logger.log('[Cleanup] Slot row deleted');
        break;
      }
    }

    if (cleanAudit) {
      const aSh   = auditSheet();
      const aData = aSh.getDataRange().getValues();
      const toDelete = [];
      for (let r = 1; r < aData.length; r++) {
        if (String(aData[r][3]).trim() === testId) toDelete.push(r + 1);
      }
      for (let i = toDelete.length - 1; i >= 0; i--) aSh.deleteRow(toDelete[i]);
      Logger.log('[Cleanup] Audit rows deleted: ' + toDelete.length);
    }

    SpreadsheetApp.flush();
    Logger.log('[Cleanup] Done');
  } catch (ce) {
    Logger.log('[Cleanup] ERROR: ' + ce.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 7 — Supabase Admin Dashboard V2
// ═══════════════════════════════════════════════════════════════

/**
 * Integration test for the 6 new Supabase admin endpoints.
 * Creates a test slot 180 days out, exercises every handler,
 * then deletes it.  Self-contained; safe to run multiple times.
 */
function testAdminDashboardFlowV2() {
  _suite('INTEGRATION: Admin Dashboard V2 (Supabase)');

  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN');
  if (!real) { Logger.log('⚠️  ADMIN_TOKEN not set — skipping'); return; }

  var TZ        = 'Asia/Jerusalem';
  var futureDay = new Date(); futureDay.setDate(futureDay.getDate() + 180);
  var testDate  = Utilities.formatDate(futureDay, TZ, 'yyyy-MM-dd');
  var testTime  = '22:30';
  var createdId = null;

  // ── STEP 1: Auth guard on all 6 endpoints ────────────────────────
  Logger.log('\n[V2-1] Auth guards — wrong token must return unauthorized');
  _assert('1a: adminGetSlots unauthorized',
    handleAdminGetSlotsV2({ token: 'WRONG', dateFrom: testDate, dateTo: testDate }).error,
    'unauthorized');
  _assert('1b: adminAddSlot unauthorized',
    handleAdminAddSlotV2({ token: 'WRONG', date: testDate, time: testTime }).error,
    'unauthorized');
  _assert('1c: adminDeleteSlot unauthorized',
    handleAdminDeleteSlotV2({ token: 'WRONG', slotId: 1 }).error,
    'unauthorized');
  _assert('1d: adminToggleSlot unauthorized',
    handleAdminToggleSlotV2({ token: 'WRONG', slotId: 1 }).error,
    'unauthorized');
  _assert('1e: adminGetClients unauthorized',
    handleAdminGetClientsV2({ token: 'WRONG' }).error,
    'unauthorized');
  _assert('1f: adminGetClientHistory unauthorized',
    handleAdminGetClientHistoryV2({ token: 'WRONG', clientPhone: '+972500000000' }).error,
    'unauthorized');

  try {
    // ── STEP 2: adminGetSlots — baseline ─────────────────────────────
    Logger.log('\n[V2-2] adminGetSlots — baseline fetch');
    var r2 = handleAdminGetSlotsV2({ token: real, dateFrom: testDate, dateTo: testDate });
    _assert('2a: adminGetSlots success',  String(r2.success),                             'true');
    _assert('2b: slots is array',         Array.isArray(r2.slots) ? 'yes' : 'no',         'yes');
    var preCount = (r2.slots || []).filter(function (s) { return s.time === testTime; }).length;
    _assert('2c: no test slot yet',       String(preCount),                                '0');

    // ── STEP 3: adminAddSlot — create test slot ───────────────────────
    Logger.log('\n[V2-3] adminAddSlot — create test slot');
    var r3 = handleAdminAddSlotV2({ token: real, date: testDate, time: testTime });
    _assert('3a: insert success',         String(r3.success),                             'true');
    _assert('3b: not a duplicate',        String(!!r3.already_exists),                    'false');
    _assert('3c: status=available',       r3.slot ? r3.slot.status : '',                  'available');
    _assert('3d: id is positive',         (r3.slot && r3.slot.id > 0) ? 'yes' : 'no',    'yes');
    createdId = r3.slot ? r3.slot.id : null;

    // ── STEP 4: adminAddSlot — duplicate detection ────────────────────
    Logger.log('\n[V2-4] adminAddSlot — duplicate must return already_exists');
    var r4 = handleAdminAddSlotV2({ token: real, date: testDate, time: testTime });
    _assert('4a: success=true on dup',    String(r4.success),                             'true');
    _assert('4b: already_exists flag',    String(!!r4.already_exists),                   'true');
    _assert('4c: status preserved',       r4.slot ? r4.slot.status : '',                  'available');
    _assert('4d: same slot id',           String(r4.slot ? r4.slot.id : null),            String(createdId));

    // ── STEP 5: adminGetSlots — slot now visible ───────────────────────
    Logger.log('\n[V2-5] adminGetSlots — test slot must appear');
    var r5 = handleAdminGetSlotsV2({ token: real, dateFrom: testDate, dateTo: testDate });
    var found = (r5.slots || []).filter(function (s) { return s.id === createdId; });
    _assert('5a: slot appears in list',   found.length > 0 ? 'yes' : 'no',                'yes');
    _assert('5b: status=available',       found.length ? found[0].status : '',             'available');

    // ── STEP 6: adminToggleSlot — available → locked ───────────────────
    Logger.log('\n[V2-6] adminToggleSlot — available → locked');
    var r6 = handleAdminToggleSlotV2({ token: real, slotId: createdId });
    _assert('6a: toggle success',         String(r6.success),   'true');
    _assert('6b: prevStatus=available',   r6.prevStatus,        'available');
    _assert('6c: newStatus=locked',       r6.newStatus,         'locked');

    // ── STEP 7: adminToggleSlot — locked → available ───────────────────
    Logger.log('\n[V2-7] adminToggleSlot — locked → available');
    var r7 = handleAdminToggleSlotV2({ token: real, slotId: createdId });
    _assert('7a: toggle back success',    String(r7.success),   'true');
    _assert('7b: prevStatus=locked',      r7.prevStatus,        'locked');
    _assert('7c: newStatus=available',    r7.newStatus,         'available');

    // ── STEP 8: adminToggleSlot — non-existent slot ──────────────────
    Logger.log('\n[V2-8] adminToggleSlot — non-existent slot');
    var r8 = handleAdminToggleSlotV2({ token: real, slotId: 999999999 });
    _assert('8a: missing slot → false',   String(r8.success),  'false');
    _assert('8b: error=slot_not_found',   r8.error,            'slot_not_found');

    // ── STEP 9: adminGetClients ──────────────────────────────────
    Logger.log('\n[V2-9] adminGetClients — empty search');
    var r9 = handleAdminGetClientsV2({ token: real, search: '' });
    _assert('9a: success',                String(r9.success),                             'true');
    _assert('9b: clients is array',       Array.isArray(r9.clients) ? 'yes' : 'no',       'yes');

    // ── STEP 10: adminGetClientHistory — unknown phone ────────────────
    Logger.log('\n[V2-10] adminGetClientHistory — unknown phone');
    var r10 = handleAdminGetClientHistoryV2({ token: real, clientPhone: '+972500000000' });
    _assert('10a: not unauthorized',      r10.error !== 'unauthorized' ? 'ok' : 'fail',   'ok');
    _assert('10b: client_not_found',      r10.error,                                      'client_not_found');

    // ── STEP 11: adminDeleteSlot — delete test slot ───────────────────
    Logger.log('\n[V2-11] adminDeleteSlot — delete test slot');
    var r11 = handleAdminDeleteSlotV2({ token: real, slotId: createdId });
    _assert('11a: delete success',        String(r11.success),   'true');
    _assert('11b: slotId returned',       String(r11.slotId),    String(createdId));
    createdId = null; // mark cleaned

    // ── STEP 12: adminDeleteSlot — idempotency check ─────────────────
    Logger.log('\n[V2-12] adminDeleteSlot — re-delete → slot_not_found');
    var r12 = handleAdminDeleteSlotV2({ token: real, slotId: r11.slotId });
    _assert('12a: second delete → false', String(r12.success),   'false');
    _assert('12b: error=slot_not_found',  r12.error,             'slot_not_found');

  } catch (e) {
    Logger.log('💥 V2 EXCEPTION: ' + e.message + '\n' + e.stack);
    _failed++;
  } finally {
    if (createdId) {
      Logger.log('\n[V2-Cleanup] Deleting orphaned test slot id=' + createdId);
      try {
        handleAdminDeleteSlotV2({ token: real, slotId: createdId });
        Logger.log('[V2-Cleanup] Done');
      } catch (ce) {
        Logger.log('[V2-Cleanup] ERROR: ' + ce.message);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Runs the full test suite. View results in the GAS Execution Log.
 * Expected output: pass/fail count + 🎉 or ⚠️ summary.
 */
function runAllTests() {
  _passed = 0;
  _failed = 0;

  Logger.log('');
  Logger.log('████████████████████████████████████████████████████');
  Logger.log('█   MEITAL BOUTIQUE — ADMIN SYSTEM TEST SUITE      █');
  Logger.log('████████████████████████████████████████████████████');
  Logger.log('Started: ' + new Date().toISOString());

  testValidateAdmin();
  testStatusTransitions();
  testListBookingsAuth();
  testAdversarial();
  testIdempotencyAndConcurrency();
  testAdminDashboardE2E();
  testAdminDashboardFlowV2();

  Logger.log('');
  Logger.log('████████████████████████████████████████████████████');
  const summary = '█  RESULTS: ' + _passed + ' passed, ' + _failed + ' failed';
  Logger.log(summary + (_failed === 0 ? '  🎉  █' : '  ⚠️   █'));
  Logger.log('████████████████████████████████████████████████████');

  if (_failed === 0) Logger.log('\n🎉 All tests passed! System is healthy.');
  else               Logger.log('\n⚠️  ' + _failed + ' test(s) FAILED — see ❌ lines above.');
}
