import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/landing/**'],
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,

  // All run artifacts (screenshots, traces, videos, CLAUDE-FAILURES.md) land here.
  outputDir: 'test-results',

  // Reporters are additive:
  //  - dot/list  : human progress in the terminal
  //  - html      : the clickable report uploaded as a CI artifact
  //  - diagnostic: test-results/CLAUDE-FAILURES.md — one plain-text file an
  //                agent can read to know what failed and why (see ./tests/reporters)
  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never' }], ['./tests/reporters/diagnostic-reporter.js']]
    : [['list'], ['./tests/reporters/diagnostic-reporter.js']],

  use: {
    baseURL: 'http://localhost:4173',

    // Capture on EVERY failure (not only on retry). With retries=1 in CI the old
    // 'on-first-retry' setting meant the first failure had no trace/screenshot —
    // and a non-flaky failure that fails both times still only traced the retry.
    // 'retain-on-failure' guarantees an artifact for the run that actually failed.
    screenshot: 'only-on-failure',
    trace:      'retain-on-failure',
    video:      'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    command:             'npm run build -- --logLevel silent && npx serve dist -p 4173',
    port:                4173,
    reuseExistingServer: !process.env.CI,
    timeout:             120_000,
  },
})
