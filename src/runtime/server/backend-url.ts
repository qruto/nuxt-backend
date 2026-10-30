import { siteFromCloudUrl } from '../../convex/urls.js'

/**
 * The deployment's URLs at runtime. The package names the client URL
 * `NUXT_PUBLIC_BACKEND_URL`; the base module reads its own
 * `NUXT_PUBLIC_CONVEX_URL` and `NUXT_PUBLIC_CONVEX_SITE_URL`, and the server
 * render's auth-token prefetch fails ("Failed to prefetch auth token for
 * SSR") without the site one. A server that starts with only the package's
 * name gets both here: the client URL, and its `.convex.site` twin, which is
 * the HTTP routes' origin. A value the base module's own name already holds
 * wins, so a custom domain in front of the HTTP routes
 * (`NUXT_PUBLIC_CONVEX_SITE_URL`) is never replaced.
 *
 * The render and the server utilities read the runtime config per request,
 * with the environment applied, so setting the names once at start is enough.
 * A Nitro plugin that uses nothing of the Nitro app, so the same file runs on
 * Nitro 2 and Nitro 3.
 */
export default function backendUrlPlugin(): void {
  const env = process.env
  const url = (env.NUXT_PUBLIC_CONVEX_URL || env.NUXT_PUBLIC_BACKEND_URL)?.trim().replace(/\/+$/, '')
  if (!url) return
  env.NUXT_PUBLIC_CONVEX_URL ||= url
  const site = siteFromCloudUrl(url)
  if (site) env.NUXT_PUBLIC_CONVEX_SITE_URL ||= site
}
