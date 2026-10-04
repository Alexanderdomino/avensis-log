import { defineConfig, devices } from '@playwright/test'

// Run with `npm run test:e2e`, which starts the Auth + Firestore emulators around this.
const PORT = 5174

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // iPhone 13 viewport/touch/UA, but on Chromium (the browser installed in CI/sandbox).
    ...devices['iPhone 13'],
    browserName: 'chromium',
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    geolocation: { latitude: 55.676111, longitude: 12.568333 },
    permissions: ['geolocation'],
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite --mode emulator --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
