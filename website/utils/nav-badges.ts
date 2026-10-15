import type { ContentNavigationItem } from '@nuxt/content'

/**
 * The navigation badge of an experimental page (`status: experimental`),
 * which modules/docs-pages.ts puts on the page's entry and the chrome
 * hoists to where the experimental surface starts.
 */
export const EXPERIMENTAL_BADGE = { label: 'Experimental', color: 'warning', variant: 'subtle' } as const

const badged = (item: ContentNavigationItem) => item.badge !== undefined

/**
 * The navigation with each Experimental badge where its surface starts: an
 * entry whose every page is experimental carries one badge, and its pages
 * none. A whole tab of them (AI) is badged in the tab row, and a group (the
 * MCP endpoint) on its name.
 */
export function hoistExperimental(items: ContentNavigationItem[]): ContentNavigationItem[] {
  return items.map((item) => {
    if (!item.children?.length) return item
    const children = hoistExperimental(item.children)
    if (!children.every(badged)) return { ...item, children }
    return { ...item, badge: EXPERIMENTAL_BADGE, children: children.map(({ badge: _, ...child }) => child) }
  })
}
