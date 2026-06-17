#!/usr/bin/env python3
"""
AI Test Healer
==============
Reads Playwright + Vitest failures, calls Claude API to classify and fix
them, applies patches, then commits and pushes to the current branch.

Exit codes:
  0 — healed successfully (or no failures found)
  1 — analysis produced no applicable fixes
  2 — failure count exceeds MAX_FAILURES threshold (build should fail)
"""

import os, sys, re, json, subprocess
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
MAX_FAILURES    = 5          # heal up to this many; >MAX = skip + exit 2
CLAUDE_MODEL    = "claude-sonnet-4-6"
MAX_TOKENS      = 4096
MAX_FILE_LINES  = 300        # cap how many lines we send per source file
MAX_DIFF_CHARS  = 5000       # cap git diff sent to Claude
MAX_BODY_CHARS  = 3000       # cap per-failure body sent to Claude

# ── Helpers ───────────────────────────────────────────────────────────────────

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)

REPO_ROOT = Path(sh("git rev-parse --show-toplevel").stdout.strip())


def read_file(path, max_lines=MAX_FILE_LINES):
    try:
        p = Path(path)
        if not p.exists():
            return None
        lines = p.read_text(encoding="utf-8").splitlines()
        if len(lines) > max_lines:
            return "\n".join(lines[:max_lines]) + f"\n… ({len(lines)-max_lines} more lines)"
        return p.read_text(encoding="utf-8")
    except Exception:
        return None


# ── Failure gathering ─────────────────────────────────────────────────────────

def gather_e2e_failures():
    """Parse CLAUDE-FAILURES.md produced by diagnostic-reporter.js."""
    p = Path("test-results/CLAUDE-FAILURES.md")
    if not p.exists():
        return []
    content = p.read_text(encoding="utf-8")
    if "all green" in content.lower():
        return []

    failures = []
    # Each section starts with "## N. Title"
    sections = re.split(r"^## \d+\. ", content, flags=re.MULTILINE)
    for sec in sections[1:]:
        lines = sec.strip().splitlines()
        title = lines[0].strip() if lines else "unknown"
        loc_m = re.search(r"\*\*Location:\*\*\s*`([^`]+)`", sec)
        err_m = re.search(r"### Error\n```\n(.*?)```", sec, re.DOTALL)
        console_m = re.search(r"### Browser console\n```\n(.*?)```", sec, re.DOTALL)
        failures.append({
            "type":     "e2e",
            "title":    title,
            "location": loc_m.group(1) if loc_m else "",
            "error":    (err_m.group(1) or "").strip()[:2000] if err_m else "",
            "console":  (console_m.group(1) or "").strip()[:1000] if console_m else "",
            "body":     sec[:MAX_BODY_CHARS],
        })
    return failures


def gather_unit_failures():
    """Parse Vitest JSON output written to test-results/vitest-results.json."""
    p = Path("test-results/vitest-results.json")
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []

    failures = []
    for suite in data.get("testResults", []):
        file_path = suite.get("testFilePath", "")
        # Make relative to repo root
        try:
            rel = str(Path(file_path).relative_to(REPO_ROOT))
        except ValueError:
            rel = file_path

        for test in suite.get("assertionResults", []):
            if test.get("status") != "failed":
                continue
            ancestors = test.get("ancestorTitles", [])
            title = " > ".join(ancestors + [test.get("title", "?")])
            msgs  = test.get("failureMessages", [])
            failures.append({
                "type":     "unit",
                "title":    title,
                "location": f"{rel}",
                "error":    "\n".join(msgs)[:2000],
                "console":  "",
                "body":     "",
            })
    return failures


# ── Context gathering ─────────────────────────────────────────────────────────

def _resolve_import(imp, base_dir):
    """Try to resolve a relative JS import to an existing file."""
    if not imp.startswith("."):
        return None
    base = Path(base_dir)
    candidate = (base / imp).resolve()
    for suffix in ("", ".js", ".ts", ".jsx", ".tsx"):
        p = candidate.with_suffix(suffix) if suffix else candidate
        if p.exists():
            return p
    return None


