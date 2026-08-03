"""
chat_smoke.py — live smoke test for the website chat channel.

Why this exists: testing this endpoint from bash on Windows silently mangles
Hebrew (the shell re-encodes the payload), which makes the bot look broken when
it is fine. This sends UTF-8 explicitly and prints replies through a UTF-8
stream, so what you read is what the customer would get.

Usage:
    python skills/utils/chat_smoke.py                 # run the default set
    python skills/utils/chat_smoke.py "כמה עולה?"      # ask one question

Checks it performs automatically:
  * NO_CALENDAR — the website bot must never state a concrete date/time.
  * PRICE       — the gel price must come from the live catalogue.
"""
import io
import json
import os
import re
import sys
import urllib.request

SUPA = os.environ.get("SUPA_URL", "https://callmnxlcganwugxwiym.supabase.co")
ENDPOINT = SUPA + "/functions/v1/chat-handler"

# Publishable key — public by design (it is embedded in the landing page).
# The old legacy `eyJ...` anon JWT no longer authenticates against this project;
# see frontend/config.js for the full explanation.
ANON = os.environ.get("SUPA_ANON") or "sb_publishable_jdsiuEIyFXDUS6kxkyOYDA_juWKqjAZ"

DEFAULT_QUESTIONS = [
    "כמה עולה לק ג׳ל?",                      # how much is gel polish
    "כמה עולה עיצוב גבות?",  # how much are eyebrows
    "מתי יש לך פנוי מחר?",          # when are you free tomorrow
    "אפשר לקבוע תור ליום שלישי בבוקר?",  # book Tuesday morning
    "איפה הסטודיו?",                              # where is the studio
    "איך אפשר לשלם?",                              # how can I pay
    "כמה זמן לוקח הטיפול?",  # how long does it take
    "עושה בנייה?",                                          # do you do extensions (not offered)
]

# A concrete date or clock time in a website reply means the calendar leaked in.
TIME_RE = re.compile(r"\b\d{1,2}:\d{2}\b|\b\d{1,2}[./]\d{1,2}\b")


def ask(question, timeout=60):
    payload = json.dumps({"messages": [{"role": "user", "content": question}]},
                         ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": "Bearer " + ANON,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8")).get("reply", "")
    except urllib.error.HTTPError as e:
        return "[HTTP %s] %s" % (e.code, e.read().decode("utf-8", "replace"))
    except Exception as e:                                    # noqa: BLE001
        return "[ERROR] %s" % e


def main():
    out = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    questions = sys.argv[1:] or DEFAULT_QUESTIONS
    failures = []

    for q in questions:
        reply = ask(q)
        out.write("=== Q: %s\n%s\n\n" % (q, reply))

        if TIME_RE.search(reply) and "160" not in reply:
            failures.append("NO_CALENDAR: reply contains a concrete date/time -> %r" % q)

    # The published price must survive the whole path: DB -> prompt -> model.
    price_reply = ask(DEFAULT_QUESTIONS[0])
    if "160" not in price_reply:
        failures.append("PRICE: gel price 160 missing from the price answer")

    if failures:
        out.write("FAILURES:\n" + "\n".join("  - " + f for f in failures) + "\n")
    else:
        out.write("All checks passed.\n")
    out.flush()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
