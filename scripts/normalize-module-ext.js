#!/usr/bin/env node
/**
 * Normalizes the Nuxt module entry from `.mjs`/`.d.mts` to `.js`/`.d.ts`.
 *
 * `@nuxt/module-builder` hardcodes `module.mjs`, `module.d.mts` and
 * `types.d.mts` output filenames. Since the package is `"type": "module"`,
 * those `.js` files are already ESM, so this step renames the entry to plain
 * extensions to keep `dist/` consistent with the Convex component output
 * (which `tsc` emits as `.js`/`.d.ts`).
 *
 * Idempotent: only acts on files that exist, so it is safe after both the
 * production build (`nuxt-module-build build`) and the dev stub
 * (`nuxt-module-build build --stub`).
 *
 * Usage:
 *   node scripts/normalize-module-ext.mjs
 */

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dist = resolve(__dirname, '..', 'dist')

const rename = (from, to) => {
  const src = join(dist, from)
  if (existsSync(src)) renameSync(src, join(dist, to))
}

// ESM entry + its declaration map: pure renames (no self-referencing imports).
rename('module.mjs', 'module.js')
rename('module.d.mts', 'module.d.ts')

// Aggregated types re-export from `./module.mjs`; rewrite the specifier first.
const typesSrc = join(dist, 'types.d.mts')
if (existsSync(typesSrc)) {
  const out = readFileSync(typesSrc, 'utf8').replaceAll('./module.mjs', './module.js')
  writeFileSync(join(dist, 'types.d.ts'), out)
  rmSync(typesSrc)
}

// Drop the unreferenced CJS declaration stub emitted only in dev/stub mode.
const cts = join(dist, 'module.d.cts')
if (existsSync(cts)) rmSync(cts)
