import os, sys

BACKSLASH = chr(92)

def scan_file(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            lines = f.readlines()
    except Exception:
        return []

    depth = 0
    in_block_comment = False
    results = []

    for lineno, raw in enumerate(lines, 1):
        work = raw

        if in_block_comment:
            if '*/' in work:
                work = work[work.index('*/') + 2:]
                in_block_comment = False
            else:
                depth += work.count('{') - work.count('}')
                if depth < 0:
                    depth = 0
                continue

        # strip /* */ and // comments
        i = 0
        buf = []
        while i < len(work):
            if work[i:i+2] == '/*':
                end = work.find('*/', i + 2)
                if end == -1:
                    in_block_comment = True
                    work = work[:i]
                    break
                i = end + 2
            elif work[i:i+2] == '//':
                work = work[:i]
                break
            else:
                buf.append(work[i])
                i += 1
        work = ''.join(buf)

        # strip string literals
        stripped = []
        j = 0
        while j < len(work):
            c = work[j]
            if c in ('"', "'", '`'):
                quote = c
                j += 1
                while j < len(work):
                    ch = work[j]
                    if ch == BACKSLASH:
                        j += 2
                        continue
                    if ch == quote:
                        j += 1
                        break
                    j += 1
                continue
            stripped.append(c)
            j += 1
        work = ''.join(stripped)

        is_def = ('function prop(' in raw) or ('function prop (' in raw)
        if not is_def and 'prop(' in work and depth == 0:
            results.append((lineno, raw.rstrip()))

        depth += work.count('{') - work.count('}')
        if depth < 0:
            depth = 0

    return results

root = r'C:\Users\DELL\Documents\GitHub‏‏OfirBaram\.git\meital-booking-system'
extensions = ('.js', '.gs', '.ts')
found_any = False

for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in ('.git', 'node_modules')]
    for fname in sorted(filenames):
        if fname.endswith(extensions):
            fpath = os.path.join(dirpath, fname)
            hits = scan_file(fpath)
            if hits:
                found_any = True
                rel = os.path.relpath(fpath, root)
                for lineno, text in hits:
                    print('%s:%d: %s' % (rel, lineno, text))

if not found_any:
    print('No top-level prop() calls found in any JS/GS file.')
