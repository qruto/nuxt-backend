import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { stubAliases } from './scripts/lib/stub-aliases.mjs'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { name: string, exports: Record<string, unknown> }

export default {
  // The build has three steps (package.json `build`): this one, then
  // scripts/normalize-module-ext.mjs renames its `.mjs`/`.d.mts` output to the
  // `.js`/`.d.ts` names the exports map uses, then the Convex component build
  // writes `dist/convex/`. unbuild checks the exports map at the end of this
  // first step, before either has run, and warns about every one of those
  // paths ("Potential missing package.json files") — warnings by
  // construction, so they must not fail the build. What the finished build
  // ships is checked by `pnpm check:tarball` instead: publint, attw and the
  // required-file list.
  failOnWarn: false,
  // The CLI ships alongside the module build (dist/cli.mjs → the `nuxt-backend` bin).
  entries: [
    { input: 'src/cli', name: 'cli' },
    // The ESLint preset (dist/eslint.mjs → `nuxt-backend/eslint`).
    { input: 'src/eslint', name: 'eslint' },
  ],
  // The dev stub (`nuxt-module-build --stub`) loads the sources through jiti,
  // which aliases the package name to the repository root and nothing else:
  // a file the CLI imports that names `nuxt-backend/billing` (the website's
  // `billing.catalog.ts`) would fail with "Cannot find module". Each export
  // maps to its source instead. A real build bundles the CLI and ignores this.
  stubOptions: { jiti: { alias: stubAliases(pkg, rootDir) } },
}
