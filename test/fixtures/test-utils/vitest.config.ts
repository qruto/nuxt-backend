// The Testing page's setup, verbatim (test/docs/test-utils-example.test.ts
// holds the two to each other), run by CI's `pack` job in a starter app
// installed from the packed package.
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { backendTestAliases } from 'nuxt-backend/test-utils'

export default defineConfig({
  test: {
    projects: [
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
