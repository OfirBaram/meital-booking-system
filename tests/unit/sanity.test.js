import { describe, it, expect } from 'vitest';

describe('test runner sanity', () => {
  it('arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });

  it('environment is ESM', () => {
    expect(typeof import.meta.url).toBe('string');
  });
});
