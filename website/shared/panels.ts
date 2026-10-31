import { base } from '../backend/routes'

// The site serves Panels, the app the tutorial builds, under /playground:
// scripts/sync-panels.mjs copies templates/panels here (its pages into
// pages/, its backend into backend/, with routes.ts saying where the pages
// are mounted), and nuxt.config.ts mounts them. Panels links by route name
// and by the module's page paths, never by a literal path, so the same files
// work at the root of the template and under /playground here.

/** Where Panels and the module's pages are mounted: backend/routes.ts's `base`. */
export const PANELS_BASE = base

/** A path under the playground: `/playground`, or `/playground/…`. */
export const isPlaygroundPath = (path: string): boolean => path === PANELS_BASE || path.startsWith(`${PANELS_BASE}/`)

/** The page files of the site's own (relative to pages/), which stay where their file puts them. */
const SITE_PAGE = /^(?:\[\[lang\]\]\/|login\.vue$|__parts\.vue$|playground\/)/

/** The part of a page's file under pages/, or `null` for a page from elsewhere (a layer's, the module's). */
function pageFile(file: string | undefined, pagesDir: string): string | null {
  if (!file) return null
  const normalized = file.split('\\').join('/')
  const dir = `${pagesDir.split('\\').join('/').replace(/\/$/, '')}/`
  return normalized.startsWith(dir) ? normalized.slice(dir.length) : null
}

/**
 * Mount the synced Panels pages under {@link PANELS_BASE}: every page of
 * `pagesDir` but the site's own (its docs, /login, the playground's landing
 * and offline page) moves from `/strips` to `/playground/strips`. Run in
 * `pages:extend` before the module mounts its pages, so it finds Panels'
 * welcome at the module's welcome path and leaves it the page, and the
 * admin console adopts Panels' Demo tab below its own path.
 */
export function mountPanelsPages(pages: Array<{ path: string, file?: string }>, pagesDir: string): void {
  for (const page of pages) {
    const file = pageFile(page.file, pagesDir)
    if (file === null || SITE_PAGE.test(file) || isPlaygroundPath(page.path)) continue
    page.path = page.path === '/' ? PANELS_BASE : `${PANELS_BASE}${page.path}`
  }
}
