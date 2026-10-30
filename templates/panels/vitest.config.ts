import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { backendTestAliases } from 'nuxt-backend/test-utils'

// Two projects: the backend functions on convex-test in the edge runtime, as
// the deployment runs them, and the pages over the mock backend in Nuxt.
// The browser run is Playwright's (playwright.config.ts).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'backend',
          include: ['backend/**/*.test.ts'],
          environment: 'edge-runtime',
        },
      },
      await defineVitestProject({
        resolve: { alias: backendTestAliases() },
        test: {
          name: 'app',
          include: ['test/app/**/*.test.ts'],
          environment: 'nuxt',
          environmentOptions: { nuxt: { domEnvironment: 'happy-dom' } },
        },
      }),
    ],
  },
})
