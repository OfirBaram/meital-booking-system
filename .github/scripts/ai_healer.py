#!/usr/bin/env python3
"""
AI Test Healer — v2
====================
Reads Playwright + Vitest failures, optionally calls Claude API to classify
and fix them, then either applies patches or opens a GitHub Issue.

Exit codes:
  0 — healed successfully (or no failures found / all issues logged as GH Issues)
  1 — analysis produced no applicable fixes (Claude was called but nothing applied)
  2 — failure count exceeds MAX_FAILURES threshold (build should fail loudly)

Safety layers
─────────────
  • Hard branch guard   — refuses to run on 'main' even if CI misconfigures the job
  • Dry-run validation  — verifies every old_code is present before touching files
  • Syntax check        — runs `node --check` after patching JS/TS; rolls back on error
  • Rollback map        — restores originals if any patch in a group fails mid-apply
  • Difficulty gate     — groups scored ≥ 7/10 skip auto-fix and open a GH Issue instead
  • Loop guard          — won't re-heal if last commit already starts with fix(auto-heal):
  • API timeout         — Anthropic call hard-limited to CLAUDE_TIMEOUT_SECS
  • Local pre-analysis  — obvious flaky patterns classified without calling Claude at all
  • Error dedup         — identical error messages collapsed so Claude sees each error once
  • Single API call     — all failures sent in ONE request regardless of count
"""

import os, sys, re, json, subprocess, hashlib, shutil, time
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
MAX_FAILURES       = 5      # heal up to this many; >MAX = skip + exit 2
DIFFICULTY_SKIP    = 7      # groups scored >= this get a GH Issue instead of a patch
CLAUDE_MODEL       = "claude-sonnet-4-6"
MAX_TOKENS         = 2048   # keep responses tight to save tokens
CLAUDE_TIMEOUT_SECS = 90    # hard timeout for the Anthropic API call
MAX_FILE_LINES     = 200    # cap lines per source file sent to Claude
MAX_DIFF_CHARS     = 3000   # cap git diff sent to Claude
MAX_BODY_CHARS     = 1500   # cap per-failure body
MAX_ERROR_CHARS    = 1000   # cap error message per failure
MAX_CONTEXT_FILES  = 6      # max number of source files to include

