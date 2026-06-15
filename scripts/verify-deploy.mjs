#!/usr/bin/env node
/**
 * verify-deploy.mjs — deploy-drift guard for Supabase Edge Functions.
 *
 * WHY THIS EXISTS
 *   On 2026-05-30 clients stopped getting approve/cancel SMS. The code was
 *   correct — it had been committed (v1.6.0) but never DEPLOYED: live
 *   change-status ran 3-day-old code and admin-action had never been pushed at
 *   all. `clasp/supabase push != deploy`. No unit or mocked E2E test can catch
 *   that, because the source is fine. THIS script catches it: it compares each
 *   function's latest git commit time against what is actually live.
 *
 * WHAT IT DOES
 *   For every function under supabase/functions/ (except _shared):
 *     source_time = max(last commit touching the function dir,
 *                       last commit touching _shared/  ← bundled into every fn)
 *   Compared against the deployed `updated_at` from `supabase functions list`.
 *   DRIFT if the source is newer than the deployment, or the function was never
 *   deployed. Exits non-zero on drift with a clear remediation.
 *
 * USAGE
 *   npm run verify:deploy          (needs the supabase CLI linked + logged in)
 *   Runs in CI only when SUPABASE_ACCESS_TOKEN is set (see ci.yml).
 */

import { execFileSync, execSync } from 'node:child_process';
import { readdirSync, existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FUNCTIONS_DIR = 'supabase/functions';
const SHARED_DIR    = `${FUNCTIONS_DIR}/_shared`;

// If a deploy happened within this window BEFORE the commit, treat as in sync.
// Covers the "deploy → commit minutes later" pattern where Supabase returns
// "No change found" and does not update updated_at (code was already live).
// 4 h covers multi-session workflows (deploy in session 1, commit in session 2)
// while still catching the original class of bug (3-day-old stale deploy).
const DEPLOY_GRACE_MS = 14_400_000; // 4 h — covers multi-session deploy-before-commit workflows

function gitCommitEpoch(path) {
  // %ct = committer date, epoch seconds. Empty when the path has no commits yet.
  const out = execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8' }).trim();
  return out ? parseInt(out, 10) * 1000 : 0;
}

function listDeployed() {
  // In CI there is no linked project on disk; pass --project-ref explicitly when
  // SUPABASE_PROJECT_REF is set (SUPABASE_ACCESS_TOKEN supplies auth via env).
  const ref = process.env.SUPABASE_PROJECT_REF;
  const cmd = 'supabase functions list --output json' + (ref ? ` --project-ref ${ref}` : '');
  let raw;
  try {
    // execSync (shell) so the supabase .cmd shim resolves on Windows too.
    raw = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    console.error('✖ Could not run `supabase functions list`. Is the CLI installed, linked, and logged in?');
    console.error('  ' + (err.stderr?.toString().trim() || err.message));
    process.exit(2);
  }
  const map = new Map();
  for (const fn of JSON.parse(raw)) {
    map.set(fn.slug || fn.name, { updatedAt: fn.updated_at, version: fn.version });
  }
  return map;
}

function sourceFunctions() {
  return readdirSync(FUNCTIONS_DIR)
    .filter(name => name !== '_shared')
    .filter(name => {
      const dir = join(FUNCTIONS_DIR, name);
      return statSync(dir).isDirectory() && existsSync(join(dir, 'index.ts'));
    });
}

function fmt(ms) {
  return ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
}

function main() {
  const deployed   = listDeployed();
  const funcs      = sourceFunctions();

  const drifted = [];
  const rows = [];

  for (const name of funcs) {
    const ownTime = gitCommitEpoch(join(FUNCTIONS_DIR, name));
    // Track only the specific _shared/ files this function imports, not the whole dir.
    // This prevents a bot-config.ts change from false-flagging functions that don't use it.
    const entry = readFileSync(join(FUNCTIONS_DIR, name, 'index.ts'), 'utf8');
    const sharedImports = [...entry.matchAll(/_shared\/([^\s'"`,]+)/g)]
      .map(m => join(SHARED_DIR, m[1].replace(/\.ts$/, '') + '.ts'))
      .filter(p => existsSync(p));
    const usedSharedTime = sharedImports.reduce((max, p) => Math.max(max, gitCommitEpoch(p)), 0);
    const sourceTime = Math.max(ownTime, usedSharedTime);
    const live       = deployed.get(name);

    let state;
    if (!live) {
      state = 'NEVER DEPLOYED';
      drifted.push(name);
    } else if (sourceTime > live.updatedAt + DEPLOY_GRACE_MS) {
      state = 'DRIFT (undeployed changes)';
      drifted.push(name);
    } else {
      state = 'in sync';
    }
    rows.push({ name, source: fmt(sourceTime), deployed: live ? fmt(live.updatedAt) : '—', state });
  }

  // Functions live but absent from source — informational only.
  const orphans = [...deployed.keys()].filter(n => !funcs.includes(n));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('FUNCTION', 18) + pad('SOURCE (last commit)', 24) + pad('DEPLOYED', 24) + 'STATE');
  console.log('-'.repeat(90));
  for (const r of rows) {
    console.log(pad(r.name, 18) + pad(r.source, 24) + pad(r.deployed, 24) + r.state);
  }
  if (orphans.length) console.log('\nℹ deployed but not in source (ignored): ' + orphans.join(', '));

  if (drifted.length) {
    console.error('\n✖ DEPLOY DRIFT — these functions are committed but not live: ' + drifted.join(', '));
    console.error('  Fix: bash scripts/deploy-functions.sh   (then re-run: npm run verify:deploy)');
    process.exit(1);
  }
  console.log('\n✓ All ' + funcs.length + ' functions are deployed and in sync with git.');
}

main();
