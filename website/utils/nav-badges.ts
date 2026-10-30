import type { ContentNavigationItem } from '@nuxt/content'

/**
 * The navigation badges a page's `status` puts on its entry
 * (modules/docs-pages.ts), and the chrome hoists to where the surface they
 * mark starts: Experimental for the experimental tier, Planned for a page
 * that describes what is not built yet, Changing for a built page that
 * shows the API the release reshapes it into (shared/planned.ts).
 */
export const EXPERIMENTAL_BADGE = { label: 'Experimental', color: 'warning', variant: 'subtle' } as const
export const PLANNED_BADGE = { label: 'Planned', color: 'neutral', variant: 'subtle' } as const
export const CHANGING_BADGE = { label: 'Changing', color: 'warning', variant: 'outline' } as const

export type NavBadge = typeof EXPERIMENTAL_BADGE | typeof PLANNED_BADGE | typeof CHANGING_BADGE

/** The badge a page's `status` earns, if any. */
export function statusBadge(status: unknown): NavBadge | undefined {
  if (status === 'experimental') return EXPERIMENTAL_BADGE
  if (status === 'planned') return PLANNED_BADGE
  if (status === 'changing') return CHANGING_BADGE
  return undefined
}

/** A badge's label, whatever shape the navigation gave it. */
export function badgeLabel(badge: unknown): string | undefined {
  if (typeof badge === 'string') return badge
  const label = (badge as { label?: unknown } | undefined)?.label
  return typeof label === 'string' ? label : undefined
}

/** The sidebar's light for a badge: off for planned, amber for experimental and changing. */
export function badgeTone(badge: unknown): 'warn' | 'off' {
  return badgeLabel(badge) === PLANNED_BADGE.label ? 'off' : 'warn'
}

/** The light's shape: square for changing, so it never differs from experimental's amber by colour alone. */
export function badgeShape(badge: unknown): 'round' | 'square' {
  return badgeLabel(badge) === CHANGING_BADGE.label ? 'square' : 'round'
}

const labelOf = (item: ContentNavigationItem): string | undefined => badgeLabel(item.badge)

/**
 * The navigation with each badge where its surface starts: an entry whose
 * every page carries the same badge carries it once, and its pages none. A
 * whole tab of experimental pages (AI) is badged in the tab row, a group (the
 * MCP endpoint) on its name; a group of planned pages reads Planned on its
 * name. Children with different badges, or none, keep their own.
 */
export function hoistBadges(items: ContentNavigationItem[]): ContentNavigationItem[] {
  return items.map((item) => {
    if (!item.children?.length) return item
    const children = hoistBadges(item.children)
    const label = labelOf(children[0]!)
    if (!label || !children.every(child => labelOf(child) === label)) return { ...item, children }
    return { ...item, badge: children[0]!.badge, children: children.map(({ badge: _, ...child }) => child) }
  })
}
