"""
Fix addDiarySlot in admin.js: handle already_exists response from server.
Usage: python qa_fix_admin_addslot.py <abs_path_to_admin.js>
"""
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

OLD = """    const r = await apiCall('adminAddSlot', { date, time });
    if (!r.success) throw new Error(r.error);
    toast('החריץ נוסף בהצלחה ✓', 'ok');
    // Reload if the new slot falls within the current view range
    const fromVal = document.getElementById('js-diary-from') ? document.getElementById('js-diary-from').value : '';
    const toVal   = document.getElementById('js-diary-to')   ? document.getElementById('js-diary-to').value   : '';
    if (fromVal && toVal && date >= fromVal && date <= toVal) await loadDiarySlots();"""

NEW = """    const r = await apiCall('adminAddSlot', { date, time });
    if (!r.success) throw new Error(r.error);
    if (r.already_exists) {
      toast('חריץ בשעה זו כבר קיים (' + (SB_STATUS_LABEL[r.slot.status] || r.slot.status) + ')', 'warn');
    } else {
      toast('החריץ נוסף בהצלחה ✓', 'ok');
      // Reload if the new slot falls within the current view range
      const fromVal = document.getElementById('js-diary-from') ? document.getElementById('js-diary-from').value : '';
      const toVal   = document.getElementById('js-diary-to')   ? document.getElementById('js-diary-to').value   : '';
      if (fromVal && toVal && date >= fromVal && date <= toVal) await loadDiarySlots();
    }"""

assert src.count(OLD) == 1, 'ERROR: anchor found ' + str(src.count(OLD)) + ' times'
result = src.replace(OLD, NEW, 1)
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(result)
print('OK: addDiarySlot patched — already_exists handled with status toast')
