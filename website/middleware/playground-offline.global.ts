import { backendPresent, offlineRedirect } from '~~/shared/playground-offline'

// The playground needs a deployment to talk to: without one, or with one
// that is not there, a playground page goes to the offline page instead of
// failing with a 500 on the server (shared/playground-offline.ts says when).
// Global middleware runs before a page's own, so redirect here first.
export default defineNuxtRouteMiddleware(async (to) => {
  const nuxtApp = useNuxtApp()
  const target = await offlineRedirect(to, {
    client: import.meta.client,
    hydrating: nuxtApp.isHydrating === true && Boolean(nuxtApp.payload.serverRendered),
    siteUrl: useRuntimeConfig().public.convex?.siteUrl,
    present: siteUrl => backendPresent(siteUrl, $fetch as never),
  })
  if (target) return navigateTo(target, { replace: true })
})
