"""Scan JS for adjacent string literals. Outputs ASCII-safe results."""
import sys

def scan(path):
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()

    NORMAL, SQ, DQ, TL, SLC, MLC = 0, 1, 2, 3, 4, 5
    state = NORMAL
    i = 0
    n = len(src)
    tokens = []
    line = 1
    col = 1
    buf_line = None
    buf_col = None
    buf = []

    BACKSLASH = chr(92)  # avoid literal backslash in source

    while i < n:
        c = src[i]

        if state == NORMAL:
            if c == '/' and i+1 < n and src[i+1] == '/':
                state = SLC; i += 2; col += 2; continue
            if c == '/' and i+1 < n and src[i+1] == '*':
                state = MLC; i += 2; col += 2; continue
            if c == "'":
                state = SQ; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if c == '"':
                state = DQ; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if c == '`':
                state = TL; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if not c.isspace():
                tokens.append((line, col, 'other', c))
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        if state in (SQ, DQ, TL):
            buf.append(c)
            if c == BACKSLASH and i+1 < n:
                i += 1; col += 1
                buf.append(src[i])
                if src[i] == '\n':
                    line += 1; col = 1
                else:
                    col += 1
                i += 1
                continue
            end_char = ("'" if state == SQ else ('"' if state == DQ else '`'))
            if c == end_char:
                tokens.append((buf_line, buf_col, 'string', ''.join(buf)))
                state = NORMAL; buf = []; i += 1; col += 1; continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        if state == SLC:
            if c == '\n':
                state = NORMAL; line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        if state == MLC:
            if c == '*' and i+1 < n and src[i+1] == '/':
                state = NORMAL; i += 2; col += 2; continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

    st = [t for t in tokens if t[2] in ('string', 'other')]
    found = []
    for idx in range(1, len(st)):
        p, q = st[idx-1], st[idx]
        if p[2] == 'string' and q[2] == 'string':
            found.append((p, q))
    return found


def main():
    path = sys.argv[1]
    found = scan(path)
    if not found:
        print('OK: No adjacent string literals found.')
        sys.exit(0)

    print('FOUND ' + str(len(found)) + ' adjacent string literal pair(s):')
    for prev, curr in found:
        a = prev[3][:80].encode('ascii', 'replace').decode()
        b = curr[3][:80].encode('ascii', 'replace').decode()
        print('  Line ' + str(prev[0]) + ' col ' + str(prev[1]) +
              '  /  Line ' + str(curr[0]) + ' col ' + str(curr[1]))
        print('    A: ' + a)
        print('    B: ' + b)
    sys.exit(1)


if __name__ == '__main__':
    main()