# Local flaky patterns — classified without calling Claude (saves tokens)
FLAKY_PATTERNS = [
    r"TimeoutError",
    r"waiting for.*selector",
    r"net::ERR_",
    r"navigation timeout",
    r"exceeded.*timeout",
    r"socket hang up",
    r"ECONNRESET",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def sh(cmd, check=False):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        print(f"Command failed: {cmd}\n{r.stderr}")
        sys.exit(1)
    return r


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


def error_fingerprint(err_text):
    """Hash of the error to deduplicate identical failures."""
    return hashlib.md5(err_text.strip().encode()).hexdigest()[:8]


# ── Hard branch guard ─────────────────────────────────────────────────────────

def assert_not_main():
    """Refuse to run on main — belt-and-suspenders on top of the CI condition."""
    branch = sh("git rev-parse --abbrev-ref HEAD").stdout.strip()
    if branch in ("main", "master"):
        print(f"SAFETY ABORT: running on protected branch '{branch}' — exiting.")
        sys.exit(0)   # exit 0 so CI doesn't fail the build for the wrong reason


# ── Local pre-analysis (no Claude needed) ─────────────────────────────────────

def local_classify(failure):
    """Return ('FLAKY_TEST', reason) if the error matches a known flaky pattern."""
    text = failure.get("error", "") + failure.get("console", "")
    for pat in FLAKY_PATTERNS:
        if re.search(pat, text, re.IGNORECASE):
            return "FLAKY_TEST", f"matches local pattern: {pat}"
    return None, None


# ── Failure gathering ─────────────────────────────────────────────────────────

def gather_e2e_failures():
    p = Path("test-results/CLAUDE-FAILURES.md")
    if not p.exists():
        return []
    content = p.read_text(encoding="utf-8")
    if "all green" in content.lower():
        return []

    seen_fingerprints = set()
    failures = []
    sections = re.split(r"^## \d+\. ", content, flags=re.MULTILINE)
    for sec in sections[1:]:
        lines = sec.strip().splitlines()
        title = lines[0].strip() if lines else "unknown"
        loc_m     = re.search(r"\*\*Location:\*\*\s*`([^`]+)`", sec)
        err_m     = re.search(r"### Error\n```\n(.*?)```", sec, re.DOTALL)
        console_m = re.search(r"### Browser console\n```\n(.*?)```", sec, re.DOTALL)
        error_txt = (err_m.group(1) or "").strip()[:MAX_ERROR_CHARS] if err_m else ""

        fp = error_fingerprint(error_txt)
        if fp in seen_fingerprints:
            continue   # deduplicate identical errors
        seen_fingerprints.add(fp)

        failures.append({
            "type":     "e2e",
            "title":    title,
            "location": loc_m.group(1) if loc_m else "",
            "error":    error_txt,
            "console":  (console_m.group(1) or "").strip()[:500] if console_m else "",
            "body":     sec[:MAX_BODY_CHARS],
        })
    return failures


def gather_unit_failures():
    p = Path("test-results/vitest-results.json")
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []

    seen_fingerprints = set()
    failures = []
    for suite in data.get("testResults", []):
        file_path = suite.get("testFilePath", "")
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
            error_txt = "\n".join(msgs)[:MAX_ERROR_CHARS]

            fp = error_fingerprint(error_txt)
            if fp in seen_fingerprints:
                continue
            seen_fingerprints.add(fp)

            failures.append({
                "type":     "unit",
                "title":    title,
                "location": rel,
                "error":    error_txt,
                "console":  "",
                "body":     "",
            })
    return failures


# ── Context gathering ─────────────────────────────────────────────────────────

def _resolve_import(imp, base_dir):
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
    collected = {}
    for f in failures:
        if len(collected) >= MAX_CONTEXT_FILES:
            break
        loc = f.get("location", "")
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

            if len(collected) < MAX_CONTEXT_FILES:
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


# ── Claude API (single call, with timeout) ───────────────────────────────────

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
    for path, content in list(context_files.items()):
        context_text += f"\n### {path}\n```javascript\n{content[:2000]}\n```\n"

    return f"""You are a QA automation engineer for a Hebrew RTL nail-salon booking system.
Stack: Vanilla JS, Tailwind CSS, Playwright E2E, Vitest unit tests, Supabase backend.
Key rule: slot status is lowercase ('available'), booking status is Title Case ('Pending').

## Failing Tests ({len(failures)} total)
{failure_text}

## Relevant Source Files
{context_text}

## Recent Git Changes
```diff
{recent_diff}
```

## Your Task
1. Group failures sharing the SAME root cause (one fix for multiple failures).
2. Classify each group: SYSTEM_BUG / TEST_NEEDS_UPDATE / FLAKY_TEST / UNCLEAR
3. Score difficulty 1-10 (1=trivial rename, 10=architectural rewrite).
   Groups scoring >= {DIFFICULTY_SKIP} get no fix — just a clear explanation.
4. For groups < {DIFFICULTY_SKIP}: provide minimal surgical old_code → new_code patches.
5. Only propose fixes with HIGH or MEDIUM confidence.

## CRITICAL constraints
- old_code must be an EXACT verbatim substring present in the file.
- Do NOT guess — if unsure of the exact string, set confidence LOW.
- Prefer fixing tests over source code when the product change is clearly intentional.
- Do not add comments to patched code.
- Keep patches minimal — one surgical change per fix.

## Response — return ONLY valid JSON (no markdown wrapper):
{{
  "summary": "one-sentence overall pattern",
  "groups": [
    {{
      "root_cause": "concise explanation",
      "classification": "SYSTEM_BUG|TEST_NEEDS_UPDATE|FLAKY_TEST|UNCLEAR",
      "confidence": "HIGH|MEDIUM|LOW",
      "difficulty": 4,
      "difficulty_reason": "why this score",
      "affected_failure_indices": [1, 3],
      "fixes": [
        {{
          "file": "relative/path/from/repo/root.js",
          "description": "what and why",
          "old_code": "exact verbatim string",
          "new_code": "replacement string"
        }}
      ]
    }}
  ]
}}"""


def call_claude(failures, context_files, recent_diff):
    import anthropic
    client = anthropic.Anthropic(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        timeout=CLAUDE_TIMEOUT_SECS,
    )
    prompt = build_prompt(failures, context_files, recent_diff)

    print(f"Calling Claude ({CLAUDE_MODEL}) — {len(failures)} failure(s), "
          f"{len(context_files)} context file(s)…")
    t0 = time.time()
    resp = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "user", "content": prompt}],
    )
    elapsed = time.time() - t0
    print(f"Claude responded in {elapsed:.1f}s.")

    raw = resp.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


# ── Syntax validation ─────────────────────────────────────────────────────────

