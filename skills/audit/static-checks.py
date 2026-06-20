#!/usr/bin/env python3
"""
skills/audit/static-checks.py
Automated pre-merge checks for the WhatsApp bot.
Run from repo root: python skills/audit/static-checks.py
"""
import re, pathlib, subprocess, sys

result = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                        capture_output=True, text=True, encoding="utf-8")
ROOT = pathlib.Path(result.stdout.strip())

PASS, FAIL, WARN = "✅", "❌", "⚠️"
fails = 0

def read(rel):
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.exists() else ""

def ok(msg):
    sys.stdout.buffer.write((PASS + " " + msg + "\n").encode("utf-8"))

def fail(msg):
    global fails
    fails += 1
    sys.stdout.buffer.write((FAIL + " " + msg + "\n").encode("utf-8"))

def warn(msg):
    sys.stdout.buffer.write((WARN + " " + msg + "\n").encode("utf-8"))

print("=" * 60)
print("WhatsApp Bot — Static Pre-Merge Checks")
print("=" * 60)

bot_config   = read("supabase/functions/_shared/bot-config.ts")
bot_core     = read("supabase/functions/_shared/bot-core.ts")
chat_handler = read("supabase/functions/chat-handler/index.ts")
notify       = read("supabase/functions/_shared/notify.ts")
wa_terms     = read("supabase/functions/wa-terms-reminder/index.ts")
send_rem     = read("supabase/functions/send-reminders/index.ts")
sms_ts       = read("supabase/functions/_shared/sms.ts")

# ── CommContext ─────────────────────────────────────────────────────────────
print("\n[CommContext validity]")
VALID_CONTEXTS = {
    "OTP","AdminNotify","ClientApproval","ClientRejection",
    "ClientCancellation","DailyReminder","ClientSelfCancel",
    "ClientReschedule","SupportResolved","BotLatency",
}

for fname, src in [("send-reminders", send_rem), ("wa-terms-reminder", wa_terms),
                    ("bot-config", bot_config), ("chat-handler", chat_handler)]:
    for m in re.finditer(r"context:\s*[\'\"]([A-Za-z]+)[\'\"]", src):
        ctx = m.group(1)
        if ctx not in VALID_CONTEXTS:
            fail(f"{fname}: invalid CommContext '{ctx}' (DB constraint will reject)")
        else:
            ok(f"{fname}: context '{ctx}' is valid")

# ── DEFAULT_SERVICES ────────────────────────────────────────────────────────
print("\n[DEFAULT_SERVICES completeness]")
required_svcs = ["gel_hands", "regular_feet", "gel_combo"]
for svc in required_svcs:
    if f"id: \'{svc}\')" in bot_config or f"id: \'{svc}\'" in bot_config:
        ok(f"DEFAULT_SERVICES includes {svc}")
    else:
        fail(f"DEFAULT_SERVICES missing {svc}")

# ── Deno .catch() hazard ────────────────────────────────────────────────────
print("\n[Deno .catch() hazard]")
for fname, src in [("bot-config", bot_config), ("chat-handler", chat_handler),
                    ("wa-terms-reminder", wa_terms), ("send-reminders", send_rem),
                    ("notify", notify)]:
    # Match .catch( but NOT inside a comment or string
    lines = src.split("\n")
    bad = [(i+1, l) for i, l in enumerate(lines)
           if re.search(r"\.catch\s*\(", l) and not l.strip().startswith("//")]
    if bad:
        for ln, l in bad:
            fail(f"{fname}:{ln}: .catch() on possible PostgrestBuilder: {l.strip()[:80]}")
    else:
        ok(f"{fname}: no .catch() hazard")

# ── Dynamic import ──────────────────────────────────────────────────────────
print("\n[Dynamic imports]")
for fname, src in [("wa-terms-reminder", wa_terms), ("send-reminders", send_rem),
                    ("bot-config", bot_config), ("chat-handler", chat_handler)]:
    lines = src.split("\n")
    bad = [(i+1, l) for i, l in enumerate(lines)
           if "await import(" in l and not l.strip().startswith("//")]
    if bad:
        for ln, l in bad:
            fail(f"{fname}:{ln}: dynamic import should be static: {l.strip()[:80]}")
    else:
        ok(f"{fname}: no dynamic imports")

