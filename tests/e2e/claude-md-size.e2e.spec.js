// End-to-end test for the claude-md-maintenance size checker.
// The skill ships a CLI (not a browser surface), so "E2E" here means spawning
// the real `node check_size.mjs` process against fixtures and the live
// CLAUDE.md, asserting exit codes + report output exactly as a user/CI would.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const cli = path.join(repoRoot, '.claude', 'skills', 'claude-md-maintenance', 'check_size.mjs');

function run(args) {
  try {
    const stdout = execFileSync('node', [cli, ...args], { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString() : '',
      stderr: e.stderr ? e.stderr.toString() : '',
    };
  }
}

let tmpDir;
test.beforeAll(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'claude-md-size-'));
});
test.afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

test('the live CLAUDE.md is within budget (exit 0)', () => {
  const res = run([path.join(repoRoot, 'CLAUDE.md'), '--json']);
  expect(res.code).toBe(0);
  const report = JSON.parse(res.stdout);
  expect(report.status).not.toBe('fail');
  expect(report.chars).toBeLessThan(report.budget);
});

test('an oversized file fails with exit 1 and names the biggest section', () => {
  const f = path.join(tmpDir, 'big.md');
  writeFileSync(f, '# Bloated\n' + 'א'.repeat(45000), 'utf8');
  const res = run([f]);
  expect(res.code).toBe(1);
  expect(res.stdout).toContain('FAIL');
  expect(res.stdout).toContain('Bloated');
});

test('a file in the warn band passes by default but fails under --strict', () => {
  const f = path.join(tmpDir, 'warn.md');
  // budget 1000, warn at 900 (0.9 ratio) -> 950 chars is a warn
  writeFileSync(f, 'x'.repeat(950), 'utf8');
  expect(run([f, '--budget=1000']).code).toBe(0);
  const strict = run([f, '--budget=1000', '--strict']);
  expect(strict.code).toBe(1);
  expect(strict.stdout).toContain('WARN');
});

test('a missing file exits 2 with a readable error', () => {
  const res = run([path.join(tmpDir, 'does-not-exist.md')]);
  expect(res.code).toBe(2);
  expect(res.stderr).toContain('cannot read');
});
