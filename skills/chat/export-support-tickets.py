#!/usr/bin/env python3
"""
Skill: export-support-tickets
Export open support tickets to CSV or print them to console.

Usage:
  python skills/chat/export-support-tickets.py
  python skills/chat/export-support-tickets.py --csv tickets.csv
  python skills/chat/export-support-tickets.py --resolve <ticket_id>
"""
import os, sys, json, argparse, subprocess, urllib.request, urllib.parse, csv

def get_creds():
    url  = os.environ.get('SUPABASE_URL')
    key  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if url and key: return url, key
    r = subprocess.run(['supabase', 'secrets', 'list', '--output', 'json'],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode == 0:
        try:
            env = {s['name']: s['value'] for s in json.loads(r.stdout)}
            return env.get('SUPABASE_URL'), env.get('SUPABASE_SERVICE_ROLE_KEY')
        except Exception: pass
    return None, None

def fetch(url, key, path, params=''):
    full = f'{url}/rest/v1/{path}?{params}'
    req = urllib.request.Request(full, headers={
        'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json',
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def patch_row(url, key, table, row_id, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(
        f'{url}/rest/v1/{table}?id=eq.{row_id}',
        data=body,
        headers={
            'apikey': key, 'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        method='PATCH'
    )
    with urllib.request.urlopen(req) as resp:
        return resp.status

def mask(phone):
    p = str(phone or '')
    return '****' + p[-4:] if len(p) >= 4 else '****'

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--csv', metavar='FILE', help='Export to CSV file')
    p.add_argument('--resolve', metavar='ID', help='Mark ticket as resolved')
    p.add_argument('--limit', type=int, default=50)
    args = p.parse_args()

    url, key = get_creds()
    if not url or not key:
        print("ERROR: set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"); sys.exit(1)

    if args.resolve:
        status = patch_row(url, key, 'support_requests', args.resolve, {'status': 'resolved'})
        print(f"Ticket {args.resolve} marked resolved (HTTP {status})")
        return

    rows = fetch(url, key, 'support_requests',
                 f'status=eq.open&order=created_at.desc&limit={args.limit}')

    print(f"\n=== Open Support Tickets ({len(rows)}) ===")

    if args.csv:
        with open(args.csv, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['id', 'created_at', 'phone', 'reason', 'status'])
            for r in rows:
                w.writerow([
                    r.get('id',''), r.get('created_at','')[:16],
                    mask(r.get('phone')), r.get('reason',''), r.get('status','')
                ])
        print(f"Exported to {args.csv}")
        return

    for r in rows:
        print(f"  [{r.get('created_at','')[:16]}] {mask(r.get('phone'))}  {r.get('id','')[:8]}...")
        print(f"    Reason: {r.get('reason','')[:120]}")
        snap = r.get('snapshot') or []
        if snap:
            last = snap[-1]
            print(f"    Last msg ({last.get('role')}): {str(last.get('content',''))[:80]}")
        print()

if __name__ == '__main__':
    main()
