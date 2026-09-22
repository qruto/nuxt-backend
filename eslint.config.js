// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import convexPlugin from '@convex-dev/eslint-plugin'

// Rules that need type information — each catches a bug nothing else here can
// see. `@nuxt/eslint-config` only builds the TypeScript program when
// `features.typescript.tsconfigPath` is set, and setting it turns on the whole
// typed ruleset (the `no-unsafe-*` family included), which is far noisier than
// what these six buy. So the program is set up below instead, once per
// TypeScript world, and the rules are shared between the two.
const typeAwareRules = /** @satisfies {import('eslint').Linter.RulesRecord} */ ({
  // A promise nobody awaits. It fails as an unhandled rejection at runtime —
  // in a Nuxt plugin that means a half-initialised app, in a Convex function
  // a write that silently never happened.
  '@typescript-eslint/no-floating-promises': 'error',
  // An async function passed where a void-returning one is expected — event
  // handlers, `watch` callbacks. The rejection has nowhere to go.
  '@typescript-eslint/no-misused-promises': 'error',
  // `await` on a non-thenable: always a mistake, and usually a missing call
  // parenthesis.
  '@typescript-eslint/await-thenable': 'error',
  // `String(value)` / template interpolation on something whose `toString` is
  // `Object.prototype`'s — ships "[object Object]" into a log line, a header
  // or a URL.
  '@typescript-eslint/no-base-to-string': 'warn',
  // Throwing a non-Error loses the stack, and `instanceof Error` guards
  // downstream stop matching.
  '@typescript-eslint/only-throw-error': 'warn',
  // Calling something upstream has marked `@deprecated`. It is the earliest
  // warning that an integration has fallen behind the component it wraps.
  '@typescript-eslint/no-deprecated': 'warn',
  // The last three are `warn` for now: each has findings in `src/` that need a
  // code change, not a lint exemption — the invite-link `siteUrl` (client),
  // the SDK error rethrown from the CLI's billing sync, and the email
  // integration's `audiences` calls that Resend has deprecated for segments.
  // Promote each to `error` as its findings are fixed; none of them should
  // stay `warn` past the first stable release.
})

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
  // Every Nuxt app in the repo, so the Nuxt-aware rules know which auto-imports
  // and components exist in each (nuxt/starter#module-devtools registers its
  // `client/` app the same way).
  dirs: {
    src: [
      './website',
      './devtools-client-app',
    ],
  },
})
  .append(
    // `.agents/`, `.claude/` and `.deepsec/` hold AI tooling references
    // (skill scripts, agent settings, scanner config), not package source —
    // exclude them from the lint rules. `examples/` stays linted: the examples
    // are standalone apps of the published package and ship as the consumer
    // smoke test.
    {
      ignores: ['.agents/**', '.claude/**', '.deepsec/**'],
    },
    // The Nuxt world — the module, its runtime and the CLI. The project
    // service picks the root tsconfig (Nuxt's generated one), the same program
    // `pnpm typecheck` runs, so a file the typecheck sees is a file these rules
    // see. There are no `.vue` files in `src/`, so the glob is complete.
    {
      files: ['src/**/*.ts'],
      ignores: ['src/convex/**'],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: typeAwareRules,
    },
    // The Convex world (component + integrations + client) runs in the Convex
    // worker runtime and has its own program, `tsconfig.convex.json` — a file
    // the project service cannot discover (it only walks up for a
    // `tsconfig.json`, and the root one excludes `src/convex`), so the program
    // is named explicitly. Same six rules: a floating promise inside a
    // mutation is a write that never lands.
    {
      files: ['src/convex/**/*.ts'],
      ignores: ['**/_generated/**', '**/*.test.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.convex.json',
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: typeAwareRules,
    },
    // Official Convex lint rules (same set the component template enables via
    // `@convex-dev/eslint-plugin` recommended — it only ships a legacy-format
    // preset, so the rules are registered here in flat-config form).
    {
      files: ['src/convex/**/*.ts'],
      ignores: ['**/_generated/**', '**/*.test.ts'],
      plugins: {
        // The plugin's rule typings target typescript-eslint 8 / ESLint 9 and
        // clash with ESLint 10's config types; the rules themselves run fine.
        '@convex-dev': /** @type {any} */ (convexPlugin),
      },
      rules: {
        '@convex-dev/no-old-registered-function-syntax': 'error',
        '@convex-dev/require-args-validator': 'error',
        '@convex-dev/explicit-table-ids': 'error',
        '@convex-dev/no-filter-in-query': 'warn',
      },
    },
    // Convex component test files use `any` for generic adapters
    {
      files: ['test/convex-component/**/*.test.ts', 'src/convex/test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    // Playground demos, example pages, and DevTools panel pages use short,
    // single-word names by design.
    {
      files: ['website/**/*.vue', 'examples/**/*.vue', 'devtools-client-app/**/*.vue'],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
  )
