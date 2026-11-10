import { addPlugin, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

// What search engines are told of the app's pages: the `noindex` meta tag
// on the private pages when no @nuxtjs/robots answers their rule, and the
// site config an app's SEO modules read (nuxt-site-config, which
// @nuxtjs/robots, @nuxtjs/sitemap and @nuxtjs/seo install), from the kind of
// deploy the build is for. Left alone, nuxt-site-config takes the deployment's
// own URL (`VERCEL_URL`) for every build, and indexes whatever builds with
// `NODE_ENV=production`, so a preview is indexed under its one-off URL. A
// preview is its own site, the branch's stable URL, as `deploy --build` gives
// its backend (`SITE_URL`), and never indexable. A production build is left
// as nuxt-site-config reads it: its pages name the host a visitor came in on.
// The app's own `site` in nuxt.config, and `NUXT_SITE_*`, sit above this and
// win.

/**
 * nuxt-site-config's priority for this entry: above the host's env as it
 * reads it (`vendor`, -5), below the app's nuxt.config `site` (`config`, -3).
 * It ties with the request's origin (`nitro`, -4), and wins the tie: a
 * server pushes that entry first and the build's entries after it, so a
 * preview's pages name the branch's URL whichever URL served them.
 */
const DEPLOY_SITE_PRIORITY = -4

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
 * not indexable. Null on Vercel production and on any other build, which
 * nuxt-site-config reads as it does without this module.
 */
export function deploySiteConfig(env: Readonly<Record<string, string | undefined>>): DeploySiteConfig | null {
  const kind = env.VERCEL_ENV
  if (!kind || kind === 'production') return null
  const base = { _context: 'nuxt-backend:deploy', _priority: DEPLOY_SITE_PRIORITY } as const
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

/**
 * What search engines are told of the app's pages. Without @nuxtjs/robots
 * to answer the private pages' `robots: false` rule, the pages carry the
 * `noindex` meta tag themselves, decided once every module is installed,
 * whichever order they are listed in; and a preview build is a site of its
 * own ({@link registerDeploySiteConfig}).
 */
export function registerSearchIndexing(resolver: Resolver, nuxt: Nuxt): void {
  nuxt.hook('modules:done', () => {
    if (!hasNuxtModule('@nuxtjs/robots', nuxt)) addPlugin(resolver.resolve('./runtime/vue/plugins/noindex'))
  })
  registerDeploySiteConfig(nuxt)
}
