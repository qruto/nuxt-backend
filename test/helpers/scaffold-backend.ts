import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vitest/config'

/** A directory as Vite writes module ids: forward slashes, on Windows too. */
const dir = (path: string) => fileURLToPath(new URL(path, import.meta.url)).replaceAll('\\', '/')
const root = dir('../../')
/** The backends run as an app runs them: the scaffold, and the Panels template's. */
const backends = [dir('../fixtures/registration/backend/'), dir('../../templates/panels/backend/')]

/** What `convex codegen` writes as JavaScript: generic builders and references, the same in every app. */
const GENERATED: Record<string, string> = {
  api: `import { anyApi, componentsGeneric } from 'convex/server'
export const api = anyApi
export const internal = anyApi
export const components = componentsGeneric()`,
  server: `export {
  queryGeneric as query,
  internalQueryGeneric as internalQuery,
  mutationGeneric as mutation,
  internalMutationGeneric as internalMutation,
  actionGeneric as action,
  internalActionGeneric as internalAction,
  httpActionGeneric as httpAction,
} from 'convex/server'
export const env = process.env`,
}

const VIRTUAL = '\0scaffold-generated:'

/**
 * Run `test/fixtures/registration/backend`, the scaffold an app gets, and
 * `templates/panels/backend`, the tutorial's app, as that app would: its `nuxt-backend/*` imports resolve to this package
 * through its `exports`, as from the app's node_modules, and
 * `./_generated/api` and `./_generated/server` to what codegen writes. No
 * codegen and no deployment, so a test can load every module the scaffold
 * ships and call its functions with `nuxt-backend/test`.
 */
export function scaffoldBackend(): Plugin {
  return {
    name: 'nuxt-backend:scaffold-backend',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!backends.some(backend => importer?.startsWith(backend))) return null
      if (source.startsWith('nuxt-backend/')) return await this.resolve(source, `${root}vitest.config.ts`, { skipSelf: true })
      const generated = /^\.\/_generated\/(api|server)(?:\.js)?$/.exec(source)?.[1]
      return generated ? VIRTUAL + generated : null
    },
    load(id) {
      return id.startsWith(VIRTUAL) ? GENERATED[id.slice(VIRTUAL.length)] : null
    },
  }
}
