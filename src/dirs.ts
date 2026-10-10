import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Chunk-proof module directory. This code executes from three possible
// locations: `src/` (the dev stub jiti-loads sources), `dist/` (the built
// `module.js` entry), or `dist/shared|chunks/*` (unbuild hoists modules the
// CLI entry also imports into sibling chunk files, where `import.meta.url`
// no longer sits next to `runtime/`). Anchoring `./runtime` lookups here
// keeps them correct in all three layouts.
const here = dirname(fileURLToPath(import.meta.url))
export const moduleDir = basename(here) === 'shared' || basename(here) === 'chunks'
  ? dirname(here)
  : here

/**
 * The package root: `moduleDir` is `src/` or `dist/`, both one level below
 * it. What the CLI's `--version` and the DevTools panel report.
 */
export const packageDir = dirname(moduleDir)

interface PackageManifest {
  version: string
  dependencies: Record<string, string>
}

let manifest: PackageManifest | undefined

/** This package's own manifest, read once from the package root. */
function packageManifest(): PackageManifest {
  manifest ??= JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as PackageManifest
  return manifest
}

/** This package's own manifest version. */
export function packageVersion(): string {
  return packageManifest().version
}

/** The range this package declares for one of its own dependencies. */
export function dependencyRange(name: string): string {
  const range = packageManifest().dependencies[name]
  if (!range) throw new Error(`nuxt-backend does not depend on ${name}`)
  return range
}
