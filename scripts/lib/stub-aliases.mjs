/**
 * The jiti aliases the dev stub's CLI resolves the package's own subpaths
 * through. `nuxt-module-build --stub` aliases only the package name to the
 * repository root, so a file that imports `nuxt-backend/billing` (the
 * website's `billing.catalog.ts` does) fails to import from `dist/cli.mjs`
 * with "Cannot find module …/nuxt-backend/billing": the root has no such
 * path, and jiti does not read the exports map of the package it aliases.
 * Each export maps to the source file its `dist` entry is built from.
 *
 * Used by build.config.ts (`stubOptions.jiti.alias`), which applies only to
 * the stub: a real build bundles the CLI and resolves nothing through it.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The entry a subpath export resolves to, `dist/…` as a source path under `src/`; `null` for an export that is not code (`package.json`). */
function sourceOf(target, rootDir) {
  if (typeof target !== 'string') {
    // An export that only types a path (`./_generated/component`): the types name the source.
    target = target?.types?.replace(/\.d\.(?:ts|mts)$/, '.ts')
    if (!target) return null
  }
  const source = join(rootDir, target.replace(/^\.\/dist\//, 'src/').replace(/\.m?js$/, ''))
  for (const extension of ['.ts', '.vue', '']) if (existsSync(`${source}${extension}`)) return `${source}${extension}`
  return null
}

/**
 * Every export of the package as a jiti alias: `nuxt-backend/billing` →
 * `<root>/src/convex/integrations/billing.ts`, and the package name itself →
 * its module entry (`src/module.ts`), which is what the exports map's `.`
 * builds from. Exports that are not source code are left out.
 */
export function stubAliases(pkg, rootDir) {
  const aliases = {}
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (key === './package.json') continue
    const source = sourceOf(target.default ?? target.import ?? target, rootDir)
    if (!source) continue
    aliases[key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`] = source
  }
  return aliases
}
