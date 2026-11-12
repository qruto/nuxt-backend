import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir } from './scaffold'

// Single source of truth for functions-dir resolution (convex.json →
// existing `backend/` → existing `convex/` → `backend`), shared with the
// scaffolder so aliases, type fallbacks, and generated files always agree.
export { resolveFunctionsDir } from './scaffold'

/** Whether `convex dev` has emitted the generated `api` module. */
export function hasGeneratedApi(rootDir: string, functionsDir: string = resolveFunctionsDir(rootDir)): boolean {
  const generatedApi = join(rootDir, functionsDir, '_generated', 'api')
  return existsSync(`${generatedApi}.d.ts`) || existsSync(`${generatedApi}.js`)
}

/**
 * The top-level names of the function tree codegen saw (`account`,
 * `billing` for `billing/catalog.ts`), read from `_generated/api.d.ts`'s
 * `ApiFromModules<{ … }>`, sorted: `[]` for an empty block. `null` when there
 * is no such file or the block can't be read, so the caller keeps the whole
 * `api` rather than hiding namespaces it could not see.
 *
 * Codegen's runtime `api` is `anyApi`, a proxy that answers every name, so
 * it can't tell an app without `backend/access.ts` from one with it. This
 * list can.
 */
export function generatedModules(rootDir: string, functionsDir: string = resolveFunctionsDir(rootDir)): string[] | null {
  let source: string
  try {
    source = readFileSync(join(rootDir, functionsDir, '_generated', 'api.d.ts'), 'utf8')
  }
  catch {
    return null
  }
  const block = /ApiFromModules<\{([^}]*)\}>/.exec(source)?.[1]
  if (block === undefined) return null
  if (block.trim() === '') return []
  const names = new Set<string>()
  for (const [, quoted, bare] of block.matchAll(/^\s*(?:"([^"]+)"|([\w$]+))\s*:\s*typeof\b/gm)) {
    names.add((quoted ?? bare)!.split('/')[0]!)
  }
  return names.size > 0 ? [...names].sort() : null
}

/**
 * The backend-branded import aliases. Same targets as the base module's
 * `#convex/*` map — this package operates in backend terminology, so app code
 * (and the scaffolded templates) import `#backend/api` etc.
 *
 * Order is significant: alias resolution is first-match-wins and `#backend`
 * is a prefix of `#backend/api`, so the specific entries must come first.
 */
export function getBackendAliases(rootDir: string, runtimeDir?: string): Record<string, string> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const backendDir = join(rootDir, functionsDir)
  const generatedDir = join(backendDir, '_generated')

  return {
    '#backend/api': join(generatedDir, 'api'),
    '#backend/server': join(generatedDir, 'server'),
    '#backend/dataModel': join(generatedDir, 'dataModel'),
    '#backend/_generated': generatedDir,
    // The packaged UI's helpers and part types, and the runtime an ejected
    // file imports from (src/cli/eject.ts): the package's, not the app's.
    ...(runtimeDir
      ? {
          '#backend/a11y': join(runtimeDir, 'vue/a11y'),
          '#backend/parts': join(runtimeDir, 'vue/parts'),
          '#backend/runtime': join(runtimeDir, 'vue'),
        }
      : {}),
    '#backend': backendDir,
  }
}

/**
 * Nitro's alias map, created when absent. Nuxt types `nitro` by the server
 * builder's own types and, without them in the program, by a fallback that
 * leaves `alias` out; Nitro still reads it.
 */
export function nitroAliases(nuxt: Nuxt): Record<string, string> {
  const nitro = (nuxt.options.nitro ||= {}) as { alias?: Record<string, string> }
  return (nitro.alias ||= {})
}

/** Register the `#backend/*` aliases for both Vite and Nitro. */
export function registerBackendAliases(nuxt: Nuxt, runtimeDir?: string): void {
  const aliases = getBackendAliases(nuxt.options.rootDir, runtimeDir)
  const nitro = nitroAliases(nuxt)

  for (const [alias, target] of Object.entries(aliases)) {
    nuxt.options.alias[alias] = target
    nitro[alias] = target
  }
}

/**
 * Placeholder (`any`-typed) ambient declarations for the `#backend/*` modules
 * while `convex dev` hasn't emitted codegen yet, so a fresh project typechecks.
 * Once codegen exists the template goes empty and the generated types resolve
 * through the tsconfig `paths` the aliases produce.
 */
export function backendTypeFallbackContents(hasApi: boolean, functionsDir: string): string {
  if (hasApi) {
    return 'export {}\n'
  }
  return [
    `// Placeholder until \`npx convex dev\` generates ${functionsDir}/_generated.`,
    'declare module \'#backend/api\' {',
    '  export const api: any',
    '  export const internal: any',
    '  export const components: any',
    '}',
    'declare module \'#backend/server\' {',
    '  export const query: any',
    '  export const internalQuery: any',
    '  export const mutation: any',
    '  export const internalMutation: any',
    '  export const action: any',
    '  export const internalAction: any',
    '  export const httpAction: any',
    '  export type QueryCtx = any',
    '  export type MutationCtx = any',
    '  export type ActionCtx = any',
    '}',
    'declare module \'#backend/dataModel\' {',
    '  export type Doc<TableName extends string = string> = any',
    '  export type Id<TableName extends string = string> = string',
    '  export type DataModel = any',
    '  export type TableNames = string',
    '}',
    '',
  ].join('\n')
}
