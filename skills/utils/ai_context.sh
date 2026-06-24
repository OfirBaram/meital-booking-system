#!/usr/bin/env bash
# ============================================================
#  ai_context.sh — Project orientation for AI agents
#  Run at the START of every session:
#    bash skills/utils/ai_context.sh
# ============================================================
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        MEITAL BOOKING — SESSION CONTEXT              ║"
echo "╚══════════════════════════════════════════════════════╝"

echo ""
echo "── BRANCH & RECENT COMMITS ────────────────────────────"
echo "Current branch: $(git branch --show-current)"
git log --oneline -7

echo ""
echo "── WORKING TREE STATUS ────────────────────────────────"
git status --short || echo "(clean)"

echo ""
echo "── MODIFIED FILES (vs main) ───────────────────────────"
git diff --name-only main...HEAD 2>/dev/null | head -20 || echo "(on main or no diff)"

echo ""
echo "── EDGE FUNCTIONS ($(ls supabase/functions/ | grep -v '^_' | wc -l) deployed) ────────────────────"
ls supabase/functions/ | grep -v "^_" | paste - - - - 2>/dev/null || ls supabase/functions/ | grep -v "^_"

echo ""
echo "── FEATURE FLAGS (live DB) ────────────────────────────"
PYTHON=/c/Users/DELL/AppData/Local/Programs/Python/Python312/python.exe
if [ -f "skills/db/get_flags.py" ]; then
  $PYTHON skills/db/get_flags.py 2>/dev/null || echo "⚠  Could not reach Supabase (offline?)"
else
  echo "  smart_scheduling  — check Admin Console → Pulse → הגדרות מערכת"
fi

echo ""
echo "── LAST TEST RUN ──────────────────────────────────────"
if [ -f ".last-test-result" ]; then
  cat .last-test-result
else
  echo "  No cached result. Run: npx playwright test tests/e2e/admin-dashboard.spec.js --headed"
fi

echo ""
echo "── CRITICAL RULES (quick ref) ─────────────────────────"
echo "  • Edit JS/HTML → python skills/utils/ai_tools.py patch <file> --old '...' --new '...'"
echo "  • Supabase Deno: NO .catch() on PostgrestBuilder → use async IIFE"
echo "  • Dates in GAS: ALWAYS getDisplayValues(), never getValues()"
echo "  • Slot status: lowercase (available/blocked/locked)"
echo "  • Booking status: Capitalized (Pending/Approved/Rejected/Cancelled)"
echo "  • slots.end_time includes 30-min buffer — never use duration_min for walls"
echo "  • Admin session: sbCall() sends x-admin-session header always"
echo "  • Git: bash only (PowerShell fails on U+200F path)"
echo ""
echo "── QUICK COMMANDS ─────────────────────────────────────"
echo "  Patch file:    python skills/utils/ai_tools.py patch <file> --old '...' --new '...'"
echo "  Verify change: bash skills/utils/verify_change.sh [file]"
echo "  Deploy funcs:  bash scripts/deploy-functions.sh"
echo "  Sync GAS:      cp backend/gas-backend.js backend/Main.js && clasp push && clasp deploy"
echo "  E2E gate:      npx playwright test tests/e2e/admin-dashboard.spec.js --headed"
echo ""
