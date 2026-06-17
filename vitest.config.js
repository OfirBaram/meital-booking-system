import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['tests/unit/**/*.test.js'],
    testTimeout: 45_000,
    bail:        6,          // stop after 6th failure (>5 = bail)
    reporters: process.env.CI
      ? ['verbose', ['json', { outputFile: 'test-results/vitest-results.json' }]]
      : ['verbose'],
  },
})
