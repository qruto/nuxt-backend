#!/usr/bin/env node
/**
 * Builds the Convex half of the package: `src/convex/**` → `dist/convex/**`
 * (JS + declarations) through `tsconfig.convex-component.build.json`, then
 * bumps the mtime of the website's `backend/convex.config.ts`.
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
import { existsSync, utimesSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
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

const websiteConvexConfig = resolve(rootDir, 'website', 'backend', 'convex.config.ts')
if (existsSync(websiteConvexConfig)) {
  const now = new Date()
  utimesSync(websiteConvexConfig, now, now)
}
