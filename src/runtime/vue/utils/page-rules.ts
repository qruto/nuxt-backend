import type { RouteLocationNormalized, Router } from 'vue-router'
import type { PageAccessRules } from './access-rules'

// What every navigation reads: a page's rules off its matched records,
// whether a route is the page a server render was for, and whether it asks
// for a sign-in. The global middleware and the session-ended plugin run on
// every page, so this file stays apart from what they load once a page
// asks for more: the check itself (./page-access.ts) and the session-ended
// watch (./session-end.ts).

/** Rules no one passes: a role from an empty list. */
const NO_ONE: PageAccessRules = Object.freeze({ role: [] })

/**
 * The rules every matched route record declares, a parent's first. A
 * JavaScript page may write what the type refuses: `auth: true` asks for a
 * sign-in alone, and any other value that is not an object (`auth: 'admin'`)
 * refuses everyone signed in. The guard fails closed rather than leave the
 * page open.
 */
export function pageAccessRules(route: Pick<RouteLocationNormalized, 'matched'>): PageAccessRules[] {
  return (route.matched ?? []).flatMap((record) => {
    const rules: unknown = record.meta?.auth
    if (rules === undefined || rules === null || rules === false) return []
    if (rules === true) return [{}]
    return [typeof rules === 'object' && !Array.isArray(rules) ? rules as PageAccessRules : NO_ONE]
  })
}

/** A path as the router compares two: no query or hash, no trailing slash, decoded. */
function comparablePath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0]!.replace(/\/+$/, '') || '/'
  try {
    return decodeURI(pathname)
  }
  catch {
    return pathname
  }
}

/**
 * Whether a route's path is the page a server render was for (the payload's
 * `path`, query included): the page whose rules the server already checked.
 */
export function samePagePath(path: string, rendered: string | undefined): boolean {
  return rendered !== undefined && comparablePath(path) === comparablePath(rendered)
}

/**
 * Whether a route asks for a sign-in: `definePageMeta({ auth })` on any
 * matched record (a parent's guards its children), which the page guard
 * enforces. It is the one page guard: there is no middleware to name.
 */
export function isAuthGuarded(route: Pick<RouteLocationNormalized, 'matched'>): boolean {
  return pageAccessRules(route).length > 0
}

/**
 * Run `start` once, after the first completed navigation to a page
 * `definePageMeta({ auth })` guards, or at once when the router is on one already.
 * Only such a page can have a session end under it, and it loads the auth
 * client anyway, so nothing before it pays for that client. The listener
 * goes once it has started.
 */
export function onFirstGuardedPage(router: Pick<Router, 'currentRoute' | 'afterEach'>, start: () => void): void {
  if (isAuthGuarded(router.currentRoute.value)) {
    start()
    return
  }
  const stop = router.afterEach((to, _from, failure) => {
    if (failure || !isAuthGuarded(to)) return
    stop()
    start()
  })
}

/** The robots meta tag of a page kept out of search indexes, as @nuxtjs/robots writes it for `robots: false`. */
export const NOINDEX_META = { name: 'robots', content: ['noindex', 'nofollow'].join(', ') }
