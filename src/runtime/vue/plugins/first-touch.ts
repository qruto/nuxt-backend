import { defineNuxtPlugin, useRouter } from '#imports'
import { onEveryPage } from '../utils/every-page'

/** Whether a query carries any `utm_*` parameter. */
const tagged = (query: Record<string, unknown>): boolean => Object.keys(query).some(name => name.startsWith('utm_'))

/**
 * The growth funnel's first-touch campaign: on a page whose address
 * carries `utm_*` parameters, a signed-in person's campaign is sent to the
 * backend once (`recordSource`, kept as their first within a day of their
 * sign-up). Nothing is stored on the device. A page without the parameters
 * loads nothing here.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:first-touch',
  setup(nuxtApp) {
    const router = useRouter()
    const check = () => {
      const { query } = router.currentRoute.value
      if (!tagged(query)) return
      import('../utils/first-touch')
        .then(({ firstTouchClaim }) => nuxtApp.vueApp.runWithContext(firstTouchClaim)(query))
        .catch((cause: unknown) => {
          // Attribution is best effort: the person counts under "Direct or unknown".
          if (import.meta.dev) console.error('[nuxt-backend] the campaign could not be recorded:', cause)
        })
    }
    onEveryPage(nuxtApp, router, check)
  },
})
