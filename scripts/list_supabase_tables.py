"""
List all tables in the Supabase project via:
  1. PostgREST OpenAPI spec  → tables exposed to the REST API
  2. information_schema query → all tables in the public schema (via RPC or direct endpoint)

Usage:
  python scripts/list_supabase_tables.py

Keep the SERVICE_ROLE_KEY out of version control — move it to an environment variable:
  $env:SUPABASE_SERVICE_ROLE_KEY = "..."
"""

import os
import json
import requests

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://callmnxlcganwugxwiym.supabase.co"

# Prefer the environment variable; fall back to the literal (DO NOT COMMIT)
SERVICE_ROLE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhbGxtbnhsY2dhbnd1Z3h3aXltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTEyMzAwMCwiZXhwIjoyMDk0Njk5MDAwfQ"
    ".lZ_8zQIF0lWRxG6oV7j9A6FDspq10vv72H1IHRwKWwE",
)

HEADERS = {
    "apikey": SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
}

# ── 1. PostgREST OpenAPI — tables exposed to the REST API ────────────────────
def list_rest_tables():
    print("\n── Method 1: PostgREST OpenAPI (tables visible to REST API) ──")
    r = requests.get(f"{SUPABASE_URL}/rest/v1/", headers=HEADERS, timeout=10)
    r.raise_for_status()
    spec = r.json()

    paths = spec.get("paths", {})
    tables = sorted(
        name.lstrip("/")
        for name in paths
        if not name.startswith("/rpc/")   # exclude RPC functions
    )

    if tables:
        for t in tables:
            methods = ", ".join(paths[f"/{t}"].keys()).upper()
            print(f"  {t:<40} [{methods}]")
    else:
        print("  (no tables exposed — check PostgREST schema settings)")

    return tables


# ── 2. information_schema — all tables in the public schema ──────────────────
def list_all_tables():
    print("\n── Method 2: information_schema.tables (all public schema tables) ──")

    # PostgREST can query information_schema if the service role has access
    params = {
        "table_schema": "eq.public",
        "table_type": "eq.BASE TABLE",
        "select": "table_name,table_schema",
        "order": "table_name",
    }
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/information_schema.tables",   # note: may 404
        headers={**HEADERS, "Accept": "application/json"},
        params=params,
        timeout=10,
    )

    if r.status_code == 404:
        print("  information_schema not exposed via PostgREST (expected on most Supabase projects).")
        print("  Use Method 1 above, or add a helper SQL function — see note below.")
        return []

    r.raise_for_status()
    rows = r.json()
    for row in rows:
        print(f"  {row['table_name']}")
    return [row["table_name"] for row in rows]


# ── 3. Bonus: list Row Level Security status for each REST table ──────────────
def check_rls(tables):
    if not tables:
        return
    print("\n── Bonus: RLS status for each table ──")
    for table in tables:
        r = requests.head(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**HEADERS, "Prefer": "count=exact"},
            timeout=10,
        )
        rls_note = "RLS may be off (service role bypasses anyway)" if r.ok else f"HTTP {r.status_code}"
        print(f"  {table:<40} {rls_note}")


# ── Main ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Project URL : {SUPABASE_URL}")
    print(f"Key source  : {'env var' if 'SUPABASE_SERVICE_ROLE_KEY' in os.environ else 'hardcoded (move to env var!)'}")

    try:
        rest_tables = list_rest_tables()
    except requests.HTTPError as e:
        print(f"  ERROR calling PostgREST: {e}")
        rest_tables = []

    try:
        list_all_tables()
    except Exception as e:
        print(f"  ERROR: {e}")

    check_rls(rest_tables)

    print("\nDone.")
    print(
        "\nNOTE: To use an environment variable instead of the hardcoded key:\n"
        "  PowerShell : $env:SUPABASE_SERVICE_ROLE_KEY = '<key>'\n"
        "  Bash       : export SUPABASE_SERVICE_ROLE_KEY='<key>'\n"
        "  Then run   : python scripts/list_supabase_tables.py"
    )
