"""
Fix handleAdminAddSlotV2: replace merge-duplicates upsert with check-before-insert.
Usage: python qa_fix_supabase_addslot.py <abs_path_to_SupabaseLayer.js>
"""
import sys

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# Anchor: just the upsert block + return, no comment lines with unicode dashes
OLD = """  var inserted = SupabaseService.insert('slots', {
    start_time:   startUtc,
    end_time:     endUtc,
    status:       'available',
    last_updated: new Date().toISOString(),
  }, 'start_time');

  if (!inserted || !inserted[0]) return { success: false, error: 'insert_failed' };

  return {
    success: true,
    slot: { id: inserted[0].id, date: date, time: time, status: 'available' },
  };
}"""

NEW = """  // Check before insert — merge-duplicates would reset status on booked/pending slots
  var existing = SupabaseService.select('slots',
    'start_time=eq.' + encodeURIComponent(startUtc) + '&select=id,status&limit=1');
  if (existing && existing.length > 0) {
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

  return {
    success: true,
    slot: { id: inserted[0].id, date: date, time: time, status: 'available' },
  };
}"""

count = src.count(OLD)
assert count == 1, 'ERROR: anchor found ' + str(count) + ' times'
result = src.replace(OLD, NEW, 1)
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(result)
print('OK: handleAdminAddSlotV2 patched — merge-duplicates removed, check-first added')