def check_syntax(path):
    """Return True if `node --check <path>` passes."""
    ext = Path(path).suffix.lower()
    if ext not in (".js", ".mjs", ".cjs"):
        return True   # skip non-JS files
    r = sh(f'node --check "{path}"')
    return r.returncode == 0


# ── Patch application (with rollback) ─────────────────────────────────────────

def apply_fixes(analysis):
    applied = []

    for group in analysis.get("groups", []):
        classification = group.get("classification", "UNCLEAR")
        confidence     = group.get("confidence", "LOW")
        difficulty     = group.get("difficulty", 0)
        root_cause     = group.get("root_cause", "")

        if classification == "UNCLEAR":
            print(f"  SKIP (UNCLEAR): {root_cause}")
            continue
        if confidence == "LOW":
            print(f"  SKIP (LOW confidence): {root_cause}")
            continue
        if difficulty >= DIFFICULTY_SKIP:
            print(f"  SKIP (difficulty {difficulty}/10 >= {DIFFICULTY_SKIP}): {root_cause}")
            continue

        fixes = group.get("fixes", [])

        # Dry-run: verify ALL old_code strings exist before touching any file
        dry_ok = True
        for fix in fixes:
            abs_path = REPO_ROOT / fix.get("file", "")
            if not abs_path.exists():
                print(f"  DRY-RUN FAIL: {fix['file']} not found")
                dry_ok = False
                break
            content = abs_path.read_text(encoding="utf-8")
            if fix.get("old_code", "") not in content:
                print(f"  DRY-RUN FAIL: old_code not found in {fix['file']}")
                dry_ok = False
                break
        if not dry_ok:
            print(f"  SKIP group (dry-run failed): {root_cause}")
            continue

        # Apply + syntax check with rollback map
        rollback = {}
        group_applied = []
        rollback_needed = False

        for fix in fixes:
            abs_path = REPO_ROOT / fix["file"]
            original = abs_path.read_text(encoding="utf-8")
            rollback[str(abs_path)] = original

            patched = original.replace(fix["old_code"], fix["new_code"], 1)
            abs_path.write_text(patched, encoding="utf-8")

            if not check_syntax(abs_path):
                print(f"  SYNTAX ERROR after patching {fix['file']} — rolling back group.")
                rollback_needed = True
                break

            print(f"  FIXED {fix['file']}: {fix.get('description', '')}")
            group_applied.append({**fix, "group_cause": root_cause})

        if rollback_needed:
            for p, orig in rollback.items():
                Path(p).write_text(orig, encoding="utf-8")
            continue

        applied.extend(group_applied)

    return applied


# ── GitHub Issue creation (for hard/skipped failures) ─────────────────────────

def open_gh_issues(analysis, all_failures):
    """Open a GH Issue for each group that was skipped due to difficulty."""
    branch = sh("git rev-parse --abbrev-ref HEAD").stdout.strip()

    for group in analysis.get("groups", []):
        difficulty = group.get("difficulty", 0)
        if difficulty < DIFFICULTY_SKIP:
            continue
        if group.get("classification") == "FLAKY_TEST":
            continue   # flaky tests don't warrant a GH Issue

        indices      = group.get("affected_failure_indices", [])
        root_cause   = group.get("root_cause", "")
        diff_reason  = group.get("difficulty_reason", "")
        classification = group.get("classification", "UNCLEAR")

        # Build failure details block
        failure_details = ""
        for i in indices:
            if 1 <= i <= len(all_failures):
                f = all_failures[i - 1]
                failure_details += f"\n**Failure {i}** — `{f['location']}`\n```\n{f['error'][:600]}\n```\n"

        # Ready-to-paste Claude prompt
        manual_prompt = (
            f"I have a test failure in the meital-booking-system on branch `{branch}`.\n\n"
            f"**Root cause:** {root_cause}\n\n"
            f"**Failing tests:**{failure_details}\n\n"
            f"Please analyse the failures, identify the exact code that needs to change, "
            f"and apply a minimal fix. Stack: Vanilla JS, Tailwind CSS, Playwright, "
            f"Vitest, Supabase. Slot status = lowercase, booking status = Title Case."
        )

        title = f"[auto-heal] {classification} (difficulty {difficulty}/10): {root_cause[:80]}"
        body = (
            f"## Auto-Heal Report\n\n"
            f"The AI Test Healer encountered this failure on branch `{branch}` but "
            f"skipped auto-fixing because the difficulty score was **{difficulty}/10** "
            f"(threshold: {DIFFICULTY_SKIP}).\n\n"
            f"**Reason:** {diff_reason}\n\n"
            f"**Classification:** `{classification}`\n\n"
            f"## Affected Failures\n{failure_details}\n\n"
            f"## Ready-to-use Prompt\n"
            f"Copy and paste this into Claude Code locally on your branch:\n\n"
            f"```\n{manual_prompt}\n```\n"
        )

        r = sh(
            f'gh issue create '
            f'--title {json.dumps(title)} '
            f'--body {json.dumps(body)} '
            f'--label "auto-heal,needs-manual-fix"'
        )
        if r.returncode == 0:
            print(f"  GH Issue opened for: {root_cause[:60]}")
            issue_url = r.stdout.strip()
            if issue_url:
                print(f"  {issue_url}")
        else:
            print(f"  GH Issue creation failed (gh not available or no token): {r.stderr[:100]}")