def gather_context(failures):
    """Read the test files + their direct imports (one level deep)."""
    collected = {}

    for f in failures:
        loc = f.get("location", "")
        # Strip line number suffix (e.g., "tests/e2e/foo.spec.js:42")
        file_part = loc.split(":")[0] if ":" in loc else loc
        candidates = [file_part, REPO_ROOT / file_part]

        for c in candidates:
            p = Path(c)
            if not p.exists():
                continue
            content = read_file(p)
            if content is None:
                continue
            key = str(p.relative_to(REPO_ROOT)) if p.is_absolute() else str(p)
            collected[key] = content

            # One level of imports
            for imp in re.findall(r"""(?:from|require)\s*['"]([^'"]+)['"]""", content):
                resolved = _resolve_import(imp, p.parent)
                if resolved:
                    try:
                        rk = str(resolved.relative_to(REPO_ROOT))
                        if rk not in collected:
                            src = read_file(resolved)
                            if src:
                                collected[rk] = src
                    except ValueError:
                        pass
            break

    return collected


def get_recent_diff():
    diff = sh("git diff HEAD~3..HEAD -- frontend/ tests/ --unified=3")
    out = diff.stdout or ""
    return out[:MAX_DIFF_CHARS] + ("\n…(truncated)…" if len(out) > MAX_DIFF_CHARS else "")


# ── Claude API ────────────────────────────────────────────────────────────────

def build_prompt(failures, context_files, recent_diff):
    failure_text = ""
    for i, f in enumerate(failures, 1):
        failure_text += f"\n### Failure {i} [{f['type'].upper()}]: {f['title']}\n"
        if f["location"]:
            failure_text += f"File: `{f['location']}`\n"
        if f["error"]:
            failure_text += f"```\n{f['error']}\n```\n"
        if f["console"]:
            failure_text += f"Browser console:\n```\n{f['console']}\n```\n"

    context_text = ""
    for path, content in list(context_files.items())[:10]:
        context_text += f"\n### {path}\n```javascript\n{content[:3000]}\n```\n"

    return f"""You are a QA automation engineer for a Hebrew RTL nail-salon booking system.
Stack: Vanilla JS, Tailwind, Playwright E2E, Vitest unit tests, Supabase backend.
Key rule: slot status is lowercase ('available'), booking status is Title Case ('Pending').

## Failing Tests ({len(failures)} total)
{failure_text}

## Relevant Source Files
{context_text}

## Recent Git Changes (what just landed)
```diff
{recent_diff[:MAX_DIFF_CHARS]}
```

## Your Task
1. For each failure identify the root cause.
2. Group failures that share the SAME root cause (one fix resolves multiple).
3. Classify each group:
   - SYSTEM_BUG        — code is wrong; fix the source file
   - TEST_NEEDS_UPDATE — product changed intentionally; update the test assertion
   - FLAKY_TEST        — timing/race; add waitFor / increase timeout in the test
   - UNCLEAR           — not enough info; propose no fix
4. Produce minimal, surgical patches (old_code → new_code exact-string replacements).
5. Only propose fixes with HIGH or MEDIUM confidence.

## IMPORTANT constraints
- old_code must be an EXACT substring present in the file right now.
- Do not guess — if you are unsure about the exact string, set confidence to LOW and skip fixes.
- Do not add explanatory comments to code.
- Prefer fixing tests over source code when the product change is clearly intentional.

## Response — return ONLY valid JSON (no markdown wrapper):
{{
  "summary": "one-sentence explanation of the overall failure pattern",
  "groups": [
    {{
      "root_cause": "concise explanation",
      "classification": "SYSTEM_BUG|TEST_NEEDS_UPDATE|FLAKY_TEST|UNCLEAR",
      "confidence": "HIGH|MEDIUM|LOW",
      "affected_failure_indices": [1, 3],
      "fixes": [
        {{
          "file": "relative/path/from/repo/root.js",
          "description": "what changes and why",
          "old_code": "exact verbatim string to find",
          "new_code": "replacement string"
        }}
      ]
    }}
  ]
}}"""


def call_claude(failures, context_files, recent_diff):
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = build_prompt(failures, context_files, recent_diff)

    print("Calling Claude API…")
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = resp.content[0].text.strip()
    # Strip optional ```json … ``` wrapper
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


# ── Patch application ─────────────────────────────────────────────────────────

