import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODULE_PAGES } from '../../website/shared/module-pages'
import { mountPanelsPages } from '../../website/shared/panels'

const pagesDir = fileURLToPath(new URL('../../website/pages', import.meta.url))

/** Every `.vue` file under `dir`, recursively. */
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? vueFiles(path) : entry.name.endsWith('.vue') ? [path] : []
  })
}

/** A page file's route as Nuxt names it: `strips/[id].vue` → `/strips/:id`. */
const routeOf = (file: string) => `/${relative(pagesDir, file).split('\\').join('/')
  .replace(/\.vue$/, '')
  .replace(/(?:^|\/)index$/, '')
  .replace(/\[([^\]]+)\]/g, ':$1')}`.replace(/(.)\/$/, '$1')

/**
 * Every route the site serves under /playground: Panels' pages where the
 * site's `pages:extend` hook mounts them (website/shared/panels.ts), its
 * own landing and offline page, and the module's pages where
 * website/shared/module-pages.ts mounts them.
 */
export function playgroundRoutes(): string[] {
  const pages = vueFiles(pagesDir).map(file => ({ path: routeOf(file), file }))
  mountPanelsPages(pages, pagesDir)
  return [...new Set([...pages.map(page => page.path), ...Object.values(MODULE_PAGES)])]
    .filter(path => path === '/playground' || path.startsWith('/playground/'))
    .sort()
}
