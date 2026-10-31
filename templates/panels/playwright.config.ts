import { defineConfig, devices } from '@playwright/test'

// The paid path in a real browser, against `npx nuxt-backend dev` with every
// provider in its test mode: the Polar sandbox token and the Resend key in
// .env.local, pushed with `npx nuxt-backend env push`.
export default defineConfig({
  testDir: 'e2e',
  // A strip draws in about a minute on real models.
  timeout: 240_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
