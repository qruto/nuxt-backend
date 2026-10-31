import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { addVitePlugin, type Resolver } from '@nuxt/kit'

// The English labels, one group at a time. `useLabels(group)` reads a group
// from the runtime's registry (runtime/vue/utils/label-registry.ts), and a
// module that calls it with a group's name written out (`useLabels('auth')`,
// `lookup('cancelFlow.reasons.price')`) gets that group imported and
// registered at its end, by the transform below. A page's chunks then carry
// the groups of the components it shows, and those groups arrive with the
// code that renders them: the server renders the words and hydration finds
// the same ones, with nothing to wait for. Without this module (a unit test,
// Vue without Nuxt) the registry starts with every group.

/** A module that may name a label group: it calls `useLabels`. */
const NAMES_LABELS = /\buseLabels\b/

/** A group named where a module reads it: `useLabels('auth'`, `useLabels<'auth'>('auth'`, `lookup('admin.tabs.`. */
const GROUP_NAMES = [
  /\buseLabels\s*(?:<[^<>()]*>)?\(\s*["'`](\w+)["'`]/g,
  /\blookup\(\s*["'`](\w+)\./g,
]

/**
 * The label groups a module's code names, among `groups`, in the order it
 * first names them. `errors` is never one: the registry always holds it, for
 * `errorMessage`.
 *
 * @internal
 */
export function labelGroupsIn(code: string, groups: ReadonlySet<string>): string[] {
  if (!NAMES_LABELS.test(code)) return []
  const named = GROUP_NAMES.flatMap(pattern => [...code.matchAll(pattern)].map(match => ({ group: match[1]!, at: match.index })))
    .sort((a, b) => a.at - b.at)
    .map(({ group }) => group)
  return [...new Set(named)].filter(group => group !== 'errors' && groups.has(group))
}

/**
 * `code` with the label groups it names imported and registered at its end,
 * or `null` when it names none. Appended rather than prepended: imports are
 * hoisted whatever their place, every line already there keeps its own (so
 * the source map stands as it is), and the registration runs as the module
 * loads, before anything it exports can render.
 *
 * @internal
 */
export function registerLabelGroups(code: string, files: ReadonlyMap<string, string>, registry: string): string | null {
  const groups = labelGroupsIn(code, new Set(files.keys()))
  if (groups.length === 0) return null
  const lines = [
    `import { registerLabels as __backendRegisterLabels } from ${JSON.stringify(registry)}`,
    ...groups.map(group => `import __backendLabels_${group} from ${JSON.stringify(files.get(group))}`),
    ...groups.map(group => `__backendRegisterLabels(${JSON.stringify(group)}, __backendLabels_${group})`),
  ]
  return `${code}\n${lines.join('\n')}\n`
}

/** Every label group's module, by group: `label-groups/<group>.ts` from source, `.js` once built. */
export function labelGroupFiles(dir: string): Map<string, string> {
  return new Map(readdirSync(dir)
    .filter(file => /\.(?:ts|js)$/.test(file) && !file.endsWith('.d.ts'))
    .map(file => [file.replace(/\.(?:ts|js)$/, ''), join(dir, file)]))
}

/** A module id without its query and extension: `/x/label-fallback.ts?v=1` → `/x/label-fallback`. */
const bare = (id: string) => id.replace(/\?.*$/, '').replace(/\.(?:ts|js|mjs)$/, '')

/**
 * Load the labels by group in the app's build: the transform that registers
 * each group a module names, and the registry's fallback emptied, so no page
 * ships the groups it does not name.
 */
export function registerLabels(resolver: Resolver): void {
  const files = labelGroupFiles(resolver.resolve('./convex/label-groups'))
  const registry = resolver.resolve('./runtime/vue/utils/label-registry')
  const fallback = resolver.resolve('./runtime/vue/utils/label-fallback')
  // Before Vite's own loading, so the stub replaces the file.
  addVitePlugin({
    name: 'nuxt-backend:labels-fallback',
    enforce: 'pre',
    load(id) {
      if (bare(id) === fallback) return 'export const EVERY_GROUP = undefined\n'
    },
  })
  // After Vue and TypeScript compiled the module: the code is JavaScript.
  addVitePlugin({
    name: 'nuxt-backend:labels',
    enforce: 'post',
    transform(code, id) {
      if (id.includes('/node_modules/') && !id.includes('/nuxt-backend/')) return
      if (id.includes('/label-groups/') || bare(id) === registry) return
      const registered = registerLabelGroups(code, files, registry)
      return registered === null ? undefined : { code: registered, map: null }
    },
  })
}
