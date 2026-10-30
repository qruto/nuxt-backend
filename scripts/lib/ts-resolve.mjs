/**
 * Lets plain Node load the package's TypeScript sources, so a script reads
 * the registries themselves instead of a copy: Node strips the types, and
 * this resolves the extensionless (`./types`) and `.js`-suffixed relative
 * imports the sources write to the `.ts` file beside them, as the bundlers
 * do. Preload it before the script:
 *
 *   node --import ./scripts/lib/ts-resolve.mjs scripts/agent-guidance.mjs
 */
import { existsSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The `.ts` file a relative specifier means, or undefined when it names a file as written. */
function typescriptTarget(specifier, parentURL) {
  if (!specifier.startsWith('.') || !parentURL?.startsWith('file:') || !parentURL.endsWith('.ts')) return undefined
  const path = fileURLToPath(new URL(specifier, parentURL))
  if (existsSync(path) && statSync(path).isFile()) return undefined
  const bare = path.replace(/\.js$/, '')
  return [`${bare}.ts`, `${bare}/index.ts`].find(candidate => existsSync(candidate))
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const target = typescriptTarget(specifier, context.parentURL)
    return nextResolve(target ? pathToFileURL(target).href : specifier, context)
  },
})
