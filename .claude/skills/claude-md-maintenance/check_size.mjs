#!/usr/bin/env node
/**
 * CLAUDE.md size-budget checker.
 * Part of the `claude-md-maintenance` Claude Code skill.
 *
 * Why: CLAUDE.md once bloated to ~48k chars (commit b7d86af trimmed it).
 * This guards against silent re-bloat by failing CI / a pre-task check when
 * the file grows past its character budget, and pinpoints the biggest
 * sections so the optimization pass knows where to cut.
 *
 * Usage:
 *   node check_size.mjs [file] [--budget=40000] [--warn-ratio=0.9] [--json] [--strict]
 *
 * Exit codes:
 *   0  within budget (status ok | warn)
 *   1  over budget (status fail), or warn when --strict
 *   2  file could not be read
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

export const DEFAULT_BUDGET = 40000;
export const DEFAULT_WARN_RATIO = 0.9;

/** Count Unicode code points (not UTF-16 units) so Hebrew/emoji count as 1 each. */
export function countChars(text) {
  return Array.from(text).length;
}

/**
 * Split markdown into sections by ATX headings, returning
 * [{ heading, level, chars }] sorted largest-first so bloat is easy to spot.
 */
export function analyzeSections(text) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let current = { heading: '(preamble)', level: 0, lines: [] };
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      if (current.lines.length || current.heading !== '(preamble)') sections.push(current);
      current = { heading: m[2].trim(), level: m[1].length, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections
    .map((s) => ({ heading: s.heading, level: s.level, chars: countChars(s.lines.join('\n')) }))
    .filter((s) => s.chars > 0)
    .sort((a, b) => b.chars - a.chars);
}

/**
 * Evaluate a char count against budget.
 * @returns {{status:'ok'|'warn'|'fail',chars:number,budget:number,warnAt:number,ratio:number,overBy:number}}
 */
export function evaluateBudget(chars, { budget = DEFAULT_BUDGET, warnRatio = DEFAULT_WARN_RATIO } = {}) {
  const warnAt = Math.floor(budget * warnRatio);
  let status = 'ok';
  if (chars > budget) status = 'fail';
  else if (chars >= warnAt) status = 'warn';
  return { status, chars, budget, warnAt, ratio: chars / budget, overBy: Math.max(0, chars - budget) };
}

/** Full report for a markdown string: verdict + byte size + section breakdown. */
export function buildReport(text, opts = {}) {
  const chars = countChars(text);
  const verdict = evaluateBudget(chars, opts);
  return { ...verdict, bytes: Buffer.byteLength(text, 'utf8'), sections: analyzeSections(text) };
}

export function parseArgs(argv) {
  const opts = { file: null, budget: DEFAULT_BUDGET, warnRatio: DEFAULT_WARN_RATIO, json: false, strict: false };
  for (const arg of argv) {
    if (arg === '--json') opts.json = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg.startsWith('--budget=')) opts.budget = Number(arg.slice('--budget='.length));
    else if (arg.startsWith('--warn-ratio=')) opts.warnRatio = Number(arg.slice('--warn-ratio='.length));
    else if (!arg.startsWith('--')) opts.file = arg;
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  const file = opts.file || 'CLAUDE.md';
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    console.error(`✗ cannot read ${file}: ${e.message}`);
    return 2;
  }
  const report = buildReport(text, opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const icon = { ok: '✓', warn: '⚠', fail: '✗' }[report.status];
    console.log(`${icon} ${file}: ${report.chars} chars (budget ${report.budget}, warn at ${report.warnAt}) — ${report.status.toUpperCase()}`);
    if (report.status !== 'ok') {
      console.log(`  ratio ${(report.ratio * 100).toFixed(1)}%${report.overBy ? `, over budget by ${report.overBy}` : ''}`);
      console.log('  largest sections:');
      for (const s of report.sections.slice(0, 8)) {
        console.log(`    ${String(s.chars).padStart(6)}  ${'#'.repeat(s.level || 1)} ${s.heading}`);
      }
    }
  }
  if (report.status === 'fail') return 1;
  if (report.status === 'warn' && opts.strict) return 1;
  return 0;
}

const isMain = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) {
  process.exit(main(process.argv.slice(2)));
}
