#!/usr/bin/env python3
"""
Skill: test-bot-message
Send a test message to the bot (web channel) and print the reply.
Useful for smoke-testing the bot after changes without needing a phone.

Usage:
  python skills/chat/test-bot-message.py 'שלום, מה השעות שלכם?'
  python skills/chat/test-bot-message.py 'יש תורים ברביעי?' --history '[{"role":"user","content":"היי"},{"role":"assistant","content":"היי!"}]'
"""
import sys, json, argparse, urllib.request, os, subprocess

def get_url():
    # Try to get the deployed function URL
    r = subprocess.run(['supabase', 'projects', 'list', '--output', 'json'],
                       capture_output=True, text=True, encoding='utf-8')
    supabase_url = os.environ.get('SUPABASE_URL')
    if supabase_url:
        return f'{supabase_url}/functions/v1/chat-handler'
    print("ERROR: set SUPABASE_URL env var"); sys.exit(1)

def get_anon_key():
    key = os.environ.get('SUPABASE_ANON_KEY')
    if key: return key
    r = subprocess.run(['supabase', 'secrets', 'list', '--output', 'json'],
                       capture_output=True, text=True, encoding='utf-8')
    if r.returncode == 0:
        try:
            env = {s['name']: s['value'] for s in json.loads(r.stdout)}
            return env.get('SUPABASE_ANON_KEY')
        except Exception: pass
    print("ERROR: set SUPABASE_ANON_KEY env var"); sys.exit(1)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('message', help='Message to send to the bot')
    p.add_argument('--history', help='JSON array of prior turns', default='[]')
    args = p.parse_args()

    url = get_url()
    key = get_anon_key()

    history = json.loads(args.history)
    messages = history + [{'role': 'user', 'content': args.message}]

    body = json.dumps({'messages': messages}).encode('utf-8')
    req = urllib.request.Request(url, data=body, headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {key}',
    })

    print(f"\nSending to: {url}")
    print(f"Message: {args.message}")
    print("---")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            reply = data.get('reply', data)
            print(f"Reply:\n{reply}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}")
        sys.exit(1)

if __name__ == '__main__':
    main()
