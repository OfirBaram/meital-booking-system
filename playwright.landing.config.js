import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:   'tests/e2e/landing',
  timeout:   35_000,
  retries:   process.env.CI ? 1 : 0,
  outputDir: 'test-results',

  reporter: process.env.CI
    ? [['dot'], ['html', { open: 'never' }], ['./tests/reporters/diagnostic-reporter.js']]
    : [['list'], ['./tests/reporters/diagnostic-reporter.js']],

  use: {
    baseURL:    'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace:      'retain-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',  use: { ...devices['iPhone 14'] } },
  ],

  webServer: {
    command:             'npm --prefix nail-artist-landing-page run dev',
    port:                3000,
    reuseExistingServer: true,
    timeout:             40_000,
  },
})
