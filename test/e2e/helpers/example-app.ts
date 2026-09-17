import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

export interface PreparedExampleApp {
  /** Absolute path of the `<functionsDir>/_generated` directory. */
  generatedDir: string
  /** Whether this call generated `_generated` (it is removed again by `cleanup`). */
  generated: boolean
  /** Remove what this call created — never a developer's own files. */
  cleanup: () => void
}

const require = createRequire(import.meta.url)
const binOf = (pkg: string, bin: string) => join(dirname(require.resolve(`${pkg}/package.json`)), bin)
const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), '../../..')

/**
 * The examples are standalone apps of the *published* package: their
 * package.json says `nuxt-backend: latest`, and they are not workspace
 * members, so nothing links this checkout into them. For the e2e run the
 * package is this checkout's own build — one symlink at
 * `<example>/node_modules/nuxt-backend` provides it (Node resolves everything
 * else by walking up to the repository's hoisted node_modules), and it is
 * removed again by `cleanup` when this call created it.
 */
function linkLocalPackage(rootDir: string): () => void {
  const link = join(rootDir, 'node_modules', 'nuxt-backend')
  if (existsSync(link)) return () => {}
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(repoRoot, link, 'dir')
  return () => rmSync(link, { recursive: true, force: true })
}

/**
 * The two build preconditions an example app has after a developer's first
 * `nuxt dev` + `convex dev`, provisioned offline for a test run:
 *
 * - `node_modules/nuxt-backend`, a symlink to this checkout (see
 *   {@link linkLocalPackage}).
 * - `.nuxt/tsconfig.json` (via `nuxt prepare`, ~1s): the example's
 *   `tsconfig.json` extends it, and Vite refuses to transform `.vue` files
 *   when the extended file is missing. Skipped when it already exists — and
 *   left in place afterwards; `.nuxt` is the standard, gitignored artifact.
 * - `<functionsDir>/_generated` (via the Convex CLI's local codegen): the
 *   module aliases `#backend/api` to it, so the bundle needs the module even
 *   when the run targets a stub deployment. `--system-udfs` selects the plain
 *   `api`/`server`/`dataModel` generation — no deployment, no component
 *   evaluation, so it works offline. An existing directory (a developer's
 *   `convex dev` output) is left alone; one this call created is removed by
 *   `cleanup`, so the run leaves the working tree as it found it.
 */
export function prepareExampleApp(rootDir: string, functionsDir = 'backend'): PreparedExampleApp {
  const unlink = linkLocalPackage(rootDir)
  if (!existsSync(join(rootDir, '.nuxt/tsconfig.json'))) {
    execFileSync(process.execPath, [binOf('nuxt', 'bin/nuxt.mjs'), 'prepare', rootDir], {
      cwd: rootDir,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  }

  const generatedDir = join(rootDir, functionsDir, '_generated')
  const generated = !existsSync(generatedDir)
  if (generated) {
    // Deployment selection is skipped on this path, but keep the CLI from
    // reading a developer's deployment either way.
    const env = { ...process.env }
    delete env.CONVEX_DEPLOYMENT
    delete env.CONVEX_DEPLOY_KEY
    execFileSync(process.execPath, [binOf('convex', 'bin/main.js'), 'codegen', '--typecheck', 'disable', '--system-udfs'], {
      cwd: rootDir,
      env,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  }

  return {
    generatedDir,
    generated,
    cleanup: () => {
      if (generated) rmSync(generatedDir, { recursive: true, force: true })
      unlink()
    },
  }
}
