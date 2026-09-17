import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

const nuxtImportsTestAlias = fileURLToPath(new URL('./test/helpers/nuxt-imports.ts', import.meta.url))

export default defineConfig({
  test: {
    // In CI, also emit a JUnit report for Codecov Test Analytics (flaky/failure
    // tracking). Local runs keep the default console reporter only.
    reporters: process.env.CI
      ? ['default', 'github-actions', ['junit', { outputFile: 'test-report.junit.xml' }]]
      : ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json', 'lcov'],
      // Lock in the current baseline (a small margin below the measured numbers)
      // so a regression fails CI without being brittle. Raise these as coverage
      // climbs; the harder build-time/runtime files (auth plugins/middleware,
      // the scaffold writer) keep the global ceiling modest for now.
      // Rebaselined with the `module` project, which boots real Nuxt through
      // src/module.ts — the registration surface unit tests could not reach.
      // Measured over `--project "!e2e"`: 73.37 / 65.21 / 72.24 / 75.20.
      thresholds: {
        statements: 72,
        branches: 64,
        functions: 71,
        lines: 74,
      },
    },
    projects: [
      {
        resolve: {
          alias: {
            '#imports': nuxtImportsTestAlias,
          },
        },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'convex-component',
          include: ['test/convex-component/**/*.test.ts'],
          environment: 'edge-runtime',
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['test/nuxt/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          setupFiles: ['./test/setup/websocket.ts'],
          environmentOptions: {
            nuxt: {
              rootDir: fileURLToPath(new URL('.', import.meta.url)),
              domEnvironment: 'happy-dom',
            },
          },
        },
      }),
      {
        test: {
          // Boots real Nuxt instances against test/fixtures/registration
          // (`loadNuxt`, no build) and inspects the registration surface —
          // serial, with the slack a cold Nuxt boot needs.
          name: 'module',
          include: ['test/module/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          // Full builds of the example apps: one at a time, and a build can
          // legitimately take minutes on a cold cache.
          name: 'e2e',
          include: ['test/e2e/**/*.{test,spec}.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 120_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
})
