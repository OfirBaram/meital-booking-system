import { describe, it, expect } from 'vitest';
import {
  countChars,
  analyzeSections,
  evaluateBudget,
  buildReport,
  parseArgs,
  DEFAULT_BUDGET,
  DEFAULT_WARN_RATIO,
} from '../../.claude/skills/claude-md-maintenance/check_size.mjs';

describe('countChars', () => {
  it('counts ASCII as one char each', () => {
    expect(countChars('hello')).toBe(5);
  });

  it('counts Hebrew code points as one char each (not UTF-8 bytes)', () => {
    expect(countChars('שלום')).toBe(4);
  });

  it('counts an astral emoji as a single char (handles surrogate pairs)', () => {
    expect(countChars('💅')).toBe(1);
  });

  it('is empty-safe', () => {
    expect(countChars('')).toBe(0);
  });
});

describe('evaluateBudget', () => {
  it('reports ok well under budget', () => {
    expect(evaluateBudget(1000, { budget: 40000 }).status).toBe('ok');
  });

  it('reports warn at/above the warn threshold but at/under budget', () => {
    const warnAt = Math.floor(40000 * DEFAULT_WARN_RATIO); // 36000
    expect(evaluateBudget(warnAt).status).toBe('warn');
    expect(evaluateBudget(40000).status).toBe('warn');
  });

  it('reports fail above budget and computes overBy', () => {
    const r = evaluateBudget(40005, { budget: 40000 });
    expect(r.status).toBe('fail');
    expect(r.overBy).toBe(5);
  });

  it('honors a custom budget and warn-ratio', () => {
    const r = evaluateBudget(2500, { budget: 3000, warnRatio: 0.8 }); // warnAt 2400
    expect(r.status).toBe('warn');
    expect(r.warnAt).toBe(2400);
  });

  it('defaults match the documented constants', () => {
    expect(DEFAULT_BUDGET).toBe(40000);
    expect(DEFAULT_WARN_RATIO).toBe(0.9);
  });
});

describe('analyzeSections', () => {
  const md = [
    'intro line',
    '# Big',
    'a'.repeat(50),
    '## Small',
    'b'.repeat(5),
  ].join('\n');

  it('returns sections sorted largest-first', () => {
    const s = analyzeSections(md);
    expect(s[0].heading).toBe('Big');
    expect(s[0].chars).toBeGreaterThan(s[1].chars);
  });

  it('captures heading levels', () => {
    const small = analyzeSections(md).find((x) => x.heading === 'Small');
    expect(small.level).toBe(2);
  });

  it('keeps preamble text before the first heading', () => {
    const pre = analyzeSections(md).find((x) => x.heading === '(preamble)');
    expect(pre).toBeTruthy();
  });
});

describe('buildReport', () => {
  it('fails an oversized doc and exposes the biggest section', () => {
    const text = '# Huge\n' + 'x'.repeat(40001);
    const r = buildReport(text, { budget: 40000 });
    expect(r.status).toBe('fail');
    expect(r.sections[0].heading).toBe('Huge');
    expect(r.bytes).toBeGreaterThan(0);
  });
});

describe('parseArgs', () => {
  it('parses flags, numbers, and a positional file', () => {
    const o = parseArgs(['CLAUDE.md', '--budget=30000', '--warn-ratio=0.8', '--json', '--strict']);
    expect(o).toMatchObject({ file: 'CLAUDE.md', budget: 30000, warnRatio: 0.8, json: true, strict: true });
  });

  it('falls back to defaults when no flags given', () => {
    const o = parseArgs([]);
    expect(o).toMatchObject({ file: null, budget: DEFAULT_BUDGET, warnRatio: DEFAULT_WARN_RATIO, json: false, strict: false });
  });
});
