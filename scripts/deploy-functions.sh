#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Deploy the Edge Functions changed by the SMS / notification fixes.
#
#   • admin-action   (NEW) — one-tap approve/reject from the admin SMS link
#   • change-status         — now sends the client SMS on approve/reject/cancel
#   • verify-and-book       — admin SMS: Hebrew day name, clickable Supabase link
#
# Prereqs:
#   1. supabase CLI installed and logged in:   supabase login
#   2. project linked once:                     supabase link --project-ref callmnxlcganwugxwiym
#   3. secrets set (see check below).
#
# Run from the repo root:  bash scripts/deploy-functions.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

FUNCS=(admin-action change-status verify-and-book)

echo "▶ Checking required secrets are set on the project…"
# These must exist for the SMS flow to work. SUPABASE_URL / SERVICE_ROLE_KEY are
# injected automatically by the platform — do NOT set them manually.
REQUIRED=(HMAC_SECRET ADMIN_TOKEN ADMIN_PHONE TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_FROM_NUMBER)
existing="$(supabase secrets list 2>/dev/null || true)"
missing=()
for s in "${REQUIRED[@]}"; do
  echo "$existing" | grep -q "$s" || missing+=("$s")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "⚠  Missing secrets: ${missing[*]}"
  echo "   Set them with, e.g.:"
  echo "     supabase secrets set HMAC_SECRET=... ADMIN_TOKEN=... ADMIN_PHONE=+9725... \\"
  echo "       TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=+1..."
  echo "   (GAS_URL is no longer needed — admin links now point at admin-action.)"
  echo
fi
echo "   NOTE: HMAC_SECRET must be the SAME value verify-and-book uses to sign"
echo "         admin tokens, or admin-action will reject every approve/reject link."
echo

for f in "${FUNCS[@]}"; do
  echo "▶ Deploying $f …"
  supabase functions deploy "$f"
done

echo "✓ Done. Smoke-test: book a real appointment, approve it from the admin"
echo "  console AND from the SMS link, and confirm the client receives an SMS."
