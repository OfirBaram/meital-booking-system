#!/usr/bin/env python3
"""
Skill: view-conversations
View recent WhatsApp conversations from Supabase.

Usage:
  python skills/chat/view-conversations.py               # last 10 conversations
  python skills/chat/view-conversations.py --phone 05X   # specific phone
  python skills/chat/view-conversations.py --state awaiting_terms
  python skills/chat/view-conversations.py --tickets     # open support tickets
"""
import os, sys, json, argparse, subprocess

def get_supabase_creds():
    """Load Supabase URL + service_role key from supabase secrets."""
    r = subprocess.run(['supabase', 'secrets', 'list', '--output', 'json'],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0:
        print("ERROR: supabase secrets list failed:", r.stderr)
        sys.exit(1)
    try:
        secrets = json.loads(r.stdout)
        env = {s['name']: s['value'] for s in secrets}
        return env.get('SUPABASE_URL'), env.get('SUPABASE_SERVICE_ROLE_KEY')
    except Exception:
        print("ERROR: Could not parse secrets JSON. Use env vars instead.")
        return os.environ.get('SUPABASE_URL'), os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

def fetch(url, key, path, params=''):
    import urllib.request
    full = f'{url}/rest/v1/{path}?{params}'
    req = urllib.request.Request(full, headers={
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def mask(phone):
    p = str(phone or '')
    return '****' + p[-4:] if len(p) >= 4 else '****'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--phone', help='Filter by phone (partial match)')
    p.add_argument('--state', help='Filter by state (e.g. awaiting_terms)')
    p.add_argument('--tickets', action='store_true', help='Show open support tickets')
    p.add_argument('--limit', type=int, default=10)
    args = p.parse_args()

    url, key = get_supabase_creds()
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars")
        sys.exit(1)

    if args.tickets:
        rows = fetch(url, key, 'support_requests',
                     'status=eq.open&order=created_at.desc&limit=' + str(args.limit))
        print(f"\n=== Open Support Tickets ({len(rows)}) ===")
        for r in rows:
            print(f"  [{r.get('created_at','')[:16]}] {mask(r.get('phone'))} — {r.get('reason','')[:80]}")
        return

    params = f'order=last_inbound_at.desc&limit={args.limit}'
    if args.state:
        params += f'&state=eq.{args.state}'

    rows = fetch(url, key, 'whatsapp_conversations', params)

    print(f"\n=== WhatsApp Conversations (showing {len(rows)}) ===")
    for row in rows:
        phone = row.get('phone', '')
        if args.phone and args.phone not in phone:
            continue
        state = row.get('state') or 'normal'
        hist = row.get('history') or []
        last_at = (row.get('last_inbound_at') or '')[:16]
        terms_c = row.get('terms_reminder_count', 0)
        print(f"\n  {mask(phone)}  |  state={state}  |  turns={len(hist)}  |  last={last_at}  |  terms_reminders={terms_c}")
        if hist:
            # Show last 3 turns
            for turn in hist[-3:]:
                role = turn.get('role','?')
                content = str(turn.get('content',''))[:80]
                prefix = '  >>' if role == 'user' else '  <<'
                print(f"  {prefix} [{role}] {content}")

if __name__ == '__main__':
    main()
