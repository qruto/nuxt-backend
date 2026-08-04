// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'
import convexPlugin from '@convex-dev/eslint-plugin'

// Run `npx @eslint/config-inspector` to inspect the resolved config interactively
export default createConfigForNuxt({
  features: {
    // Rules for module authors
    tooling: true,
    // Rules for formatting
    stylistic: true,
  },
  dirs: {
    src: [
      './website',
    ],
  },
})
  .append(
    // `.agents/` and `.deepsec/` hold AI tooling references (skill scripts,
    // scanner config), not package source — exclude them from the lint rules.
    {
      ignores: ['.agents/**', '.deepsec/**'],
    },
    // Convex code (component + integrations + client) runs in the Convex
    // worker runtime. Enforce no-floating-promises to catch silent failures.
    {
      files: ['src/convex/**/*.ts'],
      ignores: ['**/_generated/**', '**/*.test.ts'],
      languageOptions: {
        parserOptions: {
          project: './tsconfig.convex.json',
          tsconfigRootDir: import.meta.dirname,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
      },
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
    // Playground demos and example pages use short, single-word names by design.
    {
      files: ['website/**/*.vue', 'examples/**/*.vue'],
      rules: {
        'vue/multi-word-component-names': 'off',
      },
    },
  )
