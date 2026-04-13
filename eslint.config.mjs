// @ts-check
import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

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
      './playground',
    ],
  },
})
  .append(
    // Convex component code runs in the Convex worker runtime.
    // Enforce no-floating-promises to catch silent failures.
    {
      files: ['src/convex-component/**/*.ts'],
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
    // Convex component test files use `any` for generic adapters
    {
      files: ['test/convex-component/**/*.test.ts', 'src/convex-component/test.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  )
