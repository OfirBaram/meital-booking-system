#!/usr/bin/env python3
"""
Skill: bot-health
Check WhatsApp bot health: latency stats, error counts, open tickets,
overdue terms conversations, and recent CRITICAL log lines.

Usage:
  python skills/chat/bot-health.py
  python skills/chat/bot-health.py --logs  # also shows last 20 log lines
"""
import os, sys, json, argparse, subprocess, urllib.request
from datetime import datetime, timezone, timedelta

def get_creds():
    url  = os.environ.get('SUPABASE_URL')
    key  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if url and key:
        return url, key
    r = subprocess.run(['supabase', 'secrets', 'list', '--output', 'json'],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode == 0:
        try:
            env = {s['name']: s['value'] for s in json.loads(r.stdout)}
            return env.get('SUPABASE_URL'), env.get('SUPABASE_SERVICE_ROLE_KEY')
        except Exception:
            pass
    return None, None

def fetch(url, key, path, params=''):
    full = f'{url}/rest/v1/{path}?{params}'
    req = urllib.request.Request(full, headers={
        'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json',
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--logs', action='store_true')
    args = p.parse_args()

    url, key = get_creds()
    if not url or not key:
        print("ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); sys.exit(1)

    now = datetime.now(timezone.utc)
    since_1h = (now - timedelta(hours=1)).isoformat()
    since_24h = (now - timedelta(hours=24)).isoformat()

    print("\n=== WhatsApp Bot Health ===")
    print(f"  Time: {now.strftime('%Y-%m-%d %H:%M UTC')}")

    # Latency stats (last 24h)
    lat = fetch(url, key, 'communication_logs',
                f"context=eq.BotLatency&created_at=gte.{since_24h}&select=detail&limit=500")
    if lat:
        ms_vals = []
        slow = 0
        for r in lat:
            try:
                ms = int(str(r.get('detail',0)).replace('ms',''))
                ms_vals.append(ms)
                if ms > 10000: slow += 1
            except Exception:
                pass
        if ms_vals:
            ms_vals.sort()
            p50 = ms_vals[len(ms_vals)//2]
            p95 = ms_vals[int(len(ms_vals)*0.95)]
            print(f"\n  Latency (last 24h, {len(ms_vals)} responses):")
            print(f"    p50={p50}ms  p95={p95}ms  slow(>10s)={slow}")

    # Open support tickets
    tickets = fetch(url, key, 'support_requests', 'status=eq.open&select=id')
    print(f"\n  Open support tickets: {len(tickets)}")

    # Awaiting terms
    terms = fetch(url, key, 'whatsapp_conversations',
                  'state=eq.awaiting_terms&select=phone,terms_reminder_count')
    print(f"  Awaiting terms: {len(terms)}", end='')
    overdue = [r for r in terms if (r.get('terms_reminder_count') or 0) >= 2]
    if overdue:
        print(f"  (overdue ≥2 reminders: {len(overdue)})", end='')
    print()

    # Active conversations (last 1h)
    active = fetch(url, key, 'whatsapp_conversations',
                   f'last_inbound_at=gte.{since_1h}&select=phone')
    print(f"  Active conversations (last 1h): {len(active)}")

    # WA bookings today
    today = now.strftime('%Y-%m-%d')
    wa_books = fetch(url, key, 'audit_log',
                     f"action=eq.whatsapp_book&created_at=gte.{today}T00:00:00Z&select=id")
    print(f"  WA bookings today: {len(wa_books)}")

    if args.logs:
        print("\n  (tip: run 'supabase functions logs chat-handler --scroll' for live logs)")

    print()

if __name__ == '__main__':
    main()
