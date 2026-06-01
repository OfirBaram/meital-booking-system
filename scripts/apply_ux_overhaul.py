# -*- coding: utf-8 -*-
"""Apply UX overhaul changes: remove slots tab, add automation to clients tab, add auto-block."""
import sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

def read(p):
    return (ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n')

def write(p, content):
    path = ROOT/p
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8', newline='\n')

def patch(p, old, new, label=''):
    content = read(p)
    if old not in content:
        print(f'[FAIL] {label}: old string NOT FOUND in {p}')
        print(f'  first 80 chars: {repr(old[:80])}')
        sys.exit(1)
    cnt = content.count(old)
    write(p, content.replace(old, new, 1))
    print(f'[OK]   {label} ({cnt}x)')

# ─────────────────────────────────────────────────────────────────────────────
# 1. Create auto-block-slots Supabase edge function
# ─────────────────────────────────────────────────────────────────────────────
AUTO_BLOCK_TS = r"""import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Returns the UTC range that covers all of tomorrow in Jerusalem (UTC+2/+3). */
function tomorrowRange() {
  const TZ = 'Asia/Jerusalem'
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(tomorrow)
  const fromUtc = new Date(`${dateStr}T00:00:00+03:00`).toISOString()
  const toUtc   = new Date(`${dateStr}T23:59:59+02:00`).toISOString()
  return { dateStr, fromUtc, toUtc }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const body           = await req.json()
    const { adminToken } = body

    const expectedToken = Deno.env.get('ADMIN_TOKEN')
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
      return json({ success: false, error: 'unauthorized' }, 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { dateStr, fromUtc, toUtc } = tomorrowRange()

    // Find all 'available' slots for tomorrow
    const { data: slots, error: selErr } = await supabase
      .from('slots')
      .select('id')
      .eq('status', 'available')
      .gte('start_time', fromUtc)
      .lte('start_time', toUtc)

    if (selErr) throw selErr

    if (!slots || slots.length === 0) {
      console.log(`[auto-block-slots] No available slots for ${dateStr}`)
      return json({ success: true, blocked: 0, date: dateStr })
    }

    const ids = slots.map((s: { id: number }) => s.id)

    const { error: updErr } = await supabase
      .from('slots')
      .update({ status: 'locked', last_updated: new Date().toISOString() })
      .in('id', ids)

    if (updErr) throw updErr

    console.log(`[auto-block-slots] Locked ${ids.length} slots for ${dateStr}`)
    return json({ success: true, blocked: ids.length, date: dateStr })
  } catch (err) {
    console.error('[auto-block-slots]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
})
"""
write('supabase/functions/auto-block-slots/index.ts', AUTO_BLOCK_TS)
print('[OK]   Created supabase/functions/auto-block-slots/index.ts')

# ─────────────────────────────────────────────────────────────────────────────
# 2. Patch admin.html
# ─────────────────────────────────────────────────────────────────────────────
html = read('frontend/admin.html')

slots_start = html.index('    <!-- ── TAB: SLOT MANAGER ── -->')
sms_start   = html.index('    <!-- ── TAB: SMS CENTER')

# Remove the entire slot manager tab section
old_slot_section = html[slots_start:sms_start]
html = html.replace(old_slot_section, '', 1)
print('[OK]   admin.html: removed tab-slots section')

# Remove the slots nav button
nav_s_start2 = html.index('        <button data-tab="slots"')
nav_d_start2 = html.index('        <button data-tab="diary"')
old_slots_nav = html[nav_s_start2:nav_d_start2]
html = html.replace(old_slots_nav, '', 1)
print('[OK]   admin.html: removed slots nav button')

# Build the automation section to insert into clients tab
AUTOMATION_HTML = """

      <!-- ── Automation Section ── -->
      <div class="mb-4 space-y-3" id="js-automation-section">

        <!-- Daily Reminders -->
        <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4">
          <div class="flex items-center justify-between mb-1">
            <div class="flex items-center gap-2">
              <span class="text-base">\U0001f514</span>
              <div class="text-xs font-bold text-text-muted uppercase tracking-widest">תזכורות יומיות</div>
            </div>
            <span id="js-reminder-last" class="text-xs text-text-muted">טוען...</span>
          </div>
          <p class="text-xs text-text-muted mb-3">שולח SMS לכל לקוחה עם תור מחר. רץ אוטומטית ב-08:00.</p>
          <div class="flex items-center gap-2 bg-cream rounded-xl px-3 py-2.5 mb-3">
            <span class="text-lg shrink-0">\U0001f514</span>
            <span id="js-reminder-preview" class="text-xs text-text-main font-semibold leading-snug">—</span>
          </div>
          <label class="flex items-center gap-2 mb-3 cursor-pointer">
            <input id="js-reminder-force" type="checkbox" class="accent-primary">
            <span class="text-xs text-text-muted">שלח גם אם כבר נשלח היום</span>
          </label>
          <button id="js-reminder-submit"
            class="w-full bg-primary hover:bg-primary-dk text-white font-bold py-2.5 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2 min-h-[44px]">
            שלח תזכורות למחר
          </button>
        </div>

        <!-- Auto-block Slots -->
        <div class="bg-white rounded-2xl border border-secondary/30 shadow-sm p-4">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-base">⏰</span>
              <div class="text-xs font-bold text-text-muted uppercase tracking-widest">חסימת זמנים אוטומטית</div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer shrink-0" title="הפעל/כבה חסימה אוטומטית">
              <input id="js-autoblock-toggle" type="checkbox" class="sr-only peer" checked>
              <div class="w-11 h-6 bg-secondary/50 rounded-full peer transition-colors
                           peer-checked:bg-primary
                           after:content-[''] after:absolute after:top-0.5 after:start-0.5
                           after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all
                           peer-checked:after:translate-x-5 after:shadow-sm"></div>
            </label>
          </div>
          <p class="text-xs text-text-muted mb-3">חוסמת חריצים פנויים למחרת מדי ערב. מונעת הזמנות ברגע האחרון.</p>
          <div id="js-autoblock-settings" class="space-y-2 transition-opacity">
            <div class="flex items-center gap-3 bg-cream rounded-xl px-3 py-2.5">
              <span class="text-xs text-text-muted shrink-0 font-semibold">שעת חסימה</span>
              <select id="js-autoblock-time" data-qa="sel-autoblock-time"
                class="flex-1 text-sm font-bold text-text-main bg-transparent border-0 focus:outline-none cursor-pointer appearance-none">
                <option value="16">16:00</option>
                <option value="17">17:00</option>
                <option value="18">18:00</option>
                <option value="19">19:00</option>
                <option value="20" selected>20:00</option>
                <option value="21">21:00</option>
                <option value="22">22:00</option>
                <option value="23">23:00</option>
              </select>
              <span class="text-xs text-text-muted shrink-0">בכל ערב</span>
            </div>
            <div class="flex gap-2">
              <button id="js-autoblock-save" data-qa="btn-autoblock-save"
                class="flex-1 bg-primary hover:bg-primary-dk text-white font-bold py-2 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 text-sm min-h-[40px]">
                שמור הגדרות
              </button>
              <button id="js-autoblock-run" data-qa="btn-autoblock-run"
                class="shrink-0 bg-secondary/40 hover:bg-secondary/60 text-text-muted font-bold px-4 py-2 rounded-xl active:scale-[0.98] transition-all text-xs min-h-[40px]"
                title="הפעל חסימה עכשיו ידנית">
                הפעל עכשיו
              </button>
            </div>
          </div>
        </div>

      </div>

      <!-- Section divider -->
      <div class="flex items-center gap-3 mb-4 px-1">
        <div class="flex-1 h-px bg-secondary/25"></div>
        <span class="text-[10px] font-bold text-text-muted tracking-wider">לקוחות</span>
        <div class="flex-1 h-px bg-secondary/25"></div>
      </div>

"""

old_clients_search = '\n      <!-- Search -->'
html = html.replace(old_clients_search, AUTOMATION_HTML + '      <!-- Search -->', 1)
print('[OK]   admin.html: added automation section to clients tab')

write('frontend/admin.html', html)
print('[OK]   admin.html: written')

# ─────────────────────────────────────────────────────────────────────────────
# 3. Patch admin.js
# ─────────────────────────────────────────────────────────────────────────────

# 3a. setTab tabs array
patch('frontend/admin.js',
  "['calendar','bookings','pulse','slots','diary','clients']",
  "['calendar','bookings','pulse','diary','clients']",
  'admin.js: setTab tabs array')

# 3b. S state: remove template, add autoBlock
patch('frontend/admin.js',
  "  template: [],\n  autoSms:  true,",
  "  autoBlock: { enabled: true, time: 20 },\n  autoSms:  true,",
  'admin.js: S.autoBlock')

# 3c. setTab: replace slot handling with clients handling
patch('frontend/admin.js',
  "  if (tab === 'slots') {\n    loadTemplate();\n    const dateEl = document.getElementById('js-diary-date');\n    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);\n    loadDiarySlots();\n    updateReminderPreview();\n  }\n  if (tab === 'calendar') loadAndRenderCalendar();\n  if (tab === 'diary')    loadSmsLog();\n  if (tab === 'clients' && S.clients.length === 0) loadClients('');",
  "  if (tab === 'calendar') loadAndRenderCalendar();\n  if (tab === 'diary')    loadSmsLog();\n  if (tab === 'clients') {\n    if (S.clients.length === 0) loadClients('');\n    loadSystemInfo();\n    updateReminderPreview();\n    loadAutoBlockConfig();\n  }",
  'admin.js: setTab clients')

# 3d. Stub loadTemplate (keep function but rename so it can't be called)
patch('frontend/admin.js',
  "const DEFAULT_TEMPLATE = [\n  { dayOfWeek: 0, dayName: 'ראשון',",
  "// DEFAULT_TEMPLATE removed (slots tab deleted)\nconst DEFAULT_TEMPLATE_UNUSED = [\n  { dayOfWeek: 0, dayName: 'ראשון',",
  'admin.js: remove DEFAULT_TEMPLATE')

patch('frontend/admin.js',
  "function loadTemplate() {\n  document.getElementById('js-template-skeleton')",
  "function loadTemplate_unused() {\n  document.getElementById('js-template-skeleton')",
  'admin.js: stub loadTemplate')

patch('frontend/admin.js',
  "function renderTemplate() {\n  const container = document.getElementById('js-template-rows');",
  "function renderTemplate_unused() {\n  const container = document.getElementById('js-template-rows');",
  'admin.js: stub renderTemplate')

patch('frontend/admin.js',
  "function saveTemplate() {\n  const container = document.getElementById('js-template-rows');",
  "function saveTemplate_unused() {\n  const container = document.getElementById('js-template-rows');",
  'admin.js: stub saveTemplate')

patch('frontend/admin.js',
  "async function generateSlots() {\n  const startDate = document.getElementById('js-gen-start').value;",
  "async function generateSlots_unused() {\n  const startDate = document.getElementById('js-gen-start').value;",
  'admin.js: stub generateSlots')

patch('frontend/admin.js',
  "function _updateDiaryDayLabel(date) {\n  const el = document.getElementById('js-diary-day-label');",
  "function _updateDiaryDayLabel_unused(date) {\n  const el = document.getElementById('js-diary-day-label');",
  'admin.js: stub _updateDiaryDayLabel')

patch('frontend/admin.js',
  "function _shiftDiaryDay(delta) {\n  const el = document.getElementById('js-diary-date');",
  "function _shiftDiaryDay_unused(delta) {\n  const el = document.getElementById('js-diary-date');",
  'admin.js: stub _shiftDiaryDay')

patch('frontend/admin.js',
  "// Loads slots for the single selected day (one day per action -- by design).\nasync function loadDiarySlots() {",
  "async function loadDiarySlots_unused() {",
  'admin.js: stub loadDiarySlots')

patch('frontend/admin.js',
  "async function toggleDiarySlot(slotId, currentStatus) {",
  "async function toggleDiarySlot_unused(slotId, currentStatus) {",
  'admin.js: stub toggleDiarySlot')

patch('frontend/admin.js',
  "async function deleteDiarySlot(slotId) {",
  "async function deleteDiarySlot_unused(slotId) {",
  'admin.js: stub deleteDiarySlot')

patch('frontend/admin.js',
  "async function addDiarySlot() {",
  "async function addDiarySlot_unused() {",
  'admin.js: stub addDiarySlot')

# 3e. Add auto-block functions (insert before openSmsModal)
AUTO_BLOCK_JS = """
async function loadAutoBlockConfig() {
  try {
    const data = await apiCall('getAutoBlockConfig');
    if (!data.success) return;
    S.autoBlock.enabled = data.enabled !== false;
    S.autoBlock.time    = typeof data.time === 'number' ? data.time : 20;
    const toggle  = document.getElementById('js-autoblock-toggle');
    const timeEl  = document.getElementById('js-autoblock-time');
    if (toggle) toggle.checked = S.autoBlock.enabled;
    if (timeEl) timeEl.value   = String(S.autoBlock.time);
    _setAutoBlockSettingsVisibility(S.autoBlock.enabled);
  } catch (_) {}
}

function _setAutoBlockSettingsVisibility(enabled) {
  const settings = document.getElementById('js-autoblock-settings');
  if (!settings) return;
  settings.style.opacity       = enabled ? '1' : '0.45';
  settings.style.pointerEvents = enabled ? '' : 'none';
}

async function saveAutoBlockConfig(enabled, time) {
  const btn = document.getElementById('js-autoblock-save');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="w-4 h-4 spinner"></span>'; }
  try {
    const data = await apiCall('saveAutoBlockConfig', { enabled, time });
    if (!data.success) throw new Error(data.error);
    S.autoBlock.enabled = enabled;
    S.autoBlock.time    = time;
    _setAutoBlockSettingsVisibility(enabled);
    toast((enabled ? 'חסימה אוטומטית פעילה' : 'חסימה אוטומטית כבויה') + ' — הגדרות נשמרו ✅', 'ok');
  } catch (e) {
    toast('שגיאה בשמירת הגדרות: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'שמור הגדרות'; }
  }
}

async function runAutoBlock() {
  const btn = document.getElementById('js-autoblock-run');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="w-4 h-4 spinner"></span>'; }
  try {
    const data = await apiCall('runAutoBlock');
    if (!data.success) throw new Error(data.error);
    if (data.skipped) {
      toast('חסימה אוטומטית כבויה — אפשר במתג למעלה', '');
    } else {
      toast('נחסמו ' + data.blocked + ' חריצים למחר ✅', 'ok');
    }
  } catch (e) {
    toast('שגיאה בהפעלת חסימה: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'הפעל עכשיו'; }
  }
}

"""
patch('frontend/admin.js',
  "function openSmsModal(booking) {",
  AUTO_BLOCK_JS + "function openSmsModal(booking) {",
  'admin.js: add auto-block functions')

# 3f. Update refresh button: remove slot reference
patch('frontend/admin.js',
  "    if (S.tab === 'slots') loadTemplate();\n    setTimeout",
  "    setTimeout",
  'admin.js: refresh handler')

# 3g. Replace slot event listeners with auto-block ones
patch('frontend/admin.js',
  "  document.getElementById('js-save-template').addEventListener('click', saveTemplate);\n  document.getElementById('js-gen-submit').addEventListener('click', generateSlots);\n  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);\n\n\n  document.getElementById('js-sms-close').addEventListener('click', closeSmsModal);",
  "  document.getElementById('js-reminder-submit').addEventListener('click', sendReminders);\n  document.getElementById('js-autoblock-toggle').addEventListener('change', () => {\n    const enabled = document.getElementById('js-autoblock-toggle').checked;\n    _setAutoBlockSettingsVisibility(enabled);\n  });\n  document.getElementById('js-autoblock-save').addEventListener('click', () => {\n    const enabled = document.getElementById('js-autoblock-toggle').checked;\n    const time    = parseInt(document.getElementById('js-autoblock-time').value, 10);\n    saveAutoBlockConfig(enabled, time);\n  });\n  document.getElementById('js-autoblock-run').addEventListener('click', runAutoBlock);\n\n  document.getElementById('js-sms-close').addEventListener('click', closeSmsModal);",
  'admin.js: replace slot listeners')

# 3h. Remove diary listeners
patch('frontend/admin.js',
  "  const diaryDateEl = document.getElementById('js-diary-date');\n  if (diaryDateEl) diaryDateEl.addEventListener('change', loadDiarySlots);\n  const diaryPrevEl = document.getElementById('js-diary-prev');\n  const diaryNextEl = document.getElementById('js-diary-next');\n  if (diaryPrevEl) diaryPrevEl.addEventListener('click', () => _shiftDiaryDay(-1));\n  if (diaryNextEl) diaryNextEl.addEventListener('click', () => _shiftDiaryDay(1));\n  document.getElementById('js-add-slot-btn').addEventListener('click', addDiarySlot);\n  document.getElementById('js-log-refresh').addEventListener('click', loadSmsLog);",
  "  document.getElementById('js-log-refresh').addEventListener('click', loadSmsLog);",
  'admin.js: remove diary listeners')

print('[OK]   admin.js: all patches applied')

# ─────────────────────────────────────────────────────────────────────────────
# 4. Patch gas-backend.js
# ─────────────────────────────────────────────────────────────────────────────

# 4a. Add router cases
patch('backend/gas-backend.js',
  "      case 'sendReminders': return jsonOk(handleSendReminders(body));",
  "      case 'sendReminders':        return jsonOk(handleSendReminders(body));\n      case 'getAutoBlockConfig':  return jsonOk(handleGetAutoBlockConfig(body));\n      case 'saveAutoBlockConfig': return jsonOk(handleSaveAutoBlockConfig(body));\n      case 'runAutoBlock':        return jsonOk(handleRunAutoBlock(body));",
  'gas-backend.js: router cases')

# 4b. Add functions before installTriggers
AUTO_BLOCK_GAS = r"""
// ═══════════════════════════════════════════════════════════════
// AUTO-BLOCK SLOTS — blocks available slots for tomorrow at configured time
// ═══════════════════════════════════════════════════════════════

function handleGetAutoBlockConfig(body) {
  var props   = PropertiesService.getScriptProperties();
  var enabled = props.getProperty('AUTO_BLOCK_ENABLED');
  var time    = props.getProperty('AUTO_BLOCK_TIME');
  return {
    success: true,
    enabled: (enabled !== 'false'),
    time:    parseInt(time || '20', 10),
  };
}

function handleSaveAutoBlockConfig(body) {
  var enabled = (body.enabled !== false);
  var hour    = parseInt(body.time, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 20;
  var props = PropertiesService.getScriptProperties();
  props.setProperty('AUTO_BLOCK_ENABLED', enabled ? 'true' : 'false');
  props.setProperty('AUTO_BLOCK_TIME', String(hour));
  _installAutoBlockTrigger(hour, enabled);
  log('[autoBlock] Config saved: enabled=' + enabled + ', hour=' + hour);
  return { success: true, enabled: enabled, time: hour };
}

function handleRunAutoBlock(body) {
  return autoBlockSlots();
}

function _installAutoBlockTrigger(hour, enabled) {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'autoBlockSlots'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  if (enabled) {
    ScriptApp.newTrigger('autoBlockSlots').timeBased().atHour(hour).everyDays(1).create();
    Logger.log('[autoBlock] Trigger installed at ' + hour + ':00 daily.');
  } else {
    Logger.log('[autoBlock] Trigger removed (disabled).');
  }
}

/**
 * GAS time trigger: called at the configured hour each day.
 * Calls the auto-block-slots edge function to lock tomorrow's available slots.
 */
function autoBlockSlots() {
  var props   = PropertiesService.getScriptProperties();
  var enabled = (props.getProperty('AUTO_BLOCK_ENABLED') !== 'false');
  if (!enabled) {
    log('[autoBlock] Skipped (disabled).');
    return { success: true, skipped: true, reason: 'disabled' };
  }
  var SUPABASE_URL = props.getProperty('SUPABASE_URL');
  var ANON_KEY     = props.getProperty('SUPABASE_ANON_KEY');
  var ADMIN_TOKEN  = props.getProperty('ADMIN_TOKEN');
  if (!SUPABASE_URL || !ANON_KEY || !ADMIN_TOKEN) {
    log('[autoBlock] Missing SUPABASE_URL / SUPABASE_ANON_KEY / ADMIN_TOKEN');
    return { success: false, error: 'missing_config' };
  }
  try {
    var resp = UrlFetchApp.fetch(SUPABASE_URL + '/functions/v1/auto-block-slots', {
      method:             'post',
      contentType:        'application/json',
      headers:            { 'Authorization': 'Bearer ' + ANON_KEY },
      payload:            JSON.stringify({ adminToken: ADMIN_TOKEN }),
      muteHttpExceptions: true,
    });
    var data = JSON.parse(resp.getContentText());
    if (!data.success) throw new Error(data.error || 'edge_function_error');
    log('[autoBlock] Blocked ' + data.blocked + ' slots for tomorrow (' + data.date + ').');
    return { success: true, blocked: data.blocked, date: data.date };
  } catch (e) {
    log('[autoBlock] ERROR: ' + e.message);
    return { success: false, error: e.message };
  }
}

"""
patch('backend/gas-backend.js',
  "function installTriggers() {",
  AUTO_BLOCK_GAS + "function installTriggers() {",
  'gas-backend.js: add auto-block functions')

print('[OK]   gas-backend.js: all patches applied')
print()
print('All changes applied successfully!')
