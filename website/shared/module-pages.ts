import { BACKEND_PAGE_DEFS } from '../../src/pages'
import { PANELS_BASE } from './panels'

// Where the module's pages mount on this site: in the playground, beside
// Panels (shared/panels.ts), as they would at the root of an app made from
// the template, so the site serves no indexable `/pricing`. `/login` is the
// site's own page (pages/login.vue), at the module's default path. A page
// the module adds later lands in the playground without an edit here.
// nuxt.config.ts hands MODULE_PAGES to the module (`backend.pages`).

/** The module pages that stay at their default path, by key: the site's own sign-in. */
export const ROOT_PAGES: ReadonlySet<string> = new Set(['login'])

/** Every other module page, by key, under the playground. */
export const MODULE_PAGES: Record<string, string> = Object.fromEntries(BACKEND_PAGE_DEFS
  .filter(def => !ROOT_PAGES.has(def.key))
  .map(def => [def.key, `${PANELS_BASE}${def.defaultPath}`]))

/** Where the module pages left at the root mount: the running app, not docs, so no agent surface lists them. */
export const ROOT_MODULE_PATHS: readonly string[] = BACKEND_PAGE_DEFS
  .filter(def => ROOT_PAGES.has(def.key))
  .map(def => def.defaultPath)
