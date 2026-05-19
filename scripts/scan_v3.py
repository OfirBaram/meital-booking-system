"""
Static syntax check for adjacent string literals in JS files.

A SyntaxError "Unexpected string" happens when two string literals sit
next to each other with no operator between them, e.g.:

    'a' 'b'         ->  SyntaxError
    'a''b'          ->  SyntaxError
    'a' + 'b'       ->  OK

This tokenizer handles, as whole opaque units:
  - single / double quoted strings, with \\ escapes
  - template literals, INCLUDING nested ${ ... } expressions and
    template literals nested inside those expressions
  - regex literals  /.../flags  with [ ] character classes
  - // line comments and /* block */ comments

Each template literal is treated as ONE string-like token; the content of
its ${...} expressions is not separately checked (none of the historical
bugs lived there, and skipping it removes all false positives).

Usage: python scan_v3.py <file.js> [<file2.js> ...]
Exit code 0 = clean, 1 = adjacent string pair(s) found.
"""
import sys

BS = chr(92)   # backslash
SQ = chr(39)   # '
DQ = chr(34)   # "
BT = chr(96)   # `


def scan_template(src, i):
    """src[i] is an opening backtick. Return index just past the closing
    backtick, correctly skipping ${ ... } expressions (with nested braces,
    strings and nested template literals)."""
    n = len(src)
    i += 1  # consume opening `
    while i < n:
        c = src[i]
        if c == BS:
            i += 2
            continue
        if c == BT:
            return i + 1
        if c == '$' and i + 1 < n and src[i + 1] == '{':
            # scan the expression until the matching }
            i += 2
            depth = 1
            while i < n and depth > 0:
                ch = src[i]
                if ch == BS:
                    i += 2
                    continue
                if ch == '{':
                    depth += 1
                    i += 1
                    continue
                if ch == '}':
                    depth -= 1
                    i += 1
                    continue
                if ch == SQ or ch == DQ:
                    quote = ch
                    i += 1
                    while i < n:
                        if src[i] == BS:
                            i += 2
                            continue
                        if src[i] == quote:
                            i += 1
                            break
                        if src[i] == '\n':
                            break
                        i += 1
                    continue
                if ch == BT:
                    i = scan_template(src, i)
                    continue
                i += 1
            continue
        i += 1
    return n  # unterminated — bail


def tokenize(src):
    """Return a flat list of (line, col, kind) tokens.
    kind is one of: 'string', 'template', 'regex', 'other'."""
    tokens = []
    i = 0
    n = len(src)

    # precompute line/col for any index lazily
    def line_col(idx):
        line = src.count('\n', 0, idx) + 1
        last_nl = src.rfind('\n', 0, idx)
        col = idx - last_nl
        return line, col

    while i < n:
        c = src[i]

        # line comment
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j == -1 else j
            continue
        # block comment
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            i = n if j == -1 else j + 2
            continue
        # regex literal — heuristic: '/' in operator position
        if c == '/':
            j = i - 1
            while j >= 0 and src[j] in ' \t\r\n':
                j -= 1
            prev = src[j] if j >= 0 else ''
            is_regex = prev not in (')', ']', '}') and not (prev.isalnum() or prev == '_')
            if is_regex:
                ln, cl = line_col(i)
                k = i + 1
                in_class = False
                while k < n:
                    ch = src[k]
                    if ch == BS:
                        k += 2
                        continue
                    if ch == '[':
                        in_class = True
                        k += 1
                        continue
                    if ch == ']':
                        in_class = False
                        k += 1
                        continue
                    if ch == '/' and not in_class:
                        k += 1
                        break
                    if ch == '\n':
                        break
                    k += 1
                while k < n and src[k].isalpha():
                    k += 1
                tokens.append((ln, cl, 'regex'))
                i = k
                continue
        # quoted string
        if c == SQ or c == DQ:
            ln, cl = line_col(i)
            quote = c
            k = i + 1
            while k < n:
                ch = src[k]
                if ch == BS:
                    k += 2
                    continue
                if ch == quote:
                    k += 1
                    break
                if ch == '\n':
                    break  # unterminated
                k += 1
            tokens.append((ln, cl, 'string'))
            i = k
            continue
        # template literal
        if c == BT:
            ln, cl = line_col(i)
            tokens.append((ln, cl, 'template'))
            i = scan_template(src, i)
            continue
        # whitespace
        if c.isspace():
            i += 1
            continue
        # any other significant char
        ln, cl = line_col(i)
        tokens.append((ln, cl, 'other'))
        i += 1

    return tokens


def find_adjacent(tokens):
    """Return list of (prev, curr) where two string-likes are adjacent
    with no 'other' token between them."""
    issues = []
    STRINGLIKE = ('string', 'template')
    for idx in range(1, len(tokens)):
        p, q = tokens[idx - 1], tokens[idx]
        if p[2] in STRINGLIKE and q[2] in STRINGLIKE:
            issues.append((p, q))
    return issues


def main():
    if len(sys.argv) < 2:
        print('Usage: python scan_v3.py <file.js> [...]', file=sys.stderr)
        sys.exit(1)

    total = 0
    for path in sys.argv[1:]:
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        tokens = tokenize(src)
        issues = find_adjacent(tokens)
        if not issues:
            print('OK   ' + path)
        else:
            total += len(issues)
            print('FAIL ' + path + '  (' + str(len(issues)) + ' adjacent string pair(s))')
            for p, q in issues:
                print('     line ' + str(p[0]) + ' col ' + str(p[1]) +
                      '  ->  line ' + str(q[0]) + ' col ' + str(q[1]))

    print()
    if total:
        print('RESULT: ' + str(total) + ' potential SyntaxError(s) found.')
        sys.exit(1)
    print('RESULT: clean — no adjacent string literals.')
    sys.exit(0)


if __name__ == '__main__':
    main()
