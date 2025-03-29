import {defineConfig, devices} from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

const workers = process.env.CI ? 2 : 4;
const numWorkers = process.env.WORKERS
  ? parseInt(process.env.WORKERS, 10)
  : workers;
const webServers = [
  {
    command: 'npm run fake-llm',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
  },
];

// Add test servers based on the number of workers
for (let i = 0; i < numWorkers; i++) {
  const port = 8690 + i;
  webServers.push({
    command: `./scripts/run_test_server.sh --port=${port} --server-index=${i}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  });
}

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e/tests',
  // Use a custom snapshot path template because Playwright's default
  // is platform-specific which isn't necessary for Mesop e2e tests
  // which should be platform agnostic (we don't do screenshots; only textual diffs).
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/snapshots/{testFileName}_{arg}{ext}',

  timeout: process.env.CI ? 60_000 : 25_000, // Budget more time for CI since tests run slower there.
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry once (unfortunately there's some baseline flakiness) */
  retries: 1,
  /* Opt out of parallel tests on CI. */
  workers,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:8690',

    /* See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',

    // Capture screenshot after each test failure.
    screenshot: 'on',

    video: 'retain-on-failure',
  },
  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: webServers,
});
