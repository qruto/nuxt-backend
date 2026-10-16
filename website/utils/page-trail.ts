import type { ContentNavigationItem } from '@nuxt/content'

/** One step of a docs page's trail: a tab, a group or the page itself. */
export interface TrailStep {
  title: string
  path: string
  /** Whether a page answers at `path` (a folder without an index has none). */
  page: boolean
}

/** The navigation entries from the tab down to the page at `path`, or none. */
export function pageTrail(navigation: ContentNavigationItem[] | undefined, path: string): TrailStep[] {
  for (const item of navigation ?? []) {
    const step = { title: item.title, path: item.path, page: item.page !== false }
    if (item.path === path) return [step]
    const below = pageTrail(item.children, path)
    if (below.length > 0) return [step, ...below]
  }
  return []
}
