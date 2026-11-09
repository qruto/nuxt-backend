import type { Nuxt } from '@nuxt/schema'

// The site config an app's SEO modules read (nuxt-site-config, which
// @nuxtjs/robots, @nuxtjs/sitemap and @nuxtjs/seo install), from the kind of
// deploy the build is for. Left alone, nuxt-site-config takes the deployment's
// own URL (`VERCEL_URL`) for every build, and indexes whatever builds with
// `NODE_ENV=production`, so a preview is indexed under its one-off URL. A
// preview is its own site, the branch's stable URL, as `deploy --build` gives
// its backend (`SITE_URL`), and never indexable; production is the project's
// production domain. The app's own `site` in nuxt.config, and `NUXT_SITE_*`,
// sit above this and win.

/**
 * nuxt-site-config's priority for this entry: above the host's env as it
 * reads it (`vendor`, -5), below the app's nuxt.config `site` (`config`, -3).
 */
export const DEPLOY_SITE_PRIORITY = -4

/** An entry of nuxt-site-config's stack. */
export interface DeploySiteConfig {
  _context: 'nuxt-backend:deploy'
  _priority: number
  url?: string
  indexable?: false
}

/**
 * What the deploy kind says of the site: on a Vercel preview (or `vercel
 * dev`'s development), the branch's stable URL, else the deployment's, and
 * not indexable; on Vercel production, the project's production domain.
 * Null on any other build, which nuxt-site-config reads as it does today.
 */
export function deploySiteConfig(env: Readonly<Record<string, string | undefined>>): DeploySiteConfig | null {
  const kind = env.VERCEL_ENV
  if (!kind) return null
  const base = { _context: 'nuxt-backend:deploy', _priority: DEPLOY_SITE_PRIORITY } as const
  if (kind === 'production') return env.VERCEL_PROJECT_PRODUCTION_URL ? { ...base, url: `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` } : null
  const host = env.VERCEL_BRANCH_URL || env.VERCEL_URL
  return { ...base, ...(host ? { url: `https://${host}` } : {}), indexable: false }
}

/** The part of nuxt-site-config's stack this module writes to. */
interface SiteConfigStack {
  push: (entry: DeploySiteConfig) => unknown
}

/**
 * Give an app's nuxt-site-config the deploy kind's site, when it has the
 * module: pushed when it resolves its stack (`site-config:resolve`), which it
 * does once every module is installed, whichever order they are listed in.
 */
export function registerDeploySiteConfig(nuxt: Nuxt, env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (nuxt.options.dev) return
  const entry = deploySiteConfig(env)
  if (!entry) return
  // The hook and the stack are nuxt-site-config's, typed only where it is installed.
  const hook = nuxt.hook as unknown as (name: string, run: () => void) => void
  hook('site-config:resolve', () => {
    (nuxt as unknown as { _siteConfig?: SiteConfigStack })._siteConfig?.push(entry)
  })
}
