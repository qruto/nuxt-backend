import { posix } from 'node:path'
import { at, read, walk } from './helpers'

/**
 * A name split into words the way Nuxt splits it: scule's `splitByCase`
 * (scule 1.3, MIT), which Nuxt names components with. On `-`, `_`, `/` and
 * `.`, before an uppercase letter after a lowercase one, and before the last
 * capital of a run that a lowercase letter follows (`HTMLElement`).
 */
export function splitByCase(text: string): string[] {
  const parts: string[] = []
  if (!text) return parts
  const isUpper = (char: string) => /\d/.test(char) ? undefined : char !== char.toLowerCase()
  let buffer = ''
  let previousUpper: boolean | undefined
  let previousSplitter: boolean | undefined
  for (const char of text) {
    if (['-', '_', '/', '.'].includes(char)) {
      parts.push(buffer)
      buffer = ''
      previousUpper = undefined
      continue
    }
    const upper = isUpper(char)
    if (previousSplitter === false) {
      if (previousUpper === false && upper === true) {
        parts.push(buffer)
        buffer = char
        previousUpper = upper
        continue
      }
      if (previousUpper === true && upper === false && buffer.length > 1) {
        parts.push(buffer.slice(0, -1))
        buffer = buffer.at(-1)! + char
        previousUpper = upper
        continue
      }
    }
    buffer += char
    previousUpper = upper
    previousSplitter = false
  }
  parts.push(buffer)
  return parts
}

/** scule's `pascalCase`: each word with its first letter raised, joined. */
export function pascalCase(words: string | string[]): string {
  return (Array.isArray(words) ? words : splitByCase(words)).map(word => word ? word[0]!.toUpperCase() + word.slice(1) : '').join('')
}

/**
 * The name Nuxt registers a component file under, from the components
 * directory that holds it: the folders before the file name, less any that
 * the file name repeats (Nuxt 4.6's `resolveComponentNameSegments`).
 * `docs/PageHeaderLinks.vue` is `DocsPageHeaderLinks`, `app/AppHeader.vue`
 * is `AppHeader`, `home/Hero.vue` is `HomeHero`.
 */
export function nuxtComponentName(file: string, dir: string): string {
  const toPosix = (path: string) => path.split('\\').join('/')
  const prefixParts = splitByCase(posix.relative(toPosix(dir), posix.dirname(toPosix(file))))
  let fileName = posix.basename(toPosix(file)).replace(/\.\w+$/, '').replace(/(?:\.(?:client|server))?(?:\.global|\.island)*$/, '')
  if (fileName.toLowerCase() === 'index') fileName = ''
  const fileNameParts = splitByCase(fileName.replace(/["']/g, ''))
  const fileNameContent = fileNameParts.join('/').toLowerCase()
  const prefixes = prefixParts.filter(part => !/^\(.*\)$/.test(part.trim()))
  const nameParts = prefixes.flatMap(part => splitByCase(part))
  const matched: string[] = []
  for (let index = prefixes.length - 1; index >= 0; index--) {
    const prefix = prefixes[index]!
    matched.unshift(...splitByCase(prefix).map(part => part.toLowerCase()))
    const matchedContent = matched.join('/')
    if (fileNameContent === matchedContent || fileNameContent.startsWith(`${matchedContent}/`) || (prefix.toLowerCase() === fileNameContent && prefixes[index + 1] === prefix)) {
      nameParts.length = index
    }
  }
  return pascalCase([...nameParts, ...fileNameParts])
}

/**
 * The components in `dir` (relative to the repo root), by the name Nuxt
 * registers them under. `OgImage/` is left out: nuxt-og-image registers
 * those cards itself, under names of its own.
 */
export function componentsIn(dir: string): Map<string, string> {
  const files = walk(dir, ['.vue', '.ts'], path => path.endsWith('/OgImage'))
  return new Map(files.map(file => [nuxtComponentName(file, at(dir)), file]))
}

/** The site's own components (website/components), by the name Nuxt registers them under. */
export const siteComponents = () => componentsIn('website/components')

/**
 * The components a template or a Markdown page names: `<HomeHero>`,
 * `<home-hero>`, `<LazyDemoSignInLive>` (as `DemoSignInLive`) and MDC's
 * `::home-hero`.
 */
export function namedComponents(source: string): string[] {
  const tags = [
    ...[...source.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map(match => match[1]!),
    ...[...source.matchAll(/<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)[\s/>]/g)].map(match => pascalCase(match[1]!)),
    ...[...source.matchAll(/^\s*:{2,}([a-z][\w-]*)/gm)].map(match => pascalCase(match[1]!)),
  ]
  return [...new Set(tags.map(tag => tag.replace(/^Lazy(?=[A-Z])/, '')))]
}

/**
 * A call that needs the backend client: the module's composables (all but
 * `useBackendConfig`, `useLabels` and `useBackendPagePath`, which read app
 * and runtime config), the base module's and their aliases, and
 * `$loadBackendClient` itself.
 */
export const BACKEND_CALL = (() => {
  const own = walk('src/runtime/vue/composables', ['.ts'])
    .flatMap(file => [...read(file).matchAll(/export (?:async )?(?:function|const) (use[A-Z]\w*)/g)].map(match => match[1]!))
    .filter(name => !['useBackendConfig', 'useLabels', 'useBackendPagePath'].includes(name))
  const base = ['useQuery', 'useQueries', 'usePaginatedQuery', 'useMutation', 'useAction', 'useConvex\\w*', 'useConnectionState', 'useAuthState', 'useBetterAuth']
  return new RegExp(`\\b(?:${[...own, ...base].join('|')})\\(|\\$loadBackendClient\\b`)
})()

/** Every site component reachable from `start` (component names), through the components their templates name. */
export function reachableComponents(start: readonly string[], components = siteComponents()): Map<string, string> {
  const reached = new Map<string, string>()
  const queue = [...start]
  while (queue.length > 0) {
    const name = queue.shift()!
    const file = components.get(name)
    if (!file || reached.has(name)) continue
    reached.set(name, file)
    queue.push(...namedComponents(read(file)))
  }
  return reached
}

/** Whether a component, or one it reaches, needs the backend client. */
export function needsBackend(name: string, components = siteComponents()): boolean {
  return [...reachableComponents([name], components).values()].some(file => BACKEND_CALL.test(read(file)))
}
