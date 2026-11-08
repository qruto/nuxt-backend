import { addNitroPlugin, hasNuxtModule, type Resolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import { defu } from 'defu'
import { TRUSTED_TYPES_POLICIES } from '../runtime/vue/trusted-types'
import { appBrandLogoPath } from './brand'

/**
 * What the package asks of `nuxt-security`, under the app's own options
 * (the app's `security` config wins key by key, `false` included):
 *
 * - a nonce on every script and style the server renders (`nonce: true`,
 *   nuxt-security's own default, said here so the policy below never runs
 *   without it), which the default `script-src` trusts with
 *   `'strict-dynamic'`;
 * - `worker-src 'self'` and `manifest-src 'self'`: the web push worker and
 *   the web app manifest the module serves are the app's own, so
 *   registering them never depends on how a browser reads the policy's
 *   fallback;
 * - Trusted Types, in a production build: `require-trusted-types-for
 *   'script'`, with the policies the package creates (`vue`, `nuxt-backend`
 *   and the narrow `default`, src/runtime/vue/trusted-types.ts). Not in
 *   development, where Vite's error overlay writes markup no policy passes;
 * - in development, no request limiter, no `upgrade-insecure-requests` and
 *   no HSTS. Every reload, DevTools probe and test run counts against the
 *   limiter, whose 429s read as page failures, and on a plain-http dev port
 *   Safari obeys the other two for localhost, so every asset goes to
 *   https:// and fails. A production build keeps all three.
 *
 * An app that loads code which writes sinks itself lists that code's policy
 * in `trusted-types`, or turns the requirement off with
 * `'require-trusted-types-for': false`.
 */
export function securityDefaults(dev: boolean): Record<string, unknown> {
  const own = { 'worker-src': ['\'self\''], 'manifest-src': ['\'self\''] }
  if (dev) {
    return {
      nonce: true,
      rateLimiter: false,
      headers: {
        contentSecurityPolicy: { ...own, 'upgrade-insecure-requests': false },
        strictTransportSecurity: false,
      },
    }
  }
  return {
    nonce: true,
    headers: {
      contentSecurityPolicy: {
        ...own,
        'require-trusted-types-for': '\'script\'',
        'trusted-types': [...TRUSTED_TYPES_POLICIES],
      },
    },
  }
}

/**
 * Whether the app set `security: false` (nuxt-security's own switch): the
 * package then installs no nuxt-security and adds no Trusted Types plugin.
 * Nuxt 4.6 types the resolved option as the module's options object, but the
 * value is still whatever nuxt.config wrote.
 */
export function securityDisabled(nuxt: Pick<Nuxt, 'options'>): boolean {
  return (nuxt.options.security as unknown) === false
}

/** nuxt-og-image's rendered Open Graph images, which social scrapers and link unfurls fetch from other sites. */
export const OG_IMAGE_ROUTE = '/_og/**'

/**
 * A route other sites may load as a resource: `Cross-Origin-Resource-Policy:
 * cross-origin` in place of the app-wide `same-origin`. Said twice, as the
 * Nitro header a static file is served with and as nuxt-security's own
 * route option, since the rule is added after nuxt-security turned the
 * app's rules into headers.
 */
const CROSS_ORIGIN_RESOURCE = {
  headers: { 'Cross-Origin-Resource-Policy': 'cross-origin' },
  security: { headers: { crossOriginResourcePolicy: 'cross-origin' as const } },
}

/** Let other sites load the resources at `paths`, under any rule of the app's own for them, which wins. */
export function allowCrossOriginResources(nuxt: Pick<Nuxt, 'options'>, paths: readonly string[]): void {
  const routeRules = (nuxt.options.routeRules ??= {})
  for (const path of paths) routeRules[path] = defu(routeRules[path], CROSS_ORIGIN_RESOURCE) as typeof routeRules[string]
}

/**
 * Keep the case of a canonical URL where nuxt-seo-utils is installed (alone
 * or through `@nuxtjs/seo`): its `seo.canonicalLowercase` lowercases every
 * canonical and `og:url`, which turns a link with a case-sensitive token
 * (a share link, `storage.shareable`) into a dead one. The package's
 * default is `false`, written into the module's public runtime config
 * (`seo-utils.canonicalLowercase`) once every module has set up; an app
 * that sets `seo.canonicalLowercase` itself keeps its own value.
 */
export function keepCanonicalCase(nuxt: Pick<Nuxt, 'options'>): void {
  const seoUtils = (nuxt.options.runtimeConfig.public as Record<string, unknown>)['seo-utils'] as { canonicalLowercase?: boolean } | undefined
  if (!seoUtils || typeof seoUtils !== 'object') return
  const own = (nuxt.options as { seo?: { canonicalLowercase?: unknown } }).seo?.canonicalLowercase
  if (own === undefined) seoUtils.canonicalLowercase = false
}

/**
 * The security headers' exceptions for what the app serves to other sites
 * or runs itself, and the canonical URLs' case:
 *
 * - `Cross-Origin-Resource-Policy: cross-origin` on nuxt-og-image's
 *   `/_og/**` and on the brand's logo when the app serves it
 *   (`appConfig.backend.brand.logo`, a path), which emails and link unfurls
 *   load from other sites; nuxt-security's app-wide `same-origin` refuses
 *   them otherwise;
 * - `'wasm-unsafe-eval'` in `script-src` when `@nuxt/content` is installed
 *   (src/runtime/server/content-wasm.ts);
 * - the case of canonical URLs kept ({@link keepCanonicalCase}).
 *
 * The first two only while nuxt-security is installed: with `security:
 * false` there is no header to make an exception to. `convex.security:
 * false` turns off the base module's Convex sources alone, so they stay.
 */
export function registerSecurityRules(resolver: Resolver, nuxt: Nuxt): void {
  const headers = !securityDisabled(nuxt)
  if (headers) allowCrossOriginResources(nuxt, [OG_IMAGE_ROUTE])
  nuxt.hook('modules:done', async () => {
    keepCanonicalCase(nuxt)
    if (!headers) return
    const logo = await appBrandLogoPath(nuxt)
    if (logo) allowCrossOriginResources(nuxt, [logo])
    if (hasNuxtModule('@nuxt/content', nuxt)) {
      const plugin = resolver.resolve('./runtime/server/content-wasm')
      addNitroPlugin({ nitro2: plugin, nitro3: plugin })
    }
  })
}
