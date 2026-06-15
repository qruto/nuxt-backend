import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

const nuxtImportsTestAlias = fileURLToPath(new URL('./test/helpers/nuxt-imports.ts', import.meta.url))

export default defineConfig({
  test: {
    // In CI, also emit a JUnit report for Codecov Test Analytics (flaky/failure
    // tracking). Local runs keep the default console reporter only.
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'test-report.junit.xml' }]]
      : ['default'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json', 'lcov'],
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
          name: 'e2e',
          include: ['test/e2e/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
