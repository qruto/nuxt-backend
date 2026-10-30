#!/usr/bin/env node
/**
 * Builds the Convex half of the package: `src/convex/**` → `dist/convex/**`
 * (JS + declarations) through `tsconfig.convex-component.build.json`, then
 * bumps the mtime of the website's `backend/convex.config.ts`.
 *
 * The backend's health route detects the app capabilities with the registry's own
 * code, so the runtime-neutral files it imports from outside `src/convex`
 * (the capability registry, the env registry) are emitted beside `dist/convex`.
 * They are code only: their sources do not ship, so their source maps are
 * dropped (only `dist/convex` carries maps, which resolve into the
 * `src/convex` the package ships), and so are their declarations, which no
 * published declaration reaches (the health route's are `@internal`). Their
 * sources write each relative import with its `.js`, as `src/convex` does,
 * so Node loads them as Convex's bundler does; `check:tarball` holds every
 * relative import under `dist/` to a file that exists.
 *
 * The touch is for the running `convex dev` (website): it watches the app's
 * own `backend/` tree, not `dist/`, so a rebuilt component would otherwise not
 * be re-pushed until some app file happened to change. Touching the app's
 * `convex.config.ts` — the file that mounts the component — is the smallest
 * change that re-triggers a push. Skipped when the file is absent.
 *
 * A script rather than an inline `node -e` in package.json: that one-liner
 * needed shell quoting that differs between sh and cmd.exe, so it broke on
 * Windows. `execFileSync` with an argv array involves no shell at all.
 *
 * Usage:
 *   node scripts/build-convex-component.mjs
 */

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

// The project's own TypeScript, run under the current Node — no `tsc` shim
// lookup on PATH, so it behaves the same under `pnpm run`, a git hook and CI.
const tsc = require.resolve('typescript/bin/tsc')
const project = resolve(rootDir, 'tsconfig.convex-component.build.json')

try {
  execFileSync(process.execPath, [tsc, '--project', project], { cwd: rootDir, stdio: 'inherit' })
}
catch (error) {
  // tsc already printed its diagnostics; exit with its status, without a
  // second stack trace on top.
  process.exit(typeof error.status === 'number' ? error.status : 1)
}

/** Every file under `dir`, never following a symlink (`dist/runtime` is one into `src/` after dev:prepare). */
function filesUnder(dir) {
  if (!existsSync(dir) || lstatSync(dir).isSymbolicLink()) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(join(dir, entry.name)) : entry.isFile() ? [join(dir, entry.name)] : [])
}

// The files emitted outside dist/convex: the build's include reaches them
// only through imports, so they are the ones beside dist/convex here.
const dist = resolve(rootDir, 'dist')
const outside = [
  ...['analyze', 'capabilities', 'devtools', 'findings'].flatMap(dir => filesUnder(join(dist, dir))),
  ...['env-registry.js', 'env-registry.d.ts', 'env-registry.js.map', 'env-registry.d.ts.map'].map(file => join(dist, file)).filter(file => existsSync(file)),
]
for (const file of outside) {
  if (file.endsWith('.map') || file.endsWith('.d.ts')) rmSync(file)
  else if (file.endsWith('.js')) writeFileSync(file, readFileSync(file, 'utf8').replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'))
}

const websiteConvexConfig = resolve(rootDir, 'website', 'backend', 'convex.config.ts')
if (existsSync(websiteConvexConfig)) {
  const now = new Date()
  utimesSync(websiteConvexConfig, now, now)
}
