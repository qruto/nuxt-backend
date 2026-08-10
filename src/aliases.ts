import { existsSync } from 'node:fs'
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
 * The backend-branded import aliases. Same targets as the base module's
 * `#convex/*` map — this package operates in backend terminology, so app code
 * (and the scaffolded templates) import `#backend/api` etc.
 *
 * Order is significant: alias resolution is first-match-wins and `#backend`
 * is a prefix of `#backend/api`, so the specific entries must come first.
 */
export function getBackendAliases(rootDir: string): Record<string, string> {
  const functionsDir = resolveFunctionsDir(rootDir)
  const backendDir = join(rootDir, functionsDir)
  const generatedDir = join(backendDir, '_generated')

  return {
    '#backend/api': join(generatedDir, 'api'),
    '#backend/server': join(generatedDir, 'server'),
    '#backend/dataModel': join(generatedDir, 'dataModel'),
    '#backend/_generated': generatedDir,
    '#backend': backendDir,
  }
}

/** Register the `#backend/*` aliases for both Vite and Nitro. */
export function registerBackendAliases(nuxt: Nuxt): void {
  const aliases = getBackendAliases(nuxt.options.rootDir)

  nuxt.options.nitro ||= {}
  nuxt.options.nitro.alias ||= {}

  for (const [alias, target] of Object.entries(aliases)) {
    nuxt.options.alias[alias] = target
    nuxt.options.nitro.alias[alias] = target
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
