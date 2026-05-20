"""Verify line 1076 fix and scan for remaining '' adjacent patterns."""
import re
import os

path = r'C:\Users\DELL\Documents\GitHub\‏‏OfirBaram\.git\meital-booking-system\frontend\admin.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print('Line 1076:', lines[1075].rstrip().encode('ascii', 'replace').decode())

BS = chr(92)
SQ = chr(39)

# Scan for two adjacent single quotes where the preceding char is not backslash
print()
print('=== Scanning for adjacent single-quote pairs ===')
found = []
for i, line in enumerate(lines, 1):
    j = 0
    raw = line
    while j < len(raw) - 1:
        if raw[j] == SQ and raw[j+1] == SQ:
            # Check if the first ' is not preceded by backslash (i.e. not \')
            if j == 0 or raw[j-1] != BS:
                ctx = raw.rstrip()[:120].encode('ascii', 'replace').decode()
                found.append((i, j+1, ctx))
            j += 2
        else:
            j += 1

if found:
    for line_no, col, ctx in found:
        print('  Line ' + str(line_no) + ' col ' + str(col) + ': ' + ctx)
else:
    print('  None found. File looks clean.')