def apply_fixes(analysis):
    applied = []
    for group in analysis.get("groups", []):
        if group.get("classification") == "UNCLEAR":
            print(f"  SKIP group (UNCLEAR): {group.get('root_cause', '')}")
            continue
        if group.get("confidence", "LOW") == "LOW":
            print(f"  SKIP group (LOW confidence): {group.get('root_cause', '')}")
            continue

        for fix in group.get("fixes", []):
            rel_path = fix.get("file", "")
            old_code = fix.get("old_code", "")
            new_code = fix.get("new_code", "")
            if not all([rel_path, old_code, new_code is not None]):
                print(f"  SKIP incomplete fix for {rel_path}")
                continue

            abs_path = REPO_ROOT / rel_path
            if not abs_path.exists():
                print(f"  SKIP {rel_path}: file not found")
                continue

            content = abs_path.read_text(encoding="utf-8")
            if old_code not in content:
                print(f"  SKIP {rel_path}: old_code not found")
                continue

            patched = content.replace(old_code, new_code, 1)
            abs_path.write_text(patched, encoding="utf-8")
            print(f"  FIXED {rel_path}: {fix.get('description', '')}")
            applied.append({**fix, "group_cause": group.get("root_cause", "")})

    return applied


# ── Git commit + push ─────────────────────────────────────────────────────────

def commit_and_push(applied, summary):
    sh("git config user.email 'ai-healer@github-actions.invalid'")
    sh("git config user.name  'AI Test Healer'")
    sh("git add -u")

    if not sh("git status --porcelain").stdout.strip():
        print("Nothing to commit.")
        return False

    fix_lines = "\n".join(
        f"- [{f.get('group_cause','?')[:60]}] {f['file']}: {f.get('description','')[:80]}"
        for f in applied[:5]
    )
    msg = (
        f"fix(auto-heal): {summary}\n\n"
        f"{fix_lines}\n\n"
        f"Co-Authored-By: claude-sonnet-4-6 <noreply@anthropic.com>"
    )

    r = sh(f'git commit -m {json.dumps(msg)}')
    if r.returncode != 0:
        print(f"Commit failed:\n{r.stderr}")
        return False

    # Push to whatever branch is currently checked out
    branch = sh("git rev-parse --abbrev-ref HEAD").stdout.strip()
    r = sh(f"git push origin HEAD:{branch}")
    if r.returncode != 0:
        print(f"Push failed:\n{r.stderr}")
        sys.exit(1)

    print(f"Pushed {len(applied)} fix(es) to '{branch}'.")
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Loop-prevention: don't re-heal a commit the healer itself made
    last_msg = sh("git log -1 --pretty=%s").stdout.strip()
    if "fix(auto-heal):" in last_msg:
        print("Last commit is already a healer fix — skipping to prevent loops.")
        sys.exit(0)

    # Gather failures from both test types
    e2e_failures  = gather_e2e_failures()
    unit_failures = gather_unit_failures()
    all_failures  = e2e_failures + unit_failures

    if not all_failures:
        print("No failures found — nothing to heal.")
        sys.exit(0)

    n = len(all_failures)
    print(f"Found {n} failure(s): {len(e2e_failures)} E2E, {len(unit_failures)} unit.")

    if n > MAX_FAILURES:
        print(
            f"\nERROR: {n} failures exceed the {MAX_FAILURES}-failure auto-heal limit.\n"
            "Too many failures — skipping AI heal. Fix manually.\n"
        )
        sys.exit(2)

    context_files = gather_context(all_failures)
    recent_diff   = get_recent_diff()
    print(f"Context: {len(context_files)} source file(s) gathered.")

    analysis = call_claude(all_failures, context_files, recent_diff)
    summary  = analysis.get("summary", "test failures")
    print(f"\nAnalysis: {summary}")

    for g in analysis.get("groups", []):
        indices = g.get("affected_failure_indices", [])
        n_fixes = len(g.get("fixes", []))
        print(
            f"  [{g.get('classification')} / {g.get('confidence')}] "
            f"{g.get('root_cause', '')} "
            f"(failures {indices}, {n_fixes} fix(es))"
        )

    applied = apply_fixes(analysis)

    if not applied:
        print("\nNo fixes applied — all groups were UNCLEAR or LOW confidence.")
        sys.exit(1)

    committed = commit_and_push(applied, summary)
    sys.exit(0 if committed else 1)


if __name__ == "__main__":
    main()
