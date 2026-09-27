/**
 * The ESLint preset for a `nuxt-backend` app: the official Convex lint rules,
 * scoped to the functions directory, with Convex's generated code ignored.
 *
 * Needs `@convex-dev/eslint-plugin` installed next to it (an optional peer).
 *
 * @example
 * ```js
 * // eslint.config.mjs
 * import withNuxt from './.nuxt/eslint.config.mjs'
 * import { backendEslint } from 'nuxt-backend/eslint'
 *
 * export default withNuxt(backendEslint())
 * ```
 *
 * @module
 */
import convexPlugin from '@convex-dev/eslint-plugin'
import type { ESLint, Linter } from 'eslint'

/**
 * The rules the preset turns on, at the levels of the plugin's own
 * recommended config. It leaves out what that config leaves out:
 * `require-access-control` and `import-wrong-runtime` (off there), and
 * `no-collect-in-query` (not in it).
 */
export const BACKEND_ESLINT_RULES: Readonly<Record<string, 'error' | 'warn'>> = Object.freeze({
  '@convex-dev/no-old-registered-function-syntax': 'error',
  '@convex-dev/require-args-validator': 'error',
  '@convex-dev/explicit-table-ids': 'error',
  '@convex-dev/no-filter-in-query': 'warn',
  '@convex-dev/no-top-of-hour-crons': 'warn',
  '@convex-dev/no-schema-import-cycle': 'error',
  '@convex-dev/no-duplicate-indexes': 'error',
  '@convex-dev/no-process-env': 'error',
})

/** Options of {@link backendEslint}. */
export interface BackendEslintOptions {
  /**
   * The functions directory, relative to the lint root. It is the `functions`
   * entry of `convex.json`, `backend` in every scaffolded app.
   *
   * @defaultValue `'backend'`
   */
  functionsDir?: string
  /** Rule levels that override or extend {@link BACKEND_ESLINT_RULES}. */
  rules?: Linter.RulesRecord
}

/**
 * Two flat-config entries: `nuxt-backend:convex` applies the Convex rules to
 * the functions directory (tests excluded), and `nuxt-backend:generated`
 * ignores every `_generated` folder in it, including the local install's
 * component codegen.
 *
 * The rules parse TypeScript. Inside `withNuxt(…)` the parser is already set;
 * a standalone config adds `typescript-eslint`'s parser for `.ts` files.
 */
export function backendEslint(options: BackendEslintOptions = {}): Linter.Config[] {
  const dir = (options.functionsDir ?? 'backend').replace(/^\.\//, '').replace(/\/+$/, '')
  return [
    {
      name: 'nuxt-backend:generated',
      ignores: [`${dir}/**/_generated/**`],
    },
    {
      name: 'nuxt-backend:convex',
      files: [`${dir}/**/*.ts`],
      ignores: [`${dir}/**/*.test.ts`],
      plugins: {
        // The plugin's typings target ESLint 9 and clash with ESLint 10's
        // config types; the rules run on both.
        '@convex-dev': convexPlugin as unknown as ESLint.Plugin,
      },
      rules: { ...BACKEND_ESLINT_RULES, ...options.rules },
    },
  ]
}
