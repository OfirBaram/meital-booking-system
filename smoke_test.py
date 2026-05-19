#!/usr/bin/env python3
"""
smoke_test.py - live smoke test for the Meital booking system.

POSTs the adminGetClients action to the deployed Google Apps Script
endpoint (URL is read automatically from frontend/config.js) and prints
the returned client JSON - but ONLY when the backend reports success:true.

Token:
  Taken from the ADMIN_TOKEN environment variable. If it is not set and
  the script is run in an interactive terminal, you are prompted (input
  hidden). The token is never written to disk or echoed.

Safety:
  adminGetClients is READ-ONLY - a single SELECT. No writes, no SMS,
  no calendar events. Safe to run against production.

Usage:
    export ADMIN_TOKEN=<the-real-admin-token>
    python smoke_test.py
"""
import json
import os
import sys
import re

ROOT        = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT, 'frontend', 'config.js')


def read_api_url():
    """Extract API_URL from frontend/config.js."""
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            src = f.read()
    except OSError as e:
        sys.exit('ERROR: cannot read config.js - ' + str(e))
    m = re.search(r'API_URL\s*:\s*"([^"]+)"', src)
    if not m:
        sys.exit('ERROR: API_URL not found in ' + CONFIG_PATH)
    return m.group(1)


def get_token():
    """ADMIN_TOKEN from the environment, or an interactive hidden prompt."""
    token = os.environ.get('ADMIN_TOKEN', '').strip()
    if token:
        return token
    if sys.stdin.isatty():
        try:
            import getpass
            token = getpass.getpass('ADMIN_TOKEN not set - paste it (hidden): ').strip()
        except Exception:
            token = ''
    if not token:
        sys.exit(
            'ERROR: ADMIN_TOKEN not provided.\n'
            '  Run it like this in your own terminal:\n'
            '    export ADMIN_TOKEN=<the-real-admin-token>\n'
            '    python smoke_test.py'
        )
    return token


def post_json(url, payload):
    """POST payload as a JSON body. Uses requests if available, else urllib.
    Returns (status_code, response_text)."""
    body = json.dumps(payload).encode('utf-8')
    headers = {'Content-Type': 'text/plain'}  # matches the frontend's apiCall()
    try:
        import requests
        r = requests.post(url, data=body, headers=headers,
                           timeout=30, allow_redirects=True)
        return r.status_code, r.text
    except ImportError:
        import urllib.request
        import urllib.error
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, resp.read().decode('utf-8', errors='replace')
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode('utf-8', errors='replace')


def main():
    url   = read_api_url()
    token = get_token()

    print('Endpoint : ' + url)
    print('Action   : adminGetClients (read-only)')
    print('-' * 64)

    try:
        status, text = post_json(url, {
            'action': 'adminGetClients',
            'token':  token,
            'search': '',
        })
    except Exception as e:
        sys.exit('ERROR: request failed - ' + repr(e))

    if status != 200:
        sys.exit('ERROR: HTTP ' + str(status) + '\n' + text[:600])

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        sys.exit('ERROR: response was not JSON (first 600 chars):\n' + text[:600])

    if not data.get('success'):
        sys.exit('ERROR: backend returned success=false - '
                 + str(data.get('error', '(no error field)')))

    clients = data.get('clients', [])
    print('SUCCESS - live connection to Supabase is working.')
    print('Clients returned: ' + str(len(clients)))
    print('-' * 64)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