# ── Hebrew persona: no plural voice ────────────────────────────────────────
print("\n[Hebrew persona (no 'אנחנו' voice)]")
PLURAL_WORDS = ["רצינו", "שלנו", "נוכל", "אנחנו"]
for fname, src in [("wa-terms-reminder", wa_terms), ("send-reminders", send_rem),
                    ("bot-config", bot_config)]:
    lines = src.split("\n")
    for word in PLURAL_WORDS:
        bad = [(i+1, l) for i, l in enumerate(lines)
               if word in l and not l.strip().startswith("//")]
        if bad:
            for ln, l in bad:
                fail(f"{fname}:{ln}: forbidden plural word \'{word}\': {l.strip()[:80]}")
    ok(f"{fname}: no forbidden plural words")

# ── Security boundary in system prompt ─────────────────────────────────────
print("\n[Security]")
if "SECURITY BOUNDARY" in bot_config:
    ok("SECURITY BOUNDARY present in bot-config.ts")
else:
    fail("SECURITY BOUNDARY missing from bot-config.ts")

if "SELECT, INSERT, UPDATE, DELETE, DROP" in bot_config:
    ok("DB operation prohibition present in system prompt")
else:
    fail("DB operation prohibition missing from system prompt")

# ── Twilio signature verification ──────────────────────────────────────────
if "verifyTwilioSignature" in chat_handler and "if (!ok)" in chat_handler:
    ok("Twilio signature verified and result checked")
else:
    fail("Twilio signature not verified or result not checked in chat-handler")

# ── WA_SKIP_SIG_CHECK must be env-gated ────────────────────────────────────
skip_lines = [l for l in chat_handler.split("\n")
              if "WA_SKIP_SIG_CHECK" in l and "Deno.env" not in l
              and not l.strip().startswith("//")]
if skip_lines:
    fail("WA_SKIP_SIG_CHECK hardcoded outside Deno.env: " + str(skip_lines[:2]))
else:
    ok("WA_SKIP_SIG_CHECK only in Deno.env (or absent)")

# ── PII in logs ────────────────────────────────────────────────────────────
print("\n[PII / secrets in logs]")
log_lines = [(i+1, l) for i, l in enumerate(chat_handler.split("\n"))
             if re.search(r"console\.(log|warn|error)", l) and "phone" in l.lower()]
bad_pii = [(n, l) for n, l in log_lines
           if "maskPhone" not in l and "scrubPhones" not in l]
if bad_pii:
    for n, l in bad_pii:
        fail(f"chat-handler:{n}: phone in log without mask: {l.strip()[:80]}")
else:
    ok(f"chat-handler: {len(log_lines)} phone log lines — all masked")

for name, src in [("chat-handler", chat_handler), ("bot-config", bot_config)]:
    if re.search(r"console\.(log|warn|error).*authToken", src):
        fail(f"{name}: authToken in logs")
    else:
        ok(f"{name}: authToken not in logs")

# ── join_waitlist uses verified phone on WA ─────────────────────────────────
if "ctx.channel === \'whatsapp\'" in bot_config and "ctx.phone" in bot_config:
    ok("join_waitlist: WA phone override present")
else:
    fail("join_waitlist: missing WA phone override (ctx.phone)")

# ── tool_result else branch in bot-core ────────────────────────────────────
print("\n[bot-core robustness]")
if "tool_not_found" in bot_core and "unknown tool" in bot_core:
    ok("bot-core: else branch for unknown tool_use present")
else:
    fail("bot-core: missing else branch — unknown tool causes missing tool_result")

# ── migration files sanity ──────────────────────────────────────────────────
print("\n[Migrations]")
migs = sorted((ROOT / "supabase/migrations").glob("*.sql"))
if migs:
    ok(f"{len(migs)} migration files found, latest: {migs[-1].name}")
else:
    fail("No migration files found")

# Check for placeholder secrets in migrations
for m in migs[-5:]:
    src = m.read_text(encoding="utf-8")
    if "__PLACEHOLDER__" in src or "__REPLACE_WITH" in src:
        warn(f"{m.name}: contains placeholder secret (should only be in tracking migration)")

print("\n" + "=" * 60)
if fails:
    sys.stdout.buffer.write((f"❌ {fails} check(s) FAILED — fix before merging\n").encode("utf-8"))
    sys.exit(1)
else:
    sys.stdout.buffer.write(b"\n✅ All checks passed.\n")
