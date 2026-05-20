"""
Scan a JS file for adjacent string literals (missing + operator).
A SyntaxError "Unexpected string" occurs when two string literals
appear next to each other with no operator between them.

Patterns caught:
  '...' '...'    (two single-quoted strings adjacent)
  '...' "..."    (mixed)
  "..." '...'
  "..." "..."
  (also across whitespace/newlines)

Usage: python scan_adjacent_strings.py <path/to/file.js>
"""

import sys
import re

def scan(path):
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()

    # States
    NORMAL    = 0
    SQ_STRING = 1  # single-quoted
    DQ_STRING = 2  # double-quoted
    TL_STRING = 3  # template literal
    SL_COMMENT = 4  # // comment
    ML_COMMENT = 5  # /* comment */

    state = NORMAL
    i = 0
    n = len(src)

    # Track tokens for adjacency check
    tokens = []  # list of (line_no, col_no, type, value)

    line = 1
    col  = 1

    def cur_line_col():
        return (line, col)

    buf_start = None
    buf_line  = None
    buf_col   = None
    buf       = []

    issues = []

    while i < n:
        c = src[i]

        # ── NORMAL state ────────────────────────────────────────────────────
        if state == NORMAL:
            if c == '/' and i+1 < n and src[i+1] == '/':
                state = SL_COMMENT
                i += 2
                col += 2
                continue
            if c == '/' and i+1 < n and src[i+1] == '*':
                state = ML_COMMENT
                i += 2
                col += 2
                continue
            if c == "'":
                state = SQ_STRING
                buf_start = i
                buf_line = line
                buf_col  = col
                buf = [c]
                i += 1; col += 1
                continue
            if c == '"':
                state = DQ_STRING
                buf_start = i
                buf_line = line
                buf_col  = col
                buf = [c]
                i += 1; col += 1
                continue
            if c == '`':
                state = TL_STRING
                buf_start = i
                buf_line = line
                buf_col  = col
                buf = [c]
                i += 1; col += 1
                continue
            # track for adjacency: record non-string, non-whitespace tokens
            if not c.isspace():
                tokens.append((line, col, 'other', c))
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        # ── SINGLE-QUOTED STRING ─────────────────────────────────────────
        if state == SQ_STRING:
            buf.append(c)
            if c == '\\' and i+1 < n:
                # escaped char — consume both
                i += 1; col += 1
                buf.append(src[i])
                if src[i] == '\n':
                    line += 1; col = 1
                else:
                    col += 1
                i += 1
                continue
            if c == "'":
                # end of string
                tokens.append((buf_line, buf_col, 'string', ''.join(buf)))
                state = NORMAL
                buf = []
                i += 1; col += 1
                continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        # ── DOUBLE-QUOTED STRING ─────────────────────────────────────────
        if state == DQ_STRING:
            buf.append(c)
            if c == '\\' and i+1 < n:
                i += 1; col += 1
                buf.append(src[i])
                if src[i] == '\n':
                    line += 1; col = 1
                else:
                    col += 1
                i += 1
                continue
            if c == '"':
                tokens.append((buf_line, buf_col, 'string', ''.join(buf)))
                state = NORMAL
                buf = []
                i += 1; col += 1
                continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        # ── TEMPLATE LITERAL ─────────────────────────────────────────────
        if state == TL_STRING:
            buf.append(c)
            if c == '\\' and i+1 < n:
                i += 1; col += 1
                buf.append(src[i])
                if src[i] == '\n':
                    line += 1; col = 1
                else:
                    col += 1
                i += 1
                continue
            if c == '`':
                tokens.append((buf_line, buf_col, 'string', ''.join(buf)))
                state = NORMAL
                buf = []
                i += 1; col += 1
                continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        # ── SINGLE-LINE COMMENT ──────────────────────────────────────────
        if state == SL_COMMENT:
            if c == '\n':
                state = NORMAL
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

        # ── MULTI-LINE COMMENT ───────────────────────────────────────────
        if state == ML_COMMENT:
            if c == '*' and i+1 < n and src[i+1] == '/':
                state = NORMAL
                i += 2; col += 2
                continue
            if c == '\n':
                line += 1; col = 1
            else:
                col += 1
            i += 1
            continue

    # ── Check for adjacent string tokens ────────────────────────────────────
    # Filter: remove whitespace-only; look for consecutive 'string' tokens
    # with no 'other' token between them
    str_tokens = [t for t in tokens if t[2] in ('string', 'other')]

    found = []
    for idx in range(1, len(str_tokens)):
        prev = str_tokens[idx-1]
        curr = str_tokens[idx]
        if prev[2] == 'string' and curr[2] == 'string':
            found.append((prev, curr))

    return found


def main():
    if len(sys.argv) < 2:
        print('Usage: python scan_adjacent_strings.py <file.js>', file=sys.stderr)
        sys.exit(1)

    path = sys.argv[1]
    found = scan(path)

    if not found:
        print('OK: No adjacent string literals found.')
        sys.exit(0)

    print('FOUND ' + str(len(found)) + ' adjacent string literal pair(s):')
    for prev, curr in found:
        print('  Line ' + str(prev[0]) + ':' + str(prev[1]) +
              ' → Line ' + str(curr[0]) + ':' + str(curr[1]))
        print('    A: ' + repr(prev[3][:60]))
        print('    B: ' + repr(curr[3][:60]))
    sys.exit(1)


if __name__ == '__main__':
    main()
