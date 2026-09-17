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

/** This package's own manifest version, read once from the package root. */
export function packageVersion(): string {
  return (JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as { version: string }).version
}
