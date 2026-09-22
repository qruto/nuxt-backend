// The playground needs a live deployment. A build without one (a Vercel
// preview, a checkout with no `.env.local`) still serves the docs, and the
// module's `auth` middleware would otherwise fail the gated playground pages
// on the server with the base module's "NUXT_PUBLIC_CONVEX_SITE_URL is not
// set" — a 500 in place of the documented offline state. Global middleware
// runs before a page's own, so redirect here first.
const OFFLINE_PATH = '/playground/offline'

const isPlaygroundRoute = (path: string) =>
  path === '/playground' || path.startsWith('/playground/')

export default defineNuxtRouteMiddleware((to) => {
  if (!isPlaygroundRoute(to.path)) return
  const online = Boolean(useRuntimeConfig().public.convex?.siteUrl)
  if (!online && to.path !== OFFLINE_PATH) return navigateTo(OFFLINE_PATH, { replace: true })
  if (online && to.path === OFFLINE_PATH) return navigateTo('/playground', { replace: true })
})
