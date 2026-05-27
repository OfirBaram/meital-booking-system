"""
ai_tools.py — Safe file-patch utility for Claude Code agents on this repo.

Usage (CLI):
    python scripts/ai_tools.py patch <file> --old <old_str> --new <new_str>
    python scripts/ai_tools.py verify <file> --contains <snippet>
    python scripts/ai_tools.py read <file> [--lines N-M]

Usage (import):
    import sys; sys.path.insert(0, '.')
    from scripts.ai_tools import patch_file, verify_contains, read_file

Design constraints:
  - PROJECT_ROOT is the directory containing this script's parent (scripts/../).
  - No subprocess calls — avoids RTL-path encoding issues with git stdout.
  - Reads and writes use UTF-8, LF line endings.
  - Raises ValueError with diagnostic info if old_str is not found.
  - Raises ValueError if old_str == new_str (no-op guard).
"""

import sys
import os
import argparse
from pathlib import Path


# ─── Project root ─────────────────────────────────────────────────────────────
# Resolve from __file__ so this works from any shell or CWD.
# scripts/ai_tools.py → scripts/ → project root

PROJECT_ROOT = Path(__file__).resolve().parent.parent


# ─── Core helpers ─────────────────────────────────────────────────────────────

def _resolve(rel_path: str) -> Path:
    """Resolve a relative (or absolute) path against PROJECT_ROOT."""
    p = Path(rel_path)
    return p if p.is_absolute() else PROJECT_ROOT / p


def read_file(rel_path: str) -> str:
    """Read a file and return its content as a string (LF-normalised)."""
    path = _resolve(rel_path)
    content = path.read_text(encoding='utf-8')
    return content.replace('\r\n', '\n')


def write_file(rel_path: str, content: str) -> None:
    """Write content to a file with UTF-8 encoding and LF line endings."""
    path = _resolve(rel_path)
    path.write_text(content, encoding='utf-8', newline='\n')


def patch_file(rel_path: str, old_str: str, new_str: str, *, allow_multiple: bool = False) -> int:
    """
    Replace old_str with new_str in the file at rel_path.

    Returns the number of replacements made.
    Raises ValueError if old_str is not found, or appears multiple times
    and allow_multiple is False.
    """
    if old_str == new_str:
        raise ValueError("patch_file: old_str and new_str are identical — no-op")

    content = read_file(rel_path)
    count = content.count(old_str)

    if count == 0:
        lines = content.splitlines()
        first_line = old_str.splitlines()[0][:40] if old_str else ''
        matches = [(i, l) for i, l in enumerate(lines, 1) if first_line in l]
        hint = f"\n  Closest line: {matches[0]}" if matches else ""
        raise ValueError(
            f"patch_file: '{old_str[:60]}' not found in {rel_path}.{hint}"
        )

    if count > 1 and not allow_multiple:
        raise ValueError(
            f"patch_file: old_str appears {count} times in {rel_path}. "
            "Use allow_multiple=True to replace all occurrences."
        )

    new_content = content.replace(old_str, new_str)
    write_file(rel_path, new_content)
    return count


def verify_contains(rel_path: str, snippet: str, *, label: str = '') -> bool:
    """Assert that a snippet exists in the file. Prints PASS/FAIL."""
    content = read_file(rel_path)
    tag = f"[{label}] " if label else ''
    if snippet in content:
        print(f"  PASS {tag}{snippet[:70]!r}")
        return True
    raise AssertionError(f"  FAIL {tag}NOT found: {snippet[:70]!r}")


def verify_not_contains(rel_path: str, snippet: str, *, label: str = '') -> bool:
    """Assert that a snippet does NOT exist in the file."""
    content = read_file(rel_path)
    tag = f"[{label}] " if label else ''
    if snippet not in content:
        print(f"  PASS {tag}absent: {snippet[:70]!r}")
        return True
    raise AssertionError(f"  FAIL {tag}still present: {snippet[:70]!r}")


def line_count(rel_path: str) -> int:
    """Return the number of lines in the file."""
    return read_file(rel_path).count('\n') + 1


# ─── CLI interface ─────────────────────────────────────────────────────────────

def _cmd_patch(args):
    count = patch_file(args.file, args.old, args.new,
                       allow_multiple=getattr(args, 'all', False))
    print(f"  PATCHED {count}x in {args.file}")


def _cmd_verify(args):
    verify_contains(args.file, args.contains, label=args.label or '')


def _cmd_read(args):
    content = read_file(args.file)
    if args.lines:
        start, end = (int(x) for x in args.lines.split('-'))
        lines = content.splitlines()
        for i, line in enumerate(lines[start - 1:end], start):
            print(f"{i}: {line}")
    else:
        print(content)


def main():
    parser = argparse.ArgumentParser(description='AI agent file-patch utility')
    sub = parser.add_subparsers(dest='command', required=True)

    p_patch = sub.add_parser('patch', help='Replace old_str with new_str in a file')
    p_patch.add_argument('file')
    p_patch.add_argument('--old', required=True)
    p_patch.add_argument('--new', required=True)
    p_patch.add_argument('--all', action='store_true', help='Replace all occurrences')

    p_verify = sub.add_parser('verify', help='Assert a snippet exists in a file')
    p_verify.add_argument('file')
    p_verify.add_argument('--contains', required=True)
    p_verify.add_argument('--label', default='')

    p_read = sub.add_parser('read', help='Print file contents (optionally a line range)')
    p_read.add_argument('file')
    p_read.add_argument('--lines', help='Line range, e.g. 10-20')

    args = parser.parse_args()

    try:
        if args.command == 'patch':    _cmd_patch(args)
        elif args.command == 'verify': _cmd_verify(args)
        elif args.command == 'read':   _cmd_read(args)
    except (ValueError, AssertionError) as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
