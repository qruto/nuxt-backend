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
      // TypeScript only: the stylesheets and the server runtime's tsconfig.json
      // are not code, and coverage would try to parse them.
      include: ['src/**/*.ts'],
      reporter: ['text', 'json', 'lcov'],
      // A ratchet: one point below the measured numbers, so a regression fails
      // CI without being brittle. Raise them whenever coverage climbs — never
      // lower them to make a change pass.
      // Measured over `--project "!e2e"`: 84.59 / 77.37 / 83.45 / 86.43.
      thresholds: {
        'statements': 83,
        'branches': 76,
        'functions': 82,
        'lines': 85,
        // The registration surface, which only the `module` project's real
        // Nuxt boot reaches. A global number would hide a drop here behind
        // the well-covered runtime. It reads low: Nuxt's own loader (jiti)
        // transpiles this file in that project, and the mapping back to source
        // drops statements that run on every boot (the first line of
        // registerBackendTypeFallback reads as never run), so edits move it.
        // Watcher callbacks count only when a test fires their hook: one that
        // relies on a stray watch event landing mid-run passes on one leg and
        // fails on the next. Measured: 79 lines / 82 functions; CI's Windows
        // leg reads about two points lower on lines, which the floor leaves
        // room for.
        'src/module.ts': {
          lines: 72,
          functions: 73,
        },
      },
    },
    projects: [
      {
        resolve: {
          alias: {
            '#imports': nuxtImportsTestAlias,
          },
        },
        // The root tsconfig, as for docs below: a unit test that imports a
        // website/ module would otherwise read website/tsconfig.json, which
        // extends a `.nuxt/` this job never generates.
        tsconfig: 'tsconfig.json',
        test: {
          name: 'unit',
          include: ['test/unit/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        // One tsconfig for every file: the playground guards test runs the
        // website's functions, and website/tsconfig.json extends a .nuxt/ that
        // only exists after `nuxt prepare website`, which this job skips.
        tsconfig: 'tsconfig.convex.json',
        test: {
          name: 'convex-component',
          include: ['test/convex-component/**/*.test.ts'],
          environment: 'edge-runtime',
        },
      },
      await defineVitestProject({
        // The root tsconfig, as for docs below: the docs helpers some tests
        // import read website/shared/, whose tsconfig extends a `.nuxt/`
        // this job never generates.
        tsconfig: 'tsconfig.json',
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
        // Docs ↔ code contract: reads markdown and source, and imports only
        // the plain modules that hold names, commands and the install prompt.
        // Runs in CI's `static` job, which every PR gets — the `test` job is
        // skipped for docs-only changes.
        //
        // Every file, the website's included, compiles with the root
        // tsconfig: the website's extends a `.nuxt/` only its own job
        // generates, and without it nothing under website/ would transform.
        tsconfig: 'tsconfig.json',
        test: {
          name: 'docs',
          include: ['test/docs/**/*.{test,spec}.ts'],
          environment: 'node',
        },
      },
      {
        // The typed subpaths are the product; this project is the only place
        // their types are asserted. Nothing runs: vitest hands the
        // `*.test-d.ts` files to tsc (`typecheck.only`) and maps each type
        // error to the `test` block it sits in, one per subpath. The tsconfig
        // resolves `nuxt-backend/*` to the sources (see
        // test/types/tsconfig.json), so the assertions hold before any build.
        test: {
          name: 'types',
          include: [],
          typecheck: {
            enabled: true,
            only: true,
            include: ['test/types/**/*.test-d.ts'],
            tsconfig: 'test/types/tsconfig.json',
          },
        },
      },
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
