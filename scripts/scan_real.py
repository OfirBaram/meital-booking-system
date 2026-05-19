"""Scan the real admin.js for adjacent string literals. Handles regex literals."""
import os, sys, re

def scan(path):
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()

    NORMAL, SQ, DQ, TL, SLC, MLC, REGEX = 0, 1, 2, 3, 4, 5, 6
    state = NORMAL
    i = 0
    n = len(src)
    tokens = []
    line = 1
    col = 1
    buf_line = None
    buf_col = None
    buf = []
    prev_token_type = None  # 'other' or 'string'

    BS = chr(92)  # backslash

    def advance_char():
        nonlocal i, line, col
        c = src[i]
        if c == '\n':
            line += 1; col = 1
        else:
            col += 1
        i += 1

    while i < n:
        c = src[i]

        if state == NORMAL:
            # single-line comment
            if c == '/' and i+1 < n and src[i+1] == '/':
                state = SLC; i += 2; col += 2; continue
            # multi-line comment
            if c == '/' and i+1 < n and src[i+1] == '*':
                state = MLC; i += 2; col += 2; continue
            # regex literal — heuristic: / after operator/punctuation/keyword
            if c == '/' and prev_token_type != 'string':
                # Only treat as regex if preceded by operator context
                # (after 'other' token that is not ) ] identifier)
                # Check last non-whitespace before this /
                j = i - 1
                while j >= 0 and src[j] in ' \t\r\n': j -= 1
                prev_ch = src[j] if j >= 0 else ''
                if prev_ch not in (')', ']') and not (prev_ch.isalnum() or prev_ch == '_'):
                    state = REGEX; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            # strings
            if c == "'":
                state = SQ; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if c == '"':
                state = DQ; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if c == '`':
                state = TL; buf_line = line; buf_col = col; buf = [c]; i += 1; col += 1; continue
            if not c.isspace():
                tokens.append((line, col, 'other', c))
                prev_token_type = 'other'
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        if state == REGEX:
            buf.append(c)
            if c == BS and i+1 < n:
                i += 1; col += 1; buf.append(src[i])
                if src[i] == '\n': line += 1; col = 1
                else: col += 1
                i += 1; continue
            if c == '[':
                # character class — consume until ]
                i += 1; col += 1
                buf.append(src[i] if i < n else '')
                while i < n and src[i] != ']':
                    buf.append(src[i])
                    if src[i] == '\n': line += 1; col = 1
                    else: col += 1
                    i += 1
                if i < n:
                    buf.append(src[i])  # the ]
                    col += 1; i += 1
                continue
            if c == '/':
                # end of regex — consume flags
                i += 1; col += 1
                while i < n and src[i].isalpha():
                    buf.append(src[i]); i += 1; col += 1
                tokens.append((buf_line, buf_col, 'regex', ''.join(buf)))
                prev_token_type = 'other'
                state = NORMAL; buf = []
                continue
            if c == '\n': line += 1; col = 1
            else: col += 1
            i += 1; continue

        if state in (SQ, DQ, TL):
            buf.append(c)
            if c == BS and i+1 < n:
                i += 1; col += 1; buf.append(src[i])
                if src[i] == '\n': line += 1; col = 1
                else: col += 1
                i += 1; continue
            end_char = ("'" if state == SQ else ('"' if state == DQ else '`'))
            if c == end_char:
                tokens.append((buf_line, buf_col, 'string', ''.join(buf)))
                prev_token_type = 'string'
                state = NORMAL; buf = []; i += 1; col += 1; continue
            if c == '\n': line += 1; col = 1
            else: col += 1
            i += 1; continue

        if state == SLC:
            if c == '\n': state = NORMAL; line += 1; col = 1
            else: col += 1
            i += 1; continue

        if state == MLC:
            if c == '*' and i+1 < n and src[i+1] == '/':
                state = NORMAL; i += 2; col += 2; continue
            if c == '\n': line += 1; col = 1
            else: col += 1
            i += 1; continue

    # Filter and check for adjacency
    st = [t for t in tokens if t[2] in ('string', 'other')]
    found = []
    for idx in range(1, len(st)):
        p, q = st[idx-1], st[idx]
        if p[2] == 'string' and q[2] == 'string':
            found.append((p, q))
    return found


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(os.path.dirname(script_dir), 'frontend', 'admin.js')
    print('Scanning: ' + path)

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
