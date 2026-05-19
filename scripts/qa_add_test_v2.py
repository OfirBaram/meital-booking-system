"""
Add testAdminDashboardFlowV2() to Test_Runner.gs and wire it into runAllTests().
Usage: python qa_add_test_v2.py <abs_path_to_Test_Runner.gs>
"""
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# ── PATCH 1: insert new test suite before the ENTRY POINT section ────────────

NEW_SUITE = '''// ═══════════════════════════════════════════════════════════════
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
  Logger.log('\\n[V2-1] Auth guards — wrong token must return unauthorized');
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
    Logger.log('\\n[V2-2] adminGetSlots — baseline fetch');
    var r2 = handleAdminGetSlotsV2({ token: real, dateFrom: testDate, dateTo: testDate });
    _assert('2a: adminGetSlots success',  String(r2.success),                             'true');
    _assert('2b: slots is array',         Array.isArray(r2.slots) ? 'yes' : 'no',         'yes');
    var preCount = (r2.slots || []).filter(function (s) { return s.time === testTime; }).length;
    _assert('2c: no test slot yet',       String(preCount),                                '0');

    // ── STEP 3: adminAddSlot — create test slot ───────────────────────
    Logger.log('\\n[V2-3] adminAddSlot — create test slot');
    var r3 = handleAdminAddSlotV2({ token: real, date: testDate, time: testTime });
    _assert('3a: insert success',         String(r3.success),                             'true');
    _assert('3b: not a duplicate',        String(!!r3.already_exists),                    'false');
    _assert('3c: status=available',       r3.slot ? r3.slot.status : '',                  'available');
    _assert('3d: id is positive',         (r3.slot && r3.slot.id > 0) ? 'yes' : 'no',    'yes');
    createdId = r3.slot ? r3.slot.id : null;

    // ── STEP 4: adminAddSlot — duplicate detection ────────────────────
    Logger.log('\\n[V2-4] adminAddSlot — duplicate must return already_exists');
    var r4 = handleAdminAddSlotV2({ token: real, date: testDate, time: testTime });
    _assert('4a: success=true on dup',    String(r4.success),                             'true');
    _assert('4b: already_exists flag',    String(!!r4.already_exists),                   'true');
    _assert('4c: status preserved',       r4.slot ? r4.slot.status : '',                  'available');
    _assert('4d: same slot id',           String(r4.slot ? r4.slot.id : null),            String(createdId));

    // ── STEP 5: adminGetSlots — slot now visible ───────────────────────
    Logger.log('\\n[V2-5] adminGetSlots — test slot must appear');
    var r5 = handleAdminGetSlotsV2({ token: real, dateFrom: testDate, dateTo: testDate });
    var found = (r5.slots || []).filter(function (s) { return s.id === createdId; });
    _assert('5a: slot appears in list',   found.length > 0 ? 'yes' : 'no',                'yes');
    _assert('5b: status=available',       found.length ? found[0].status : '',             'available');

    // ── STEP 6: adminToggleSlot — available → locked ───────────────────
    Logger.log('\\n[V2-6] adminToggleSlot — available → locked');
    var r6 = handleAdminToggleSlotV2({ token: real, slotId: createdId });
    _assert('6a: toggle success',         String(r6.success),   'true');
    _assert('6b: prevStatus=available',   r6.prevStatus,        'available');
    _assert('6c: newStatus=locked',       r6.newStatus,         'locked');

    // ── STEP 7: adminToggleSlot — locked → available ───────────────────
    Logger.log('\\n[V2-7] adminToggleSlot — locked → available');
    var r7 = handleAdminToggleSlotV2({ token: real, slotId: createdId });
    _assert('7a: toggle back success',    String(r7.success),   'true');
    _assert('7b: prevStatus=locked',      r7.prevStatus,        'locked');
    _assert('7c: newStatus=available',    r7.newStatus,         'available');

    // ── STEP 8: adminToggleSlot — non-existent slot ──────────────────
    Logger.log('\\n[V2-8] adminToggleSlot — non-existent slot');
    var r8 = handleAdminToggleSlotV2({ token: real, slotId: 999999999 });
    _assert('8a: missing slot → false',   String(r8.success),  'false');
    _assert('8b: error=slot_not_found',   r8.error,            'slot_not_found');

    // ── STEP 9: adminGetClients ──────────────────────────────────
    Logger.log('\\n[V2-9] adminGetClients — empty search');
    var r9 = handleAdminGetClientsV2({ token: real, search: '' });
    _assert('9a: success',                String(r9.success),                             'true');
    _assert('9b: clients is array',       Array.isArray(r9.clients) ? 'yes' : 'no',       'yes');

    // ── STEP 10: adminGetClientHistory — unknown phone ────────────────
    Logger.log('\\n[V2-10] adminGetClientHistory — unknown phone');
    var r10 = handleAdminGetClientHistoryV2({ token: real, clientPhone: '+972500000000' });
    _assert('10a: not unauthorized',      r10.error !== 'unauthorized' ? 'ok' : 'fail',   'ok');
    _assert('10b: client_not_found',      r10.error,                                      'client_not_found');

    // ── STEP 11: adminDeleteSlot — delete test slot ───────────────────
    Logger.log('\\n[V2-11] adminDeleteSlot — delete test slot');
    var r11 = handleAdminDeleteSlotV2({ token: real, slotId: createdId });
    _assert('11a: delete success',        String(r11.success),   'true');
    _assert('11b: slotId returned',       String(r11.slotId),    String(createdId));
    createdId = null; // mark cleaned

    // ── STEP 12: adminDeleteSlot — idempotency check ─────────────────
    Logger.log('\\n[V2-12] adminDeleteSlot — re-delete → slot_not_found');
    var r12 = handleAdminDeleteSlotV2({ token: real, slotId: r11.slotId });
    _assert('12a: second delete → false', String(r12.success),   'false');
    _assert('12b: error=slot_not_found',  r12.error,             'slot_not_found');

  } catch (e) {
    Logger.log('💥 V2 EXCEPTION: ' + e.message + '\\n' + e.stack);
    _failed++;
  } finally {
    if (createdId) {
      Logger.log('\\n[V2-Cleanup] Deleting orphaned test slot id=' + createdId);
      try {
        handleAdminDeleteSlotV2({ token: real, slotId: createdId });
        Logger.log('[V2-Cleanup] Done');
      } catch (ce) {
        Logger.log('[V2-Cleanup] ERROR: ' + ce.message);
      }
    }
  }
}

'''

ENTRY_ANCHOR = '// ═══════════════════════════════════════════════════════════════\n// ENTRY POINT'

assert ENTRY_ANCHOR in src, 'ERROR: ENTRY POINT anchor not found\nLooked for: ' + repr(ENTRY_ANCHOR[:60])
src = src.replace(ENTRY_ANCHOR, NEW_SUITE + ENTRY_ANCHOR, 1)
print('PATCH 1 OK: testAdminDashboardFlowV2 inserted')

# ── PATCH 2: call the new suite from runAllTests() ────────────────────────────

OLD_CALL = '  testAdminDashboardE2E();\n\n  Logger.log'
NEW_CALL = '  testAdminDashboardE2E();\n  testAdminDashboardFlowV2();\n\n  Logger.log'

assert OLD_CALL in src, 'ERROR: runAllTests call anchor not found'
src = src.replace(OLD_CALL, NEW_CALL, 1)
print('PATCH 2 OK: testAdminDashboardFlowV2 wired into runAllTests')

with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(src)
print('Test_Runner.gs written successfully')
