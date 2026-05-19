import os

path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    'frontend', 'admin.js')
print('Path:', path)
print('Exists:', os.path.exists(path))
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
print('Lines:', len(lines))
for i, l in enumerate(lines, 1):
    if 'toggleDiarySlot' in l or '_processHistoryDecision' in l:
        print(str(i) + ': ' + l.rstrip()[:120])
