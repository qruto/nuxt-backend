import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// The project's package manager, as the host's build sees it: what
// `deploy --build` runs the app's build and the package's CLI with. A
// project on pnpm or Bun builds with its own scripts and settings, and one on
// Yarn Plug'n'Play has no `node_modules/.bin` for npm to find a binary in.

/** The package managers `deploy --build` runs with. */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Each lockfile, and the package manager that writes it. */
const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
]

/** The package manager `package.json`'s `packageManager` field names (`pnpm@11.2.0`), Corepack's pin. */
function pinned(dir: string): PackageManager | null {
  try {
    const field = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { packageManager?: unknown }).packageManager
    const name = typeof field === 'string' ? field.split('@')[0] : undefined
    return LOCKFILES.find(([, manager]) => manager === name)?.[1] ?? null
  }
  catch {
    return null
  }
}

/**
 * The package manager of the project in `rootDir`: the one `package.json`
 * pins, else the one whose lockfile sits in the project or a folder above it
 * (a workspace keeps one lockfile at its root), the nearest first, never
 * above the repository's root; npm when nothing says.
 */
export function packageManagerOf(rootDir: string): PackageManager {
  let dir = rootDir
  for (;;) {
    const manager = pinned(dir) ?? LOCKFILES.find(([file]) => existsSync(join(dir, file)))?.[1]
    if (manager) return manager
    if (dir === dirname(dir) || existsSync(join(dir, '.git'))) return 'npm'
    dir = dirname(dir)
  }
}

/** The app's build script, through the package manager: `pnpm run build`. */
export function runScript(manager: PackageManager, script: string): string {
  return `${manager} run ${script}`
}

/** A binary the project installed, through the package manager: `pnpm exec nuxt-backend`. */
export function execBinary(manager: PackageManager, binary: string): string {
  switch (manager) {
    case 'pnpm': return `pnpm exec ${binary}`
    // Yarn 1 and Yarn Berry both run an installed binary by its name, Plug'n'Play too.
    case 'yarn': return `yarn ${binary}`
    case 'bun': return `bunx ${binary}`
    default: return `npx ${binary}`
  }
}
