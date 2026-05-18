"""
check_sheet_data.py
Calls the GAS /exec endpoint for getSlots (May 2026) and prints:
  - Raw JSON response
  - Per-day slot breakdown
  - Whether any slots exist
"""
import sys, json, time, urllib.request, urllib.error

sys.stdout.reconfigure(encoding='utf-8')

URL = (
    'https://script.google.com/macros/s/'
    'AKfycbw6meLhe531XoFsrN4wPc4osxjEggrbGDf2nptn9Ym8WYvZNu2s8ssFzR3jhMZqmUO8qA'
    '/exec'
)

YEAR  = 2026
MONTH = 5

def get_slots(year, month):
    url = f'{URL}?action=getSlots&year={year}&month={month}'
    req = urllib.request.Request(url, method='GET')
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            ms = int((time.time() - t0) * 1000)
            body = resp.read().decode('utf-8')
            return resp.status, ms, body
    except urllib.error.HTTPError as e:
        ms = int((time.time() - t0) * 1000)
        return e.code, ms, e.read().decode('utf-8')

print(f'Querying GAS for slots: year={YEAR}, month={MONTH}')
print('URL:', URL)
print()

status, ms, raw = get_slots(YEAR, MONTH)
print(f'HTTP {status} | {ms} ms')
print()

# Try to parse JSON
try:
    data = json.loads(raw)
except json.JSONDecodeError as e:
    print(f'JSON PARSE ERROR: {e}')
    print('Raw response (first 500 chars):')
    print(raw[:500])
    sys.exit(1)

print('success:', data.get('success'))
print('fromCache:', data.get('fromCache', False))
print()

slots = data.get('slots', {})
total_days  = len(slots)
total_times = sum(len(v) for v in slots.values())

print(f'Days with slots : {total_days}')
print(f'Total time slots: {total_times}')
print()

if total_days == 0:
    print('*** NO SLOTS FOUND for May 2026 ***')
    print()
    print('Possible causes:')
    print('  1. Weekly_Slots sheet has no rows for 2026-05-xx')
    print('  2. All rows have Status != "Available"')
    print('  3. Date column values are in a format GAS cannot parse')
    print()
    print('Full raw response:')
    print(json.dumps(data, ensure_ascii=False, indent=2))
else:
    print('Slots by date:')
    for date in sorted(slots.keys()):
        times = slots[date]
        print(f'  {date}: {times}')
    print()
    print('Full raw response:')
    print(json.dumps(data, ensure_ascii=False, indent=2))
