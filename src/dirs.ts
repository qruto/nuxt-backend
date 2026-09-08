import { basename, dirname } from 'node:path'
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
