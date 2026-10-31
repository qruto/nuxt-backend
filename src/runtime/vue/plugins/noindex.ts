import { defineNuxtPlugin, useHead, useRouter } from '#imports'
import { isAuthGuarded, NOINDEX_META } from '../utils/page-rules'

/**
 * Keeps a private page out of search indexes with the page's own
 * `<meta name="robots" content="noindex, nofollow">`: every page
 * `definePageMeta({ auth })` guards, the package's and the app's, and
 * everything below an `auth` parent (the admin console's tabs). The route
 * rule `robots: false` says the same through @nuxtjs/robots and
 * @nuxtjs/sitemap; this is what stands without them. The module leaves the
 * plugin out when @nuxtjs/robots is installed, since that module answers the
 * rule (and a rule of the app's, `robots: true`, indexes the page again). A
 * page's own `useSeoMeta({ robots })` runs after this and wins.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:noindex',
  setup() {
    const router = useRouter()
    useHead(() => ({
      meta: isAuthGuarded(router.currentRoute.value) ? [NOINDEX_META] : [],
    }))
  },
})
