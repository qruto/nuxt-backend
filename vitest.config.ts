import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { scaffoldBackend } from './test/helpers/scaffold-backend.ts'
import { backendTestAliases } from './src/runtime/test-utils/aliases.ts'

const nuxtImportsTestAlias = fileURLToPath(new URL('./test/helpers/nuxt-imports.ts', import.meta.url))
// `nuxt/server` for the server runtime the unit tests run: the real one needs a built server.
const nuxtServerTestAlias = fileURLToPath(new URL('./test/helpers/nuxt-server.ts', import.meta.url))
// The website's `~~/shared`, for the website modules a unit test runs (its offline middleware).
const websiteSharedAlias = fileURLToPath(new URL('./website/shared', import.meta.url))

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
      //
      // And the built Convex code: an app's `nuxt-backend/*` imports resolve
      // through the package's exports to dist/convex, so every suite built on
      // a scaffolded backend runs the build, not src/. Its source maps point
      // at src/, and v8 credits those lines there. `dev:prepare:lib` builds it
      // before the tests, in CI and the git hooks alike.
      include: ['src/**/*.ts', 'dist/convex/**/*.js'],
      reporter: ['text', 'json', 'lcov'],
      // A ratchet: one point below the measured numbers, so a regression fails
      // CI without being brittle. Raise them whenever coverage climbs — never
      // lower them to make a change pass.
      // Measured by `test:coverage`, dist/convex counted: 95.40 / 87.35 / 86.55 / 96.90.
      thresholds: {
        'statements': 94,
        'branches': 86,
        'functions': 85,
        'lines': 95,
        // The module definition and the registration helpers it calls in
        // src/nuxt/, which only the `module` project's real Nuxt boot reaches.
        // A global number would hide a drop here behind the well-covered
        // runtime. Nuxt's own loader (jiti) transpiles them in that project,
        // and the mapping back to source credits counts to the wrong
        // statements, so edits move these numbers more than the code does.
        // Watcher callbacks count only when a test fires their hook: one that
        // relies on a stray watch event landing mid-run passes on one leg and
        // fails on the next. Measured: module.ts 93.93 lines / 100 functions,
        // src/nuxt/ 64.06 / 52 together; CI's Windows leg reads about two
        // points lower on lines, which the floors leave room for.
        'src/module.ts': {
          lines: 90,
          functions: 97,
        },
        'src/nuxt/**/*.ts': {
          lines: 61,
          functions: 50,
        },
      },
    },
    projects: [
      {
        resolve: {
          alias: {
            '#imports': nuxtImportsTestAlias,
            'nuxt/server': nuxtServerTestAlias,
            '~~/shared': websiteSharedAlias,
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
        // The authorization probes run the scaffold's own backend files.
        plugins: [scaffoldBackend()],
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
      await defineVitestProject({
        // Tests written the way an app writes them, against the published
        // test helpers (nuxt-backend/test-utils): the aliases put the mock in
        // place of the base module's client and session for every file here,
        // so none of them mocks a module. The real client's tests stay in the
        // `nuxt` project above, which has no aliases.
        tsconfig: 'tsconfig.json',
        resolve: {
          alias: backendTestAliases(),
        },
        test: {
          name: 'app',
          include: ['test/app/**/*.{test,spec}.ts'],
          environment: 'nuxt',
          // An app's Nuxt transforms the base module (it is one of its
          // modules), which is where the aliases apply; this root app does not
          // install it, so it is inlined here by hand.
          server: { deps: { inline: [/nuxt-convex-module/] } },
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
          // The docs MCP registers its tools through the toolkit, whose
          // runtime imports Nitro's: transformed here, test/docs/docs-mcp.test.ts
          // stands Nitro in for it.
          server: { deps: { inline: ['@nuxtjs/mcp-toolkit'] } },
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
