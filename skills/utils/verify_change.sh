#!/usr/bin/env bash
# ============================================================
#  verify_change.sh — Post-edit sanity check
#  Usage:
#    bash skills/utils/verify_change.sh              # check all changed JS files
#    bash skills/utils/verify_change.sh frontend/admin.js   # check specific file
# ============================================================
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PASS=0; FAIL=0; TARGET="${1:-}"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        VERIFY CHANGE — Post-edit checks              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── 1. SYNTAX CHECK ─────────────────────────────────────────
echo "── 1. SYNTAX CHECK ────────────────────────────────────"

if [ -n "$TARGET" ]; then
  FILES=("$TARGET")
else
  mapfile -t FILES < <(git diff --name-only HEAD | grep -E '\.(js|ts)$' || true)
  if [ ${#FILES[@]} -eq 0 ]; then
    mapfile -t FILES < <(git diff --name-only main...HEAD | grep -E '\.(js|ts)$' || true)
  fi
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "  ℹ No JS/TS files to check."
else
  for f in "${FILES[@]}"; do
    if [[ ! -f "$f" ]]; then continue; fi
    if [[ "$f" == *.ts ]]; then
      # TypeScript: use deno check if available, else skip
      if command -v deno &>/dev/null; then
        deno check "$f" 2>&1 && echo "  ✅ $f (deno check)" && ((PASS++)) || { echo "  ❌ $f (deno check FAILED)"; ((FAIL++)); }
      else
        echo "  ⚠  $f — deno not in PATH (Deno edge functions: check manually)"
      fi
    else
      node --check "$f" 2>&1 && echo "  ✅ $f" && ((PASS++)) || { echo "  ❌ $f — syntax error above"; ((FAIL++)); }
    fi
  done
fi
echo ""

# ── 2. CRITICAL PATTERN CHECKS ──────────────────────────────
echo "── 2. CRITICAL PATTERN CHECKS ─────────────────────────"

# 2a. Deno .catch() hazard
CATCH_HITS=$(grep -rn "\.from(.*)\.\(insert\|update\|delete\|select\).*\.catch(" supabase/functions/ 2>/dev/null | grep -v "_shared" | wc -l || true)
if [ "$CATCH_HITS" -gt 0 ]; then
  echo "  ❌ Found .catch() on PostgrestBuilder (Deno hazard):"
  grep -rn "\.from(.*)\.\(insert\|update\|delete\|select\).*\.catch(" supabase/functions/ 2>/dev/null | grep -v "_shared" | head -5
  ((FAIL++))
else
  echo "  ✅ No .catch() on PostgrestBuilder"
  ((PASS++))
fi

# 2b. Status casing
SLOT_STATUS_BAD=$(grep -rn "status.*['\"]Available\|status.*['\"]Blocked\|status.*['\"]Locked" supabase/ frontend/ 2>/dev/null | grep -v ".min.js" | wc -l || true)
if [ "$SLOT_STATUS_BAD" -gt 0 ]; then
  echo "  ❌ Found Capitalized slot status (must be lowercase):"
  grep -rn "status.*['\"]Available\|status.*['\"]Blocked\|status.*['\"]Locked" supabase/ frontend/ 2>/dev/null | head -5
  ((FAIL++))
else
  echo "  ✅ Slot status casing OK"
  ((PASS++))
fi

# 2c. getValues() on time/date columns in GAS
GAS_GETVALUES=$(grep -n "getValues()" backend/gas-backend.js 2>/dev/null | wc -l || true)
if [ "$GAS_GETVALUES" -gt 0 ]; then
  echo "  ⚠  gas-backend.js uses getValues() — ensure no date/time columns (use getDisplayValues())"
  grep -n "getValues()" backend/gas-backend.js | head -5
else
  echo "  ✅ No bare getValues() in GAS backend"
  ((PASS++))
fi

# 2d. Adjacent string literals in onclick (XSS/syntax risk)
ADJ=$(grep -rn "onclick=.*'[^']*'[^+,)]*'[^']*'" frontend/*.html frontend/*.js 2>/dev/null | grep -v "//.*onclick" | wc -l || true)
if [ "$ADJ" -gt 0 ]; then
  echo "  ❌ Possible adjacent string literals in onclick — use + concatenation:"
  grep -rn "onclick=.*'[^']*'[^+,)]*'[^']*'" frontend/*.html frontend/*.js 2>/dev/null | head -5
  ((FAIL++))
else
  echo "  ✅ onclick string concatenation OK"
  ((PASS++))
fi

echo ""

# ── 3. GIT DIFF SUMMARY ─────────────────────────────────────
echo "── 3. DIFF SUMMARY ────────────────────────────────────"
git diff --stat HEAD 2>/dev/null | tail -5 || echo "  (no unstaged changes)"
echo ""

# ── 4. SAVE RESULT ──────────────────────────────────────────
RESULT="$(date '+%Y-%m-%d %H:%M') — PASS:$PASS FAIL:$FAIL"
echo "$RESULT" > .last-test-result

echo "── RESULT ─────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ All checks passed ($PASS checks)"
  echo "  Next: npx playwright test tests/e2e/admin-dashboard.spec.js --headed"
else
  echo "  ❌ $FAIL check(s) FAILED — fix before committing"
  exit 1
fi
echo ""
