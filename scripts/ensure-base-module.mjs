/**
 * The website dev server resolves `nuxt-convex-module` through its built
 * `dist/runtime/**\/*.js`. While that package is a `link:` dependency, several
 * ordinary commands here — `pnpm install`, `nuxt-module-build` — leave it in
 * its *stub* state, where `dist/runtime` is a symlink to `src/runtime` and
 * holds TypeScript only. Nitro then dies with
 * `Could not load .../dist/runtime/nuxt/index.js`.
 *
 * So check before every dev boot and build it when it is missing. This whole
 * file disappears once the base module is published and the `link:` protocol
 * goes away.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const base = join(root, 'node_modules', 'nuxt-convex-module')

// Not linked (a published range, or not installed): nothing to guard.
if (!existsSync(base)) process.exit(0)

const probe = join(base, 'dist', 'runtime', 'nuxt', 'index.js')
if (existsSync(probe)) process.exit(0)

console.log('[nuxt-backend] base module is stubbed — building nuxt-convex-module…')
try {
  execFileSync('pnpm', ['--dir', base, 'run', 'build'], { stdio: 'inherit' })
}
catch {
  console.warn(
    '[nuxt-backend] could not build nuxt-convex-module automatically.\n'
    + `  Run it yourself: pnpm --dir ${base} run build`,
  )
  process.exit(0)
}

if (!existsSync(probe)) {
  console.warn('[nuxt-backend] nuxt-convex-module built, but dist/runtime is still a stub — the dev server will fail to load it.')
}
