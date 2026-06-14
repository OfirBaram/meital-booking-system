#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# is-alive.sh — zero-cost health check for chat-handler
#
# Uses an HTTP OPTIONS (CORS preflight) request — the Edge Function answers
# immediately WITHOUT calling Anthropic. No API credits consumed.
# Verifies: function is deployed, responding, and CORS headers are correct.
#
# Run: bash scripts/smoke/is-alive.sh
# Exit: 0 = alive, 1 = dead/misconfigured
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENDPOINT="https://callmnxlcganwugxwiym.supabase.co/functions/v1/chat-handler"
ORIGIN="https://ofirbaram.github.io"

echo ""
echo "chat-handler health check (OPTIONS preflight — no API cost)"
echo "Endpoint: ${ENDPOINT}"
echo ""

# Capture full response headers + status code
# Use mktemp so headers and body never share a file, which caused
# a silent overwrite bug when -o and -D pointed at the same path.
TMPHEAD=$(mktemp)
HTTP_CODE=$(curl -s -D "${TMPHEAD}" -o /dev/null -w "%{http_code}" \
  -X OPTIONS "${ENDPOINT}" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization" \
  --max-time 10)
HEADERS=$(cat "${TMPHEAD}"); rm -f "${TMPHEAD}"

pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; [ -n "${2:-}" ] && echo "    $2"; exit 1; }

# T1 — function responded at all
[ -n "${HTTP_CODE}" ] && pass "T1 function responded" \
                      || fail "T1 function responded" "curl failed — is the Supabase project paused?"

# T2 — HTTP 200
[ "${HTTP_CODE}" = "200" ] && pass "T2 HTTP 200" \
                            || fail "T2 HTTP 200" "got HTTP ${HTTP_CODE}"

# T3 — CORS origin header present
if echo "${HEADERS}" | grep -qi "access-control-allow-origin"; then
  pass "T3 Access-Control-Allow-Origin header present"
else
  fail "T3 CORS headers" "Access-Control-Allow-Origin missing — check cors.ts"
fi

# T4 — CORS methods includes POST
if echo "${HEADERS}" | grep -qi "access-control-allow-methods.*POST"; then
  pass "T4 POST in Access-Control-Allow-Methods"
else
  fail "T4 CORS methods" "POST not listed in Access-Control-Allow-Methods"
fi

# T5 — security header nosniff present (confirms SEC_HEADERS from _shared/cors.ts)
if echo "${HEADERS}" | grep -qi "x-content-type-options: nosniff"; then
  pass "T5 X-Content-Type-Options: nosniff (SEC_HEADERS applied)"
else
  fail "T5 security headers" "X-Content-Type-Options missing — _shared/cors.ts not imported?"
fi

echo ""
echo "✅ chat-handler is ALIVE and correctly configured"
echo ""
