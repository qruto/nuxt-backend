import { type ProbeFetch, probeBackend } from './backend-probe'

// Where the playground goes when it has no deployment to talk to
// (middleware/playground-offline.global.ts). A build without one (a Vercel
// preview, a checkout with no `.env.local`) still serves the docs, and the
// module's `auth` middleware would otherwise fail the gated playground pages
// on the server with the base module's "NUXT_PUBLIC_CONVEX_SITE_URL is not
// set": a 500 in place of the offline page. A build that names a deployment
// with nothing there (a local one that was stopped) failed the same way, on
// the token fetch, so a server render asks first and sends those visitors
// to the offline page too, with the page they asked for to go back to.

/** The offline page. */
export const OFFLINE_PATH = '/playground/offline'

/** What a deployment's answer is cached for, per server instance: about the deployment, not the request. */
export const PRESENT_TTL_MS = { present: 30_000, absent: 5_000 } as const

const isPlaygroundRoute = (path: string) => path === '/playground' || path.startsWith('/playground/')

/**
 * The playground page to go back to from the offline page: `from` when it is
 * one (a path of this site under /playground, never the offline page
 * itself), `/playground` otherwise.
 */
export function returnPath(from: unknown): string {
  if (typeof from !== 'string' || !/^\/playground(?:[/?#]|$)/.test(from) || from.startsWith(OFFLINE_PATH)) return '/playground'
  return from
}

let last: { siteUrl: string, present: boolean, at: number } | null = null

/**
 * Whether the deployment at `siteUrl` is there (shared/backend-probe.ts: not
 * `absent`). One probe per window per server instance, whatever the traffic,
 * a shorter window while it is absent so a restarted one is found again soon.
 */
export async function backendPresent(siteUrl: string, fetcher: ProbeFetch, now = Date.now()): Promise<boolean> {
  if (last && last.siteUrl === siteUrl && now - last.at < PRESENT_TTL_MS[last.present ? 'present' : 'absent']) return last.present
  const present = await probeBackend(siteUrl, fetcher) !== 'absent'
  last = { siteUrl, present, at: now }
  return present
}

/** Forget the cached answer (tests). */
export function forgetPresence(): void {
  last = null
}

/** What the middleware knows about the navigation it runs for. */
export interface OfflineContext {
  /** In the browser. */
  client: boolean
  /** The browser hydrating a server render: the server decided already, having asked. */
  hydrating: boolean
  /** The deployment's HTTP actions origin this build names, if any. */
  siteUrl?: string
  /** Whether the deployment is there; asked on a server render only. */
  present: (siteUrl: string) => Promise<boolean>
}

/**
 * Where the offline middleware sends a navigation, or `null` to let it
 * through. Only a server render asks the deployment: the browser keeps its
 * own connection state, and a page loaded online stays put.
 */
export async function offlineRedirect(to: { path: string, fullPath: string, query: Record<string, unknown> }, context: OfflineContext): Promise<string | null> {
  if (!isPlaygroundRoute(to.path)) return null
  if (context.client && context.hydrating) return null
  const online = Boolean(context.siteUrl) && (context.client || await context.present(context.siteUrl!))
  if (!online && to.path !== OFFLINE_PATH) {
    // A build with a deployment keeps the page to try again; one without has none to go back to.
    return context.siteUrl ? `${OFFLINE_PATH}?from=${encodeURIComponent(to.fullPath)}` : OFFLINE_PATH
  }
  if (online && to.path === OFFLINE_PATH) return returnPath(to.query.from)
  return null
}
