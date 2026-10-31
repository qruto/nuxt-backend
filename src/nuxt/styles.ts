import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { resolveFunctionsDir } from '../aliases'
import { UI_ENTRIES, UI_INTERNALS, UI_SHARED_STYLES, uiPath, type UiCapability } from '../ui/registry'

// The package's stylesheets: the tokens, the shared rules, then one file per
// component and part (src/ui/registry.ts), each inside `@layer nuxt-backend`
// so any rule of the app's wins. Only the capabilities the app uses load
// their files, a part the app swapped loads none, and `css: false` loads
// nothing at all.

/**
 * The capabilities whose stylesheets load, as the build sees the app: every
 * app signs in, and billing is the app's once its functions directory holds
 * the billing catalog (`backend/billing.ts`, which `init` scaffolds and an
 * app may delete).
 *
 * @internal
 */
export function styledCapabilities(rootDir: string): Set<UiCapability> {
  const capabilities = new Set<UiCapability>(['auth'])
  const functionsDir = join(rootDir, resolveFunctionsDir(rootDir))
  if (['billing.ts', 'billing.js'].some(file => existsSync(join(functionsDir, file)))) capabilities.add('billing')
  if (['notifications.ts', 'notifications.js'].some(file => existsSync(join(functionsDir, file)))) capabilities.add('notifications')
  return capabilities
}

/**
 * The stylesheets to load, by path under the runtime's components folder
 * (`tokens.css`, `billing/PricingPlanCard.css`), each with the registered
 * name it styles (shared ones have none). Only files that exist: a part with
 * no rules of its own has no stylesheet.
 *
 * @internal
 */
export function packageStylesheets(componentsDir: string, capabilities: ReadonlySet<UiCapability>): Array<{ file: string, name?: string }> {
  const shared = UI_SHARED_STYLES.filter(style => capabilities.has(style.capability)).map(style => ({ file: style.file }))
  const own = [...UI_ENTRIES, ...UI_INTERNALS]
    .filter(entry => capabilities.has(entry.capability))
    .map(entry => ({ file: `${uiPath(entry)}.css`, name: entry.kind === 'internal' ? undefined : entry.name }))
  return [...shared, ...own].filter(style => existsSync(join(componentsDir, style.file)))
}

/**
 * Add the package's stylesheets ahead of the app's own CSS, unless
 * `css: false`. Once the components resolve, a registered name the app
 * replaced with a component of its own (a swapped or ejected part) drops
 * its packaged stylesheet: the app's file styles it, and an ejected copy
 * brings its own.
 */
export function registerStyles(css: boolean | undefined, resolver: Resolver, nuxt: Nuxt): void {
  if (css === false) return
  const componentsDir = resolver.resolve('./runtime/vue/components')
  const styles = packageStylesheets(componentsDir, styledCapabilities(nuxt.options.rootDir))
  const paths = new Map(styles.map(style => [join(componentsDir, style.file), style.name]))
  nuxt.options.css.unshift(...paths.keys())
  nuxt.hook('components:extend', (components) => {
    const ours = componentsDir.replaceAll('\\', '/')
    const replaced = new Set(components
      .filter(component => !component.filePath.replaceAll('\\', '/').startsWith(ours) && !component.filePath.includes('nuxt-backend/lazy/'))
      .map(component => component.pascalName))
    const dropped = [...paths].filter(([, name]) => name !== undefined && replaced.has(name)).map(([path]) => path)
    if (dropped.length) nuxt.options.css = nuxt.options.css.filter(path => !dropped.includes(path))
  })
}
