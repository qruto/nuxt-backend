// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import { backendEslint } from './src/eslint.ts'

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
  '@typescript-eslint/no-base-to-string': 'error',
  // Throwing a non-Error loses the stack, and `instanceof Error` guards
  // downstream stop matching.
  '@typescript-eslint/only-throw-error': 'error',
  // Calling something upstream has marked `@deprecated`. It is the earliest
  // warning that an integration has fallen behind the component it wraps.
  '@typescript-eslint/no-deprecated': 'error',
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
    // exclude them from the lint rules. `templates/` and `examples/` stay
    // linted: they are standalone apps of the published package and ship as
    // the consumer smoke test.
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
    // The package's own ESLint preset (`nuxt-backend/eslint`) over its own
    // Convex code, so the rule set consumers get is the one this code passes.
    // Imported from source: CI lints before anything is built, and Node strips
    // the types.
    ...backendEslint({ functionsDir: 'src/convex' }),
    // The component schema mirrors the Better Auth adapter's schema. When the
    // adapter sorts by creation time it needs an index of exactly the queried
    // fields, so an index that prefixes a longer one is not redundant there.
    {
      files: ['src/convex/components/backend/schema.ts'],
      rules: {
        '@convex-dev/no-duplicate-indexes': 'off',
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
      files: ['website/**/*.vue', 'templates/**/*.vue', 'examples/**/*.vue', 'devtools-client-app/**/*.vue'],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
  )