def open_gh_issues_for_local_flakies(local_skipped, branch):
    """Open issues for locally-classified flakies we didn't send to Claude."""
    for f, reason in local_skipped:
        title = f"[auto-heal] FLAKY_TEST: {f['title'][:80]}"
        body = (
            f"## Flaky Test Detected\n\n"
            f"Branch: `{branch}`\n"
            f"File: `{f['location']}`\n\n"
            f"**Pattern matched:** {reason}\n\n"
            f"```\n{f['error'][:800]}\n```\n\n"
            f"This test was skipped by the auto-healer (flaky pattern, no code change needed). "
            f"Consider adding a `waitFor` or increasing the selector timeout."
        )
        r = sh(
            f'gh issue create '
            f'--title {json.dumps(title)} '
            f'--body {json.dumps(body)} '
            f'--label "flaky-test"'
        )
        if r.returncode == 0:
            print(f"  GH Issue opened for flaky: {f['title'][:60]}")


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

    branch = sh("git rev-parse --abbrev-ref HEAD").stdout.strip()
    r = sh(f"git push origin HEAD:{branch}")
    if r.returncode != 0:
        print(f"Push failed:\n{r.stderr}")
        sys.exit(1)

    print(f"Pushed {len(applied)} fix(es) to '{branch}'.")
    return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # 1. Hard branch guard — belt-and-suspenders
    assert_not_main()

    # 2. Loop guard — don't re-heal our own commits
    last_msg = sh("git log -1 --pretty=%s").stdout.strip()
    if "fix(auto-heal):" in last_msg:
        print("Last commit is already a healer fix — skipping to prevent loop.")
        sys.exit(0)

    # 3. Gather failures
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
            "Too many failures — fix manually.\n"
        )
        sys.exit(2)

    # 4. Local pre-analysis (no API call needed for obvious flakies)
    branch = sh("git rev-parse --abbrev-ref HEAD").stdout.strip()
    needs_claude = []
    local_skipped = []

    for f in all_failures:
        cls, reason = local_classify(f)
        if cls == "FLAKY_TEST":
            print(f"  LOCAL: {f['title'][:60]} → FLAKY_TEST ({reason})")
            local_skipped.append((f, reason))
        else:
            needs_claude.append(f)

    if local_skipped:
        open_gh_issues_for_local_flakies(local_skipped, branch)

    if not needs_claude:
        print("All failures classified locally — no Claude API call needed.")
        sys.exit(0)

    # 5. Gather context + diff (only for failures that need Claude)
    context_files = gather_context(needs_claude)
    recent_diff   = get_recent_diff()
    print(f"Context: {len(context_files)} source file(s). Sending {len(needs_claude)} failure(s) to Claude.")

    # 6. Single Claude API call
    analysis = call_claude(needs_claude, context_files, recent_diff)
    summary  = analysis.get("summary", "test failures")
    print(f"\nAnalysis: {summary}")

    for g in analysis.get("groups", []):
        d       = g.get("difficulty", "?")
        indices = g.get("affected_failure_indices", [])
        n_fixes = len(g.get("fixes", []))
        skip    = " ← SKIP (difficulty)" if isinstance(d, int) and d >= DIFFICULTY_SKIP else ""
        print(
            f"  [{g.get('classification')} / {g.get('confidence')} / difficulty {d}/10]{skip} "
            f"{g.get('root_cause', '')[:60]} "
            f"(failures {indices}, {n_fixes} fix(es))"
        )

    # 7. Open GH Issues for hard groups
    open_gh_issues(analysis, needs_claude)

    # 8. Apply remaining fixes
    applied = apply_fixes(analysis)

    if not applied:
        print("\nNo fixes applied.")
        sys.exit(1)

    committed = commit_and_push(applied, summary)
    sys.exit(0 if committed else 1)


if __name__ == "__main__":
    main()
