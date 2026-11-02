// WHAT THE SITE USES FROM VERCEL beside hosting, and where each part turns
// on. /docs/ship/deploy/vercel describes the whole setup for apps:
//
// - Web Analytics and Speed Insights, through their official Nuxt modules
//   (insightsModules): cookie-free, and only in a build on Vercel, where
//   their scripts are served from the site's own origin;
// - the docs assistant's model, through the AI Gateway (shared/assistant.ts);
// - rate limits from the Vercel Firewall (shared/firewall.ts);
// - error reports through the package's monitoring layer, from the
//   `NEXT_PUBLIC_SENTRY_DSN` Sentry's Vercel integration sets;
// - the build's routes, which serve each page's Markdown twin as Markdown
//   at every shape of its URL (untypePageHeaderRoutes).
//
// No imports, so plain Node loads it too.

/**
 * Whether the code runs on Vercel: a build or a function of a deployment,
 * which Vercel gives `VERCEL` and a `VERCEL_ENV` of `production` or
 * `preview`. `vercel env pull` writes `VERCEL="1"` into a local env file
 * too, beside `VERCEL_ENV="development"` and an OIDC token that expires
 * within hours: a machine that loads that file is not on Vercel.
 * shared/assistant.ts repeats the rule for the token, as it imports nothing.
 */
export function onVercel(env: Readonly<Record<string, string | undefined>>): boolean {
  return Boolean(env.VERCEL) && env.VERCEL_ENV !== 'development'
}

/**
 * The official Nuxt modules of Vercel's Web Analytics and Speed Insights.
 * Each adds a client plugin that loads its script from `/_vercel/…`, which
 * only Vercel serves: a build anywhere else would ask for a script that is
 * not there (and in dev, for a debug script from Vercel's CDN).
 */
export const INSIGHTS_MODULES = ['@vercel/analytics/nuxt', '@vercel/speed-insights/nuxt'] as const

/** The insights modules a build installs: both on Vercel, none anywhere else. */
export function insightsModules(env: Readonly<Record<string, string | undefined>>): string[] {
  return onVercel(env) ? [...INSIGHTS_MODULES] : []
}

/** A route of a Vercel build's config.json, as far as the site reads it. */
export interface VercelRoute {
  src?: string
  dest?: string
  status?: number
  headers?: Record<string, string>
  continue?: boolean
  [key: string]: unknown
}

/**
 * Take the HTML type off every route that only adds headers to a page, and
 * return how many it took it from. nuxt-security exports each prerendered
 * page's response headers to Vercel as such a route (`ssg.exportToPresets`),
 * `Content-Type: text/html` among them, on the page's exact path. Vercel
 * applies it to whatever answers that path, the Markdown twin
 * nuxt-agent-discovery rewrites a page to for `Accept: text/markdown` too:
 * `/docs/start` answered Markdown typed as HTML, while `/docs/start/`,
 * which no such route names, kept the twin's own type. A page's file is
 * `.html`, which Vercel types by itself.
 */
export function untypePageHeaderRoutes(routes: VercelRoute[]): number {
  let untyped = 0
  for (const route of routes) {
    if (!route.continue || route.dest || route.status || !route.headers) continue
    const headers = Object.entries(route.headers)
    const kept = headers.filter(([name, value]) => name.toLowerCase() !== 'content-type' || !value.startsWith('text/html'))
    if (kept.length === headers.length) continue
    route.headers = Object.fromEntries(kept)
    untyped++
  }
  return untyped
}
