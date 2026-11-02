import { defineNuxtPlugin, useRouter } from '#imports'
import { onEveryPage } from '../utils/every-page'
import { CHECKOUT_RETURN_PARAM } from '../../../convex/constants.js'

/**
 * Finishes a return from checkout. The server sends a plan or pack checkout,
 * and a gift's claim, back with the checkout's id as `?checkout_return=`;
 * on a page that has it, this takes the parameter off the address and
 * refreshes the entitlements once, while
 * `useBilling().isFinishingCheckout` says so, which the billing section of
 * `<WorkspaceSettings>` and `<PricingTable>` read out as "Finishing your
 * purchase…". Always on. An app's own `checkout_id` is never touched.
 *
 * A page without the parameter loads nothing here: the backend client and
 * the refresh are imported only on a return.
 */
export default defineNuxtPlugin({
  name: 'nuxt-backend:checkout-return',
  setup(nuxtApp) {
    const router = useRouter()
    const check = () => {
      const route = router.currentRoute.value
      if (!(CHECKOUT_RETURN_PARAM in route.query)) return
      import('../utils/checkout-return')
        .then(({ entitlementSync, finishCheckoutReturn }) => finishCheckoutReturn({
          query: route.query,
          strip: query => router.replace({ path: route.path, query, hash: route.hash }),
          sync: () => nuxtApp.vueApp.runWithContext(entitlementSync)(),
        }))
        .catch((cause: unknown) => {
          // The address keeps the parameter; the webhooks still bring the plan.
          if (import.meta.dev) console.error('[nuxt-backend] the checkout return could not finish:', cause)
        })
    }
    // A return is a page load; a navigation inside the app can bring one too.
    onEveryPage(nuxtApp, router, check)
  },
})
